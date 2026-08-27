// ============================================================
// texas-holdem — 共享类型定义
// 前端 (client) 和 后端 (server) 共同使用
// ============================================================

// ─── 扑克牌基础类型 ────────────────────────────────────────

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'

export interface Card {
  rank: Rank
  suit: Suit
}

// ─── 手牌评估结果 ──────────────────────────────────────────

export type HandName =
  | 'Royal Flush'
  | 'Straight Flush'
  | 'Four of a Kind'
  | 'Full House'
  | 'Flush'
  | 'Straight'
  | 'Three of a Kind'
  | 'Two Pair'
  | 'One Pair'
  | 'High Card'

export interface HandResult {
  rank: number
  name: HandName
  bestFive: Card[]
  description: string
}

// ─── 玩家相关 ──────────────────────────────────────────────

export type PlayerRole = 'host' | 'player' | 'spectator'
/** 服务端后台管理员不参与 socket 角色，仅在 server 侧操作 */

export type PlayerStatus =
  | 'waiting'       // 等待开始
  | 'active'        // 游戏中
  | 'folded'        // 已弃牌
  | 'allIn'         // 全押
  | 'disconnected'  // 断线
  | 'sitOut'        // 坐出（跳过本局）

export type PrivilegeLevel = 0 | 1 | 2

export interface Player {
  id: string
  nickname: string
  avatar: string
  role: PlayerRole
  seatIndex: number | null    // null = 观众席
  chips: number
  bet: number                 // 当前轮下注额
  totalBet: number            // 本局累计下注（边池计算用）
  holeCards: [Card, Card] | null
  status: PlayerStatus
  isBot: boolean
  privilegeLevel: PrivilegeLevel
  isReady: boolean
  hasActed: boolean           // 本轮是否已主动行动过（防止大盲被跳过）
  rebuyCount: number          // 已充值次数
  connectedAt: number
  lastActiveAt: number
}

/** 发给客户端的公开玩家信息（隐藏手牌） */
export interface PublicPlayer {
  id: string
  nickname: string
  avatar: string
  role: PlayerRole
  seatIndex: number | null
  chips: number
  bet: number
  totalBet: number
  hasHoleCards: boolean       // 是否持有手牌（但不透露内容）
  status: PlayerStatus
  isBot: boolean
  privilegeLevel: PrivilegeLevel
  isReady: boolean
  rebuyCount: number          // 已充值次数（0 = 未充值）
}

// ─── 游戏阶段与行动 ────────────────────────────────────────

export type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished'

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allIn' | 'blind'

export interface ActionRecord {
  playerId: string
  playerName: string
  action: ActionType
  amount: number
  timestamp: number
  phase: GamePhase
}

export interface LegalActions {
  canCheck: boolean
  canCall: boolean
  callAmount: number
  canRaise: boolean
  minRaise: number
  maxRaise: number
  canAllIn: boolean
}

// ─── 边池 ──────────────────────────────────────────────────

export interface SidePot {
  amount: number
  eligiblePlayerIds: string[]
}

// ─── 游戏状态 ──────────────────────────────────────────────

export interface GameState {
  phase: GamePhase
  communityCards: Card[]
  mainPot: number
  sidePots: SidePot[]
  currentBet: number
  minRaise: number
  dealerSeatIndex: number
  smallBlindSeatIndex: number
  bigBlindSeatIndex: number
  currentSeatIndex: number
  actionHistory: ActionRecord[]
  handNumber: number
  timerExpiresAt: number
}

// ─── 房间配置与状态 ────────────────────────────────────────

export type RoomStatus = 'waiting' | 'playing' | 'paused' | 'finished'

export type BotDifficulty = 'easy' | 'medium' | 'hard'

export type CardType = 'standard' | 'short'  // 长牌52张 / 短牌36张(去掉2-5)

export interface RoomConfig {
  smallBlind: number
  bigBlind: number
  startingChips: number
  maxPlayers: number
  botCount: number            // 机器人数量 0-8
  botDifficulty: BotDifficulty
  cardType: CardType
  allowSpectators: boolean
  actionTimeoutSec: number
  autoStart: boolean
  minPlayersToStart: number
  showAllCards: boolean       // 摊牌时亮出所有人（含弃牌者）手牌
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  smallBlind: 10,
  bigBlind: 20,
  startingChips: 1000,
  maxPlayers: 6,
  botCount: 0,
  botDifficulty: 'medium',
  cardType: 'standard',
  allowSpectators: true,
  actionTimeoutSec: 30,
  autoStart: false,
  minPlayersToStart: 2,
  showAllCards: false,
}

