// ============================================================
// 服务器主入口（Phase 2）
// Express HTTP + Socket.io + RoomManager + 公网URL显示
// ============================================================

import 'dotenv/config'
import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import cors from 'cors'
import { networkInterfaces } from 'node:os'
import { registerHandlers } from './socket/handlers'
import { RoomManager } from './rooms/RoomManager'
import { logger } from './utils/logger'

// ── 全局未捕获异常保护（防止单个房间错误崩溃整个服务） ──────
process.on('uncaughtException', (err) => {
  logger.error('Server', `未捕获异常 (进程继续运行): ${err.stack ?? err}`)
})
process.on('unhandledRejection', (reason) => {
  logger.error('Server', `未处理的 Promise 拒绝: ${reason}`)
})

const PORT       = Number(process.env.PORT   ?? 3000)
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5173)
const ORIGIN     = process.env.CORS_ORIGIN  ?? `http://localhost:${CLIENT_PORT}`
// 若使用 cloudflared 或内网穿透，设置此变量，例如:
// PUBLIC_URL=https://xxxx.trycloudflare.com
const PUBLIC_URL = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '')

// ── 获取局域网IP ─────────────────────────────────────────────
function getLanIP(): string {
  const nets = networkInterfaces()
  for (const list of Object.values(nets)) {
    if (!list) continue
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return 'localhost'
}

const LAN_IP   = getLanIP()
// 公网 URL 优先用 PUBLIC_URL，其次 LAN
const SHARE_BASE = PUBLIC_URL || `http://${LAN_IP}:${CLIENT_PORT}`

// ── Express 应用 ────────────────────────────────────────────
const app = express()
app.use(express.json())
app.use(cors({ origin: ORIGIN.split(','), credentials: true }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now(), version: '0.2.0' })
})
app.get('/', (_req, res) => {
  res.send(`Texas Hold'em Server v0.2 — 访问前端: ${SHARE_BASE}`)
})

// ── HTTP / Socket.io ─────────────────────────────────────────
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: ORIGIN.split(','), methods: ['GET', 'POST'], credentials: true },
  path: '/socket.io',
  transports: ['websocket', 'polling'],
})

// ── RoomManager（全局单例） ──────────────────────────────────
const roomManager = new RoomManager(io, SHARE_BASE)

// ── 注册 Socket 事件 ────────────────────────────────────────
io.on('connection', (socket) => {
  registerHandlers(io, socket, roomManager)
})

// ── 定期打印统计 ─────────────────────────────────────────────
setInterval(() => {
  const conns  = io.sockets.sockets.size
  const rooms  = roomManager.list()
  if (conns > 0) {
    logger.info('Server', `在线连接: ${conns}，活跃房间: ${rooms.length}`)
  }
}, 30_000)

// ── 启动 ─────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  const sep = '━'.repeat(48)
  logger.info('Server', sep)
  logger.info('Server', `  🎴  Texas Hold'em Server 已启动`)
  logger.info('Server', sep)
  logger.info('Server', `  本机访问  : http://localhost:${CLIENT_PORT}`)
  logger.info('Server', `  局域网访问: http://${LAN_IP}:${CLIENT_PORT}`)
  if (PUBLIC_URL) {
    logger.info('Server', `  公网访问  : ${PUBLIC_URL}`)
    logger.info('Server', `  ★ 此地址可分享给任何人直接访问 ★`)
  } else {
    logger.info('Server', `  公网访问  : 未设置 PUBLIC_URL`)
    logger.info('Server', `  ─ 若要公网访问，运行 cloudflared:`)
    logger.info('Server', `    cloudflared tunnel --url http://localhost:${CLIENT_PORT}`)
    logger.info('Server', `    然后将输出的 https://xxxx.trycloudflare.com 设为 PUBLIC_URL`)
  }
  logger.info('Server', `  后端 API   : http://localhost:${PORT}`)
  logger.info('Server', sep)
})
