// ============================================================
// stores/room.ts — 房间 + 游戏状态（Pinia）
// ============================================================

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  PublicRoomState, PublicPlayer, GameState,
  RoomConfig, PlayerRole, GameActionPayload, Card,
} from '@shared/types'

export const useRoomStore = defineStore('room', () => {
  // ── 基础状态 ────────────────────────────────────────────
  const roomState    = ref<PublicRoomState | null>(null)
  const myId         = ref<string>('')
  const myRole       = ref<PlayerRole>('player')
  const sessionToken = ref<string>('')
  const shareUrl     = ref<string>('')

  // ── 我的手牌（私有，服务端私发） ────────────────────────
  const myCards      = ref<[Card, Card] | null>(null)

  // ── 游戏动态信息 ────────────────────────────────────────
  const timerExpiry  = ref<number>(0)
  const timerPlayer  = ref<string>('')
  const lastAction   = ref<{ playerId: string; playerName: string; action: string; amount: number; phase?: string } | null>(null)
  const gameResult   = ref<unknown | null>(null)
  const showdown     = ref<unknown | null>(null)

  // ── 结算数据（新版：每局结束后完整结果） ───────────────
  const handComplete = ref<{
    isFoldWin: boolean
    foldWinnerIds: string[]
    dealerSeatIndex: number
    smallBlindSeatIndex: number
    bigBlindSeatIndex: number
    winners: Array<{ id: string; nickname: string; seatIndex: number; potAmount: number; handName: string }>
    showdownPlayers: Array<{ id: string; nickname: string; seatIndex: number; holeCards: [Card, Card]; handName: string }>
    playerDeltas: Array<{ id: string; nickname: string; delta: number }>
    communityCards: Card[]
    handNumber: number
  } | null>(null)

  // 弃牌赢家亮牌信息
  const shownCards = ref<Array<{ playerId: string; nickname: string; seatIndex: number; holeCards: [Card, Card] }>>([])

  // 观众私密看牌（仅本客户端可见，key = playerId）
  const spectatorRevealedCards = ref<Map<string, [Card, Card]>>(new Map())
  // ── 系统消息队列 ─────────────────────────────────────────
  const messages     = ref<Array<{ type: string; text: string; id: number }>>([])
  let   msgCounter   = 0

  // ── 计算属性 ────────────────────────────────────────────
  const isHost = computed(() => myRole.value === 'host')
  const isSpectator = computed(() => myRole.value === 'spectator')
  const inRoom = computed(() => !!roomState.value)
  const gamePhase = computed(() => roomState.value?.gameState?.phase ?? 'waiting')
  const inGame  = computed(() => gamePhase.value !== 'waiting' && !!roomState.value?.gameState)

  const myPlayer = computed<PublicPlayer | undefined>(() =>
    roomState.value?.players.find(p => p.id === myId.value),
  )
  const myTurn = computed(() => {
    if (!roomState.value?.gameState || !myPlayer.value) return false
    const gs = roomState.value.gameState as GameState
    return gs.currentSeatIndex === myPlayer.value.seatIndex
  })

  const seatedPlayers = computed(() =>
    (roomState.value?.players ?? []).filter(p => p.seatIndex !== null)
      .sort((a, b) => a.seatIndex! - b.seatIndex!),
  )

  const pot = computed(() => {
    const gs = roomState.value?.gameState as GameState | undefined
    if (!gs) return 0
    const side = gs.sidePots?.reduce((s: number, p: { amount: number }) => s + p.amount, 0) ?? 0
    return (gs.mainPot ?? 0) + side
  })

  const communityCards = computed(() =>
    (roomState.value?.gameState as GameState | undefined)?.communityCards ?? [],
  )

  const currentSeatIndex = computed(() =>
    (roomState.value?.gameState as GameState | undefined)?.currentSeatIndex ?? -1,
  )

  // ── Actions ─────────────────────────────────────────────
  function setRoomState(state: PublicRoomState) {
    roomState.value = state
    shareUrl.value  = state.shareUrl
    // 当 room:state 更新时同步自己的角色（充值/旁观后角色会变）
    if (myId.value) {
      const me = state.players.find(p => p.id === myId.value)
      if (me && me.role !== myRole.value) myRole.value = me.role
    }
  }

  function onJoined(payload: {
    roomState: PublicRoomState
    myId: string
    myRole: PlayerRole
    sessionToken: string
    shareUrl?: string
    myCards?: [Card, Card]
  }) {
    setRoomState(payload.roomState)
    myId.value         = payload.myId
    myRole.value       = payload.myRole
    sessionToken.value = payload.sessionToken
    if (payload.shareUrl) shareUrl.value = payload.shareUrl
    if (payload.myCards) myCards.value = payload.myCards
  }

  function setMyCards(cards: [Card, Card]) {
    myCards.value = cards
  }

  function setTimer(playerId: string, expiresAt: number) {
    timerPlayer.value = playerId
    timerExpiry.value = expiresAt
  }

  function clearTimer() {
    timerPlayer.value = ''
    timerExpiry.value = 0
  }

  function recordAction(data: { playerId: string; playerName: string; action: string; amount: number; phase?: string }) {
    lastAction.value = data
    setTimeout(() => { lastAction.value = null }, 3000)
  }

  function setResult(data: unknown) {
    gameResult.value = data
    myCards.value    = null
  }

  function setShowdown(data: unknown) {
    showdown.value = data
  }

  function setHandComplete(data: typeof handComplete.value) {
    handComplete.value = data
    shownCards.value   = []
    myCards.value      = null
    clearTimer()
  }

  function addShownCards(data: { playerId: string; nickname: string; seatIndex: number; holeCards: [Card, Card] }) {
    if (!shownCards.value.find(s => s.playerId === data.playerId)) {
      shownCards.value.push(data)
    }
  }

  function setSpectatorRevealedCard(playerId: string, holeCards: [Card, Card]) {
    spectatorRevealedCards.value = new Map(spectatorRevealedCards.value).set(playerId, holeCards)
  }

  function clearGameState() {
    myCards.value                = null
    gameResult.value             = null
    showdown.value               = null
    handComplete.value           = null
    shownCards.value             = []
    spectatorRevealedCards.value = new Map()
    clearTimer()
  }

  function pushMessage(type: string, text: string) {
    const id = ++msgCounter
    messages.value.push({ type, text, id })
    setTimeout(() => {
      messages.value = messages.value.filter(m => m.id !== id)
    }, 5000)
  }

  function reset() {
    roomState.value    = null
    myId.value         = ''
    myRole.value       = 'player'
    shareUrl.value     = ''
    myCards.value      = null
    timerExpiry.value  = 0
    timerPlayer.value  = ''
    lastAction.value   = null
    gameResult.value   = null
    showdown.value     = null
    handComplete.value           = null
    shownCards.value             = []
    spectatorRevealedCards.value = new Map()
    messages.value     = []
  }

  return {
    // state
    roomState, myId, myRole, sessionToken, shareUrl,
    myCards, timerExpiry, timerPlayer, lastAction,
    gameResult, showdown, handComplete, shownCards, spectatorRevealedCards, messages,
    // computed
    isHost, isSpectator, inRoom, inGame, gamePhase,
    myPlayer, myTurn, seatedPlayers, pot, communityCards, currentSeatIndex,
    // actions
    setRoomState, onJoined, setMyCards, setTimer, clearTimer,
    recordAction, setResult, setShowdown, setHandComplete, addShownCards, setSpectatorRevealedCard,
    clearGameState, pushMessage, reset,
  }
})
