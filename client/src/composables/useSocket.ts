// ============================================================
// useSocket.ts — Socket.io 连接 + 房间/游戏事件绑定
// ============================================================

import { ref, readonly } from 'vue'
import { io, Socket } from 'socket.io-client'
import { useRoomStore } from '@/stores/room'
import { useRouter } from 'vue-router'
import type {
  PublicRoomState, GameActionPayload,
  CreateRoomPayload, JoinRoomPayload,
  RoomConfig, BotDifficulty, Card,
} from '@shared/types'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

// ── 单例 ─────────────────────────────────────────────────────
let socket: Socket | null = null
const status    = ref<ConnectionStatus>('disconnected')
const socketId  = ref<string>('')
const lastError = ref<string>('')
const pingMs    = ref<number>(0)

// Page Visibility 监听器只注册一次
let visibilityListenerAdded = false

// 上次加入的房间信息（用于断线重连后自动重新加入）
let lastRoomCode     = ''
let lastNickname     = ''
let lastAsSpectator  = false

// ── 会话 Token（持久化到 localStorage） ─────────────────────
function getSessionToken(): string {
  let token = localStorage.getItem('tx_session_token')
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem('tx_session_token', token)
  }
  return token
}

// ── 绑定房间/游戏事件（仅绑定一次） ─────────────────────────
function bindRoomEvents(sock: Socket): void {
  // 防止重复绑定
  sock.off('room:joined').off('room:state')
    .off('game:cards').off('game:state').off('game:action')
    .off('game:timer').off('game:start').off('game:newPhase')
    .off('game:showdown').off('game:result').off('game:handComplete')
    .off('game:cardsShown').off('spectator:cards').off('system:message').off('error')

  sock.on('room:joined', (payload: {
    roomState: PublicRoomState
    myId: string
    myRole: any
    sessionToken: string
    shareUrl?: string
    myCards?: [Card, Card]
  }) => {
    const store = useRoomStore()
    store.onJoined(payload)
    // 同步缓存，保证下次重连能回到正确房间
    if (payload.roomState?.code) lastRoomCode = payload.roomState.code
  })

  sock.on('room:state', (state: PublicRoomState) => {
    useRoomStore().setRoomState(state)
  })

  sock.on('game:cards', (payload: { holeCards: [Card, Card] }) => {
    useRoomStore().setMyCards(payload.holeCards)
  })

  sock.on('game:state', (state: any) => {
    const store = useRoomStore()
    if (store.roomState) {
      store.roomState.gameState = state
      // 同步玩家数据（筹码、下注量、状态等）
      if (state.players && Array.isArray(state.players)) {
        store.roomState.players = state.players
      }
    }
  })

  sock.on('game:action', (data: { playerId: string; playerName: string; seatIndex: number; action: string; amount: number; phase: string }) => {
    useRoomStore().recordAction(data)
  })

  sock.on('game:timer', (data: { playerId: string; expiresAt: number }) => {
    useRoomStore().setTimer(data.playerId, data.expiresAt)
  })

  sock.on('game:start', () => {
    useRoomStore().clearGameState()
  })

  sock.on('game:newPhase', (data: any) => {
    const store = useRoomStore()
    if (store.roomState?.gameState) {
      store.roomState.gameState.communityCards = data.communityCards
      store.roomState.gameState.phase          = data.phase
    }
  })

  sock.on('game:showdown', (data: any) => {
    useRoomStore().setShowdown(data)
  })

  sock.on('game:result', (data: any) => {
    useRoomStore().setResult(data)
  })

  // 新事件：整局结束结算（替代旧的 game:result）
  sock.on('game:handComplete', (data: any) => {
    useRoomStore().setHandComplete(data)
  })

  // 弃牌赢家亮牌
  sock.on('game:cardsShown', (data: any) => {
    useRoomStore().addShownCards(data)
  })

  // 观众私密看牌回包
  sock.on('spectator:cards', (data: { playerId: string; holeCards: [Card, Card] }) => {
    useRoomStore().setSpectatorRevealedCard(data.playerId, data.holeCards)
  })

  sock.on('system:message', (msg: { type: string; text: string }) => {
    useRoomStore().pushMessage(msg.type, msg.text)
  })

  sock.on('error', (err: { code: string; message: string }) => {
    useRoomStore().pushMessage('error', `错误: ${err.message}`)
    console.error('[Socket Error]', err)
  })
}