/** 发给客户端的公开房间状态 */
export interface PublicRoomState {
  id: string
  code: string
  shareUrl: string          // 可分享的加入链接
  status: RoomStatus
  config: RoomConfig
  players: PublicPlayer[]
  gameState: Omit<GameState, 'deck'> | null
  spectatorCount: number
  hostId: string            // 房主玩家ID
  betweenHands: boolean     // 每局结束后、房主开始下一局前为 true
  foldWinnerIds: string[]   // 弃牌获胜时仍待决定是否亮牌的玩家ID列表
  needsRebuyDecision: string[]  // 本局结束后筹码清零、等待充值/旁观决定的玩家ID
}

// ─── 胜率 HUD ──────────────────────────────────────────────

export interface PlayerOdds {
  id: string
  nickname: string
  seatIndex: number
  holeCards: [Card, Card]
  winProbability: number
  tieProbability: number
  handDescription: string
}

export interface OddsPayload {
  phase: GamePhase
  communityCards: Card[]
  playerOdds: PlayerOdds[]
  simulationCount: number
  calculationMs: number
}

// ─── Socket.io 事件 Payload ────────────────────────────────

export interface CreateRoomPayload {
  nickname: string
  avatar?: string
  sessionToken: string
  config?: Partial<RoomConfig>
}

export interface JoinRoomPayload {
  code: string
  nickname: string
  avatar?: string
  sessionToken: string
  asSpectator?: boolean
}

export interface RoomJoinedPayload {
  roomState: PublicRoomState
  myId: string
  myRole: PlayerRole
  sessionToken: string
  myCards?: [Card, Card]
}

export interface GameActionPayload {
  type: 'fold' | 'check' | 'call' | 'raise' | 'allIn'
  amount?: number
}

/** 房主在游戏开始前修改房间配置 */
export interface HostUpdateConfigPayload {
  config: Partial<RoomConfig>
}

export interface HostAddBotPayload {
  difficulty: BotDifficulty
}

export interface YourCardsPayload {
  holeCards: [Card, Card]
  seatIndex: number
}

export interface AllCardsPayload {
  players: Array<{
    id: string
    nickname: string
    seatIndex: number
    holeCards: [Card, Card]
  }>
}

export interface GameStartPayload {
  handNumber: number
  dealerSeatIndex: number
  smallBlindSeatIndex: number
  bigBlindSeatIndex: number
}

export interface ShowdownPayload {
  players: Array<{
    id: string
    nickname: string
    seatIndex: number
    holeCards: [Card, Card]
    bestHand: Card[]
    handRank: number
    handName: HandName
    description: string
  }>
  communityCards: Card[]
}

export interface GameResultPayload {
  winners: Array<{
    id: string
    nickname: string
    seatIndex: number
    potAmount: number
    potType: 'main' | 'side'
    handName: string
  }>
  playerDeltas: Array<{
    id: string
    nickname: string
    before: number
    after: number
    delta: number
  }>
  handNumber: number
  nextHandStartsIn: number
}

export interface TimerPayload {
  playerId: string
  expiresAt: number
  timeoutSec: number
}

export interface ActionBroadcast {
  playerId: string
  playerName: string
  seatIndex: number
  action: ActionType
  amount: number
  phase: GamePhase
  timestamp: number
}

export interface SystemMessage {
  type: 'info' | 'warning' | 'error'
  text: string
  timestamp: number
}

export interface ErrorPayload {
  code: string
  message: string
}

// ─── 管理员操作 ─────────────────────────────────────────────

export interface AdminActionPayload {
  token: string
}

export interface AdminKickPayload extends AdminActionPayload {
  playerId: string
}

export interface AdminAddBotPayload extends AdminActionPayload {
  difficulty: BotDifficulty
  nickname?: string
}

export interface AdminGrantPrivilegePayload extends AdminActionPayload {
  spectatorId: string
  level: PrivilegeLevel
}

export interface AdminUpdateConfigPayload extends AdminActionPayload {
  config: Partial<RoomConfig>
}
