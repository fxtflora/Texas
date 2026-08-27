// ============================================================
// socket/handlers.ts — 完整事件路由（Phase 2）
// ============================================================

import type { Server, Socket } from 'socket.io'
import type { RoomManager } from '../rooms/RoomManager'
import type {
  CreateRoomPayload, JoinRoomPayload, GameActionPayload,
  HostUpdateConfigPayload, HostAddBotPayload,
} from '@shared/types'
import { logger } from '../utils/logger'

const TAG = 'handlers'

function ok(fn: () => void): void {
  try { fn() } catch (err) { logger.error(TAG, `未捕获异常: ${err}`) }
}

export function registerHandlers(io: Server, socket: Socket, roomManager: RoomManager): void {
  // ── 心跳 ──────────────────────────────────────────────────
  socket.on('ping', (cb: (s: string) => void) => {
    if (typeof cb === 'function') cb('pong')
  })

  // ── 房间创建 ─────────────────────────────────────────────
  socket.on('room:create', (payload: CreateRoomPayload) => ok(() => {
    const { nickname, sessionToken, config } = payload
    if (!nickname?.trim()) { socket.emit('error', { code: 'BAD_PARAM', message: '请输入昵称' }); return }
    if (!sessionToken) { socket.emit('error', { code: 'BAD_PARAM', message: '缺少 sessionToken' }); return }

    const room   = roomManager.create(config ?? {})
    const result = room.join(socket, nickname, sessionToken)

    if (!result.ok) { socket.emit('error', { code: 'JOIN_FAIL', message: result.reason }); return }

    const roomState = room.toPublicState()
    socket.emit('room:joined', {
      roomState,
      myId:         socket.id,
      myRole:       result.player!.role,
      sessionToken,
      shareUrl:     roomState.shareUrl,
      myCards:      result.player!.holeCards ?? undefined,
    })
    logger.socket(TAG, `[${room.code}] 房间创建, 房主=${nickname}, URL=${roomState.shareUrl}`)
  }))

  // ── 加入房间 ─────────────────────────────────────────────
  socket.on('room:join', (payload: JoinRoomPayload) => ok(() => {
    const { code, nickname, sessionToken, asSpectator } = payload
    if (!code?.trim() || !nickname?.trim()) {
      socket.emit('error', { code: 'BAD_PARAM', message: '房间码或昵称无效' }); return
    }
    const room = roomManager.get(code)
    if (!room) { socket.emit('error', { code: 'ROOM_NOT_FOUND', message: `未找到房间 ${code}` }); return }

    const result = room.join(socket, nickname, sessionToken, asSpectator)
    if (!result.ok) { socket.emit('error', { code: 'JOIN_FAIL', message: result.reason }); return }

    const roomState = room.toPublicState()
    socket.emit('room:joined', {
      roomState,
      myId:         socket.id,
      myRole:       result.player!.role,
      sessionToken,
      shareUrl:     roomState.shareUrl,
      myCards:      result.player!.holeCards ?? undefined,
    })
    // 通知房间其他人
    socket.to(room.code).emit('room:state', roomState)
    logger.socket(TAG, `[${room.code}] ${nickname} 加入成功`)
  }))

  // ── 离开房间 ─────────────────────────────────────────────
  socket.on('room:leave', () => ok(() => {
    roomManager.handleDisconnect(socket.id)
  }))

  // ── 准备就绪 ─────────────────────────────────────────────
  socket.on('room:ready', (ready: boolean) => ok(() => {
    for (const room of (roomManager as any).rooms.values() as IterableIterator<import('../rooms/GameRoom').GameRoom>) {
      if (room.hasSocket(socket.id)) {
        room.setReady(socket.id, ready ?? true)
        break
      }
    }
  }))

  // ── 房主：更新房间配置 ─────────────────────────────────
  socket.on('host:updateConfig', (payload: HostUpdateConfigPayload) => ok(() => {
    const room = findRoom(roomManager, socket.id)
    if (!room) return
    room.updateConfig(socket.id, payload.config)
    room.broadcastRoomState()
  }))

  // ── 房主：添加机器人 ──────────────────────────────────
  socket.on('host:addBot', (payload: HostAddBotPayload) => ok(() => {
    const room = findRoom(roomManager, socket.id)
    if (!room) { socket.emit('error', { code: 'NOT_IN_ROOM', message: '未在房间中' }); return }
    room.addBot(socket.id, payload?.difficulty)
  }))

  // ── 房主：移除机器人 ──────────────────────────────────
  socket.on('host:removeBot', (payload: { botId: string }) => ok(() => {
    const room = findRoom(roomManager, socket.id)
    if (!room) return
    room.removeBot(socket.id, payload.botId)
  }))

  // ── 房主：开始游戏 ────────────────────────────────────
  socket.on('host:startGame', () => ok(() => {
    const room = findRoom(roomManager, socket.id)
    if (!room) { socket.emit('error', { code: 'NOT_IN_ROOM', message: '未在房间中' }); return }
    const result = room.startGame(socket.id)
    if (!result.ok) socket.emit('error', { code: 'START_FAIL', message: result.reason })
  }))

  // ── 游戏操作 ─────────────────────────────────────────
  socket.on('game:action', (payload: GameActionPayload) => ok(() => {
    const room = findRoom(roomManager, socket.id)
    if (!room) { socket.emit('error', { code: 'NOT_IN_ROOM', message: '未在房间中' }); return }
    room.doAction(socket.id, payload)
  }))

  // ── 房主：开始下一局 ──────────────────────────────────
  socket.on('host:nextHand', () => ok(() => {
    const room = findRoom(roomManager, socket.id)
    if (!room) return
    room.hostNextHand(socket.id)
  }))

  // ── 玩家：选择是否亮牌（弃牌获胜后） ─────────────────
  socket.on('game:showCards', (payload: { show: boolean }) => ok(() => {
    const room = findRoom(roomManager, socket.id)
    if (!room) return
    room.playerShowCards(socket.id, payload?.show ?? false)
  }))

  // ── 玩家：筹码清零后选择充值继续 ──────────────────────
  socket.on('player:rebuy', () => ok(() => {
    const room = findRoom(roomManager, socket.id)
    if (!room) return
    room.playerRebuy(socket.id)
  }))

  // ── 玩家：筹码清零后选择成为观众 ──────────────────────
  socket.on('player:sitOut', () => ok(() => {
    const room = findRoom(roomManager, socket.id)
    if (!room) return
    room.playerSitOut(socket.id)
  }))

  // ── 房主：转让房主 ──────────────────────────────────────
  socket.on('room:transferHost', (payload: { targetId: string }) => ok(() => {
    const room = findRoom(roomManager, socket.id)
    if (!room) return
    room.transferHost(socket.id, payload?.targetId)
  }))

  // ── 观众：私密查看某玩家手牌 ──────────────────────────
  socket.on('spectator:requestCards', (payload: { targetPlayerId: string }) => ok(() => {
    const room = findRoom(roomManager, socket.id)
    if (!room) return
    room.spectatorRequestCards(socket.id, payload?.targetPlayerId)
  }))

  // ── 断线处理 ─────────────────────────────────────────
  socket.on('disconnect', () => ok(() => {
    logger.socket(TAG, `socket ${socket.id} 断开`)
    roomManager.handleDisconnect(socket.id)
  }))
}

// ── 辅助：在所有房间中找包含 socketId 的那个 ────────────────
function findRoom(
  roomManager: RoomManager,
  socketId: string,
): import('../rooms/GameRoom').GameRoom | undefined {
  for (const room of (roomManager as any).rooms.values() as IterableIterator<import('../rooms/GameRoom').GameRoom>) {
    if (room.hasSocket(socketId)) return room
  }
  return undefined
}