// ── 初始化连接 ───────────────────────────────────────────────
function connect(): Socket {
  // 关键修复：只要 socket 对象存在就复用（不管 connected 状态）
  // Socket.io 会在内部自动重连，不能重复 io() 创建新实例
  if (socket) {
    if (!socket.connected) socket.connect()
    return socket
  }

  status.value = 'connecting'

  socket = io({
    path:        '/socket.io',
    transports:  ['websocket', 'polling'],
    reconnection:         true,
    reconnectionAttempts: Infinity,   // 手机网络不稳定，无限重试
    reconnectionDelay:    1000,
    reconnectionDelayMax: 8000,
    timeout:              20000,
  })

  // ── 事件监听只在新 socket 创建时绑定一次 ─────────────────
  socket.on('connect', () => {
    status.value    = 'connected'
    socketId.value  = socket!.id ?? ''
    lastError.value = ''

    // 断线重连后自动重新加入房间
    const store    = useRoomStore()
    const code     = lastRoomCode || store.roomState?.code || ''
    const nickname = lastNickname
      || store.roomState?.players.find(p => p.id === store.myId)?.nickname
      || localStorage.getItem('tx_last_nickname')
      || '玩家'
    const asSpec   = lastAsSpectator || (store.myRole === 'spectator')

    if (code) {
      socket!.emit('room:join', {
        code,
        nickname,
        sessionToken: getSessionToken(),
        asSpectator:  asSpec,
      })
    }
  })

  socket.on('disconnect', () => {
    status.value   = 'disconnected'
    socketId.value = ''
  })

  socket.on('connect_error', (err) => {
    status.value    = 'error'
    lastError.value = err.message
  })

  // ── Page Visibility API：只注册一次，页面回到前台时触发重连 ──
  if (typeof document !== 'undefined' && !visibilityListenerAdded) {
    visibilityListenerAdded = true
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && socket && !socket.connected) {
        socket.connect()
      }
    })
  }

  bindRoomEvents(socket)
  return socket
}

function disconnect(): void {
  socket?.disconnect()
  socket = null
  status.value   = 'disconnected'
  socketId.value = ''
}

function getSocket(): Socket | null { return socket }

// ── 高层封装：房间操作 ────────────────────────────────────────
function createRoom(nickname: string, config?: Partial<RoomConfig>) {
  const sock = socket
  if (!sock?.connected) return
  lastNickname    = nickname
  lastAsSpectator = false
  localStorage.setItem('tx_last_nickname', nickname)
  const payload: CreateRoomPayload = {
    nickname, sessionToken: getSessionToken(), config,
  }
  sock.emit('room:create', payload)
}

function joinRoom(code: string, nickname: string, asSpectator = false) {
  const sock = socket
  if (!sock?.connected) return
  lastRoomCode    = code.toUpperCase()
  lastNickname    = nickname
  lastAsSpectator = asSpectator
  localStorage.setItem('tx_last_nickname', nickname)
  const payload: JoinRoomPayload = {
    code: code.toUpperCase(), nickname,
    sessionToken: getSessionToken(), asSpectator,
  }
  sock.emit('room:join', payload)
}

function leaveRoom() {
  lastRoomCode    = ''
  lastNickname    = ''
  lastAsSpectator = false
  socket?.emit('room:leave')
  useRoomStore().reset()
}

function setReady(ready = true) { socket?.emit('room:ready', ready) }

function startGame() { socket?.emit('host:startGame') }

function addBot(difficulty: BotDifficulty = 'medium') {
  socket?.emit('host:addBot', { difficulty })
}

function removeBot(botId: string) {
  socket?.emit('host:removeBot', { botId })
}

function updateConfig(config: Partial<RoomConfig>) {
  socket?.emit('host:updateConfig', { config })
}

function sendAction(action: GameActionPayload) {
  socket?.emit('game:action', action)
}

function nextHand() {
  socket?.emit('host:nextHand')
}

function showCards(show: boolean) {
  socket?.emit('game:showCards', { show })
}

function rebuy() {
  socket?.emit('player:rebuy')
}

function sitOutAsSpectator() {
  socket?.emit('player:sitOut')
}

function transferHost(targetId: string) {
  socket?.emit('room:transferHost', { targetId })
}

function requestCards(targetPlayerId: string) {
  socket?.emit('spectator:requestCards', { targetPlayerId })
}

async function ping(): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('未连接'))
    const t0 = Date.now()
    socket.emit('ping', (res: string) => {
      if (res === 'pong') { pingMs.value = Date.now() - t0; resolve(pingMs.value) }
    })
    setTimeout(() => reject(new Error('ping 超时')), 5000)
  })
}

// ── 导出 ─────────────────────────────────────────────────────
export function useSocket() {
  return {
    socket: getSocket,
    connect,
    disconnect,
    ping,
    getSessionToken,
    status:    readonly(status),
    socketId:  readonly(socketId),
    lastError: readonly(lastError),
    pingMs:    readonly(pingMs),
    // 房间/游戏操作
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    startGame,
    addBot,
    removeBot,
    updateConfig,
    sendAction,
    nextHand,
    showCards,
    requestCards,
    rebuy,
    sitOutAsSpectator,
    transferHost,
  }
}
