# Texas Hold'em Online Platform — 完整架构设计文档

> **版本**: v1.0.0  
> **日期**: 2026-08-25  
> **状态**: 设计阶段  
> **目标**: 可通过微信转发链接即点即玩的多人德州扑克 H5 Web 应用，含人机对战与三视角观战系统

---

## 目录

1. [项目概述](#1-项目概述)
2. [功能清单](#2-功能清单)
3. [三视角系统设计](#3-三视角系统设计)
4. [系统架构](#4-系统架构)
5. [数据模型设计](#5-数据模型设计)
6. [通信协议设计](#6-通信协议设计)
7. [游戏引擎设计](#7-游戏引擎设计)
8. [AI 模块设计](#8-ai-模块设计)
9. [前端界面设计](#9-前端界面设计)
10. [部署方案](#10-部署方案)
11. [阶段性开发计划](#11-阶段性开发计划)
12. [未来扩展规划](#12-未来扩展规划)

---

## 1. 项目概述

### 1.1 产品定位

一款基于 H5 的无限注德州扑克（No-Limit Texas Hold'em）在线游戏平台，支持：
- 手机浏览器（微信内置浏览器）直接访问，无需安装
- 多人实时联机对战（通过分享链接邀请好友）
- 人机对战（内置规则机器人，未来接入 ML 模型）
- 三种视角权限：管理员 / 玩家 / 观众

### 1.2 技术选型概览

| 层级 | 选型 | 理由 |
|------|------|------|
| 前端 | Vue3 + Vite + TypeScript | 轻量、H5友好、组合式API适合游戏状态管理 |
| 后端 | Node.js + Express + Socket.io | TS全栈共享引擎代码，WebSocket实时通信 |
| 游戏引擎 | TypeScript 纯函数（参考 pokerllm） | 无副作用、可测试、前后端共用 |
| AI 模块 | 规则机器人（内置）/ 预留ML接口 | 零延迟零成本，接口可插拔 |
| 数据库 | MongoDB（游戏历史）+ 内存（实时状态） | MVP 阶段以内存为主，持久化为辅 |
| 部署 | 本机 + Cloudflare Tunnel | 按需启动，零服务器费用 |

### 1.3 参考项目

| 项目 | 参考内容 |
|------|---------|
| [pokerllm](https://github.com/sanskar0627/pokerllm) | TypeScript 纯函数游戏引擎、边池计算、手牌评估 |
| [avikalpg/poker-bot-arena](https://github.com/avikalpg/poker-bot-arena) | 前后端分离架构、AI 服务分层 |
| [griff-ui/poker-ai](https://github.com/griff-ui/poker-ai) | CFR 规则机器人策略参考 |
| [datamllab/rlcard](https://github.com/datamllab/rlcard) | 未来阶段 ML 模型训练框架 |
| [pypoks](https://github.com/piteren/pypoks) | 自我博弈训练流程参考 |

---

## 2. 功能清单

### 2.1 核心游戏功能（Phase 1-2，必须实现）

- [x] 完整 NLHE 游戏流程（Preflop / Flop / Turn / River / Showdown）
- [x] 多人房间（2-9 人，支持 AI 补位）
- [x] 房间创建与邀请码系统
- [x] 微信好友分享链接
- [x] 实时状态同步（WebSocket）
- [x] 断线重连（30秒内重连视为未离开）
- [x] 规则机器人 AI（规则策略 + 蒙特卡洛胜率）
- [x] 基础手牌评估与摊牌判定
- [x] 边池（Side Pot）精确计算
- [x] 计时器（每个玩家决策倒计时 30 秒，超时自动弃牌）

### 2.2 三视角功能（Phase 2，重要特性）

- [x] **玩家视角**：仅可见自己手牌 + 公共牌
- [x] **管理员视角**：可见所有手牌 + 实时胜率 + 操作控制台
- [x] **观众视角**：可配置（默认不可见手牌，可由管理员开启旁观特权）
- [x] 实时胜率显示（HUD，管理员/特权观众可见）

### 2.3 房间管理功能（Phase 2）

- [x] 房间参数设置（大小盲注、起始筹码、最大人数）
- [x] 管理员踢出玩家
- [x] 暂停/继续游戏
- [x] 旁观者管理（禁止/允许旁观）
- [x] 游戏历史查看（当局）

### 2.4 扩展功能（Phase 3+，可选）

- [ ] 多桌同时运行（大厅系统）
- [ ] 玩家战绩统计
- [ ] 牌局回放
- [ ] 锦标赛模式（Tournament，盲注递增）
- [ ] AI 难度分级（Easy / Medium / Hard / ML-Model）
- [ ] 语音/文字聊天
- [ ] 自定义筹码皮肤/牌面主题

---

## 3. 三视角系统设计

### 3.1 视角权限矩阵

| 信息/功能 | 玩家（Player） | 观众（Spectator） | 管理员（Admin） |
|-----------|:--------------:|:-----------------:|:---------------:|
| 自己手牌 | ✅ 可见 | ❌ 不可见 | ✅ 可见（所有人） |
| 其他玩家手牌 | ❌（摊牌前） | ❌ 默认不可见 | ✅ 始终可见 |
| 公共牌 | ✅ | ✅ | ✅ |
| 底池金额 | ✅ | ✅ | ✅ |
| 玩家筹码量 | ✅ | ✅ | ✅ |
| 当前下注额 | ✅ | ✅ | ✅ |
| **实时胜率 HUD** | ❌ 默认关 | ❌ 默认关 | ✅ 始终开 |
| 其他玩家胜率 | ❌ | ❌ | ✅ |
| 操作记录（本局） | ✅ | ✅ | ✅ |
| 历史手牌详情 | ✅（自己） | ❌ | ✅（全部） |
| 踢出玩家 | ❌ | ❌ | ✅ |
| 暂停游戏 | ❌ | ❌ | ✅ |
| 修改房间参数 | ❌ | ❌ | ✅（局间） |
| 开启旁观特权 | ❌ | ❌ | ✅ |
| 强制摊牌 | ❌ | ❌ | ✅ |

### 3.2 观众特权模式（Admin 可授权）

管理员可对特定观众开启"特权观战"，授权内容可单独配置：

```
特权观战套餐：
  ├── [A] 显示所有手牌（上帝视角）
  ├── [B] 显示实时胜率 HUD
  ├── [C] 显示玩家历史操作统计
  └── [D] 以上全部
```

使用场景：直播教学、朋友观战、复盘分析

### 3.3 实时胜率 HUD 设计

胜率使用**蒙特卡洛模拟**计算，每次公共牌变化后刷新：

```
┌─────────────────────────────────────────┐
│  玩家1 (你)    ♠A ♥K    胜率: 67.3%    │
│  玩家2 (AI)    🂠 🂠      胜率: 21.4%   │  ← Admin/特权观众可见实际牌
│  玩家3         🂠 🂠      胜率: 11.3%   │
│                                         │
│  公共牌: ♣Q ♦J ♥2 [?] [?]             │
│  模拟次数: 5000次  |  耗时: 8ms         │
└─────────────────────────────────────────┘
```

胜率计算时机：
- Preflop 后（发完手牌）
- Flop 后（3张公共牌）
- Turn 后（第4张公共牌）
- River 后（第5张公共牌）

### 3.4 视角切换 URL 方案

```
https://yourdomain.com/room/K7X2QP              ← 普通加入（系统分配角色）
https://yourdomain.com/room/K7X2QP?role=spectator   ← 以观众身份加入
https://yourdomain.com/room/K7X2QP?admin=TOKEN      ← 管理员视角（需token）
```

---

## 4. 系统架构

### 4.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      客户端层                                 │
│                                                             │
│   ┌──────────────────────────────────────────────────────┐  │
│   │  Vue3 H5 Web App（移动端优先，微信浏览器兼容）           │  │
│   │                                                      │  │
│   │  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │  │
│   │  │  玩家视图   │  │  观众视图   │  │  管理员控制台  │  │  │
│   │  │  PlayerView│  │SpectatorView│  │  AdminPanel   │  │  │
│   │  └────────────┘  └────────────┘  └───────────────┘  │  │
│   │                                                      │  │
│   │  useSocket.ts ─── @hyoga/uni-socket.io / 原生WS      │  │
│   └──────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │  WSS + HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│                     服务端层 (Node.js)                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Socket.io Server                                   │    │
│  │  ├── /game    游戏事件命名空间                        │    │
│  │  ├── /lobby   大厅命名空间                            │    │
│  │  └── /admin   管理员命名空间（鉴权）                   │    │
│  └───────────────────┬─────────────────────────────────┘    │
│                      │                                       │
│  ┌───────────────────▼─────────────────────────────────┐    │
│  │  核心业务层                                           │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │    │
│  │  │  RoomManager  │  │  GameRoom    │  │  UserMgr  │  │    │
│  │  │  房间生命周期  │  │  单局完整逻辑 │  │  会话管理  │  │    │
│  │  └──────────────┘  └──────┬───────┘  └───────────┘  │    │
│  └───────────────────────────┼─────────────────────────┘    │
│                              │                               │
│  ┌───────────────────────────▼─────────────────────────┐    │
│  │  游戏引擎层（TypeScript 纯函数，无副作用）              │    │
│  │  engine.ts / handEvaluator.ts / potCalculator.ts    │    │
│  │  stateMachine.ts / oddsCalculator.ts                │    │
│  └───────────────────────────┬─────────────────────────┘    │
│                              │                               │
│  ┌───────────────────────────▼─────────────────────────┐    │
│  │  AI 模块层                                           │    │
│  │  ┌──────────────────┐    ┌────────────────────────┐  │    │
│  │  │  RuleBasedBot     │    │  MLBotProxy (预留)      │  │    │
│  │  │  ~1ms, 无依赖     │    │  → Python FastAPI服务   │  │    │
│  │  └──────────────────┘    └────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  数据层                                              │    │
│  │  内存 Map（实时房间状态）  +  MongoDB（游戏历史）       │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  网络层                                                       │
│  Cloudflare Tunnel（本机部署）/ Nginx（VPS部署）               │
│  自动 HTTPS / WSS 终止                                        │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 进程模型

```
本机运行时：
├── Node.js 主进程（游戏服务器，端口 3000）
│   ├── Express HTTP 服务
│   ├── Socket.io WebSocket 服务
│   ├── 内存状态（所有活跃房间）
│   └── AI 计算（同进程，Worker Thread 可选）
└── cloudflared 进程（内网穿透，按需启动）

未来扩展：
└── Python FastAPI 进程（端口 8001，ML模型服务）
```

---

## 5. 数据模型设计

### 5.1 实时内存模型（TypeScript 接口）

```typescript
// ─── 扑克牌基础类型 ───────────────────────────────────────

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'
type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'T'|'J'|'Q'|'K'|'A'
interface Card { rank: Rank; suit: Suit }

// ─── 玩家 ─────────────────────────────────────────────────

type PlayerRole = 'player' | 'spectator' | 'admin'
type PlayerStatus = 'waiting' | 'active' | 'folded' | 'allIn' | 'disconnected' | 'sitOut'

interface Player {
  id: string                   // socket.id
  nickname: string
  avatar: string               // emoji 或 URL
  role: PlayerRole
  seatIndex: number | null     // null 表示观众席
  chips: number                // 当前筹码
  bet: number                  // 当前轮次下注额
  totalBet: number             // 本局累计下注（用于边池计算）
  holeCards: [Card, Card] | null
  status: PlayerStatus
  isBot: boolean
  privilegeLevel: 0 | 1 | 2    // 观众特权等级
  connectedAt: number
  lastActiveAt: number
}

// ─── 边池 ─────────────────────────────────────────────────

interface SidePot {
  amount: number
  eligiblePlayerIds: string[]  // 有资格赢得该边池的玩家
}

// ─── 游戏状态 ──────────────────────────────────────────────

type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished'

interface GameState {
  phase: GamePhase
  deck: Card[]                 // 剩余牌堆（服务端私有）
  communityCards: Card[]       // 公共牌（0-5张）
  mainPot: number
  sidePots: SidePot[]
  currentBet: number           // 当前轮次最高下注
  minRaise: number             // 最小加注额
  dealerSeatIndex: number      // 庄家位
  currentSeatIndex: number     // 当前行动玩家
  actionHistory: ActionRecord[]
  handNumber: number           // 局数计数
  timerExpiresAt: number       // 当前玩家计时器截止时间戳
}

// ─── 行动记录 ──────────────────────────────────────────────

type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allIn' | 'blind'

interface ActionRecord {
  playerId: string
  playerName: string
  action: ActionType
  amount: number
  timestamp: number
  phase: GamePhase
}

// ─── 房间 ─────────────────────────────────────────────────

type RoomStatus = 'waiting' | 'playing' | 'paused' | 'finished'

interface RoomConfig {
  smallBlind: number           // 小盲注（默认 10）
  bigBlind: number             // 大盲注（默认 20）
  startingChips: number        // 起始筹码（默认 1000）
  maxPlayers: number           // 最大玩家数（2-9，默认 6）
  allowSpectators: boolean     // 是否允许旁观
  actionTimeoutSec: number     // 决策超时秒数（默认 30）
  autoStart: boolean           // 人数达到自动开始
  minPlayersToStart: number    // 最少开始人数（默认 2）
}

interface Room {
  id: string                   // 房间唯一ID
  code: string                 // 6位邀请码（人类可读）
  adminId: string              // 管理员 socket.id
  adminToken: string           // 管理员鉴权 token（URL参数）
  config: RoomConfig
  status: RoomStatus
  players: Map<string, Player> // key: socket.id
  gameState: GameState | null
  createdAt: number
  pausedBy: string | null
}
```

### 5.2 持久化数据模型（MongoDB）

```typescript
// 游戏历史记录（每局结束后存储）
interface GameRecord {
  _id: ObjectId
  roomId: string
  roomCode: string
  handNumber: number
  players: Array<{
    nickname: string
    isBot: boolean
    holeCards: [Card, Card]
    finalChips: number
    chipDelta: number           // 正负值
    finalStatus: PlayerStatus
  }>
  communityCards: Card[]
  winners: Array<{
    playerId: string
    nickname: string
    potAmount: number
    handName: string           // 'Royal Flush', 'Two Pair' 等
    bestHand: Card[]
  }>
  actions: ActionRecord[]
  durationMs: number
  createdAt: Date
}

// 房间统计（可选，Phase 3）
interface RoomStats {
  _id: ObjectId
  roomCode: string
  totalHands: number
  totalDurationMs: number
  playerStats: Array<{
    nickname: string
    handsPlayed: number
    totalWon: number
    biggestPot: number
    vpip: number               // Voluntarily Put In Pot 主动入池率
    pfr: number                // Pre-Flop Raise 翻牌前加注率
  }>
}
```

---

## 6. 通信协议设计

### 6.1 Socket.io 事件总览

#### 客户端 → 服务端

```typescript
// ── 房间管理 ──────────────────────────────────────────────
'room:create'      (payload: CreateRoomPayload)   → RoomJoinedEvent
'room:join'        (payload: JoinRoomPayload)      → RoomJoinedEvent | ErrorEvent
'room:spectate'    (payload: SpectatePayload)      → RoomJoinedEvent | ErrorEvent
'room:leave'       ()                             → void
'room:ready'       ()                             → void（玩家准备）

// ── 游戏操作（玩家身份，且轮到自己） ──────────────────────
'game:action'      (payload: GameActionPayload)   → void

// ── 管理员操作（需验证 adminToken） ──────────────────────
'admin:pause'      (token: string)               → void
'admin:resume'     (token: string)               → void
'admin:kickPlayer' (token: string, playerId: string) → void
'admin:addBot'     (token: string, difficulty: BotDifficulty) → void
'admin:removeBot'  (token: string, botId: string)    → void
'admin:grantPrivilege' (token: string, spectatorId: string, level: 0|1|2) → void
'admin:forceShowdown'  (token: string)           → void
'admin:updateConfig'   (token: string, config: Partial<RoomConfig>) → void（局间）

// ── 心跳 ──────────────────────────────────────────────────
'ping'             ()                            → 'pong'
```

#### 服务端 → 客户端

```typescript
// ── 房间状态（广播给房间所有人） ─────────────────────────
'room:state'       (state: PublicRoomState)       // 房间人员状态更新

// ── 游戏事件（内容因视角不同而不同） ─────────────────────
'game:start'       (payload: GameStartPayload)    // 新局开始
'game:cards'       (payload: YourCardsPayload)    // 【私发】仅发给当事玩家/Admin
'game:allCards'    (payload: AllCardsPayload)     // 【私发】仅发给Admin/特权观众
'game:state'       (payload: PublicGameState)     // 公共游戏状态更新
'game:action'      (payload: ActionBroadcast)     // 广播某玩家的行动
'game:timer'       (payload: TimerPayload)        // 当前玩家倒计时
'game:communityCards' (cards: Card[])             // 公共牌更新
'game:potUpdate'   (payload: PotPayload)          // 底池更新
'game:showdown'    (payload: ShowdownPayload)     // 摊牌信息（包含所有手牌）
'game:result'      (payload: GameResultPayload)   // 本局结算

// ── 胜率更新（仅发给 Admin / 特权观众） ─────────────────
'game:odds'        (payload: OddsPayload)         // 实时胜率 HUD

// ── 系统消息 ──────────────────────────────────────────────
'system:message'   (msg: SystemMessage)           // 系统通知（踢出、暂停等）
'error'            (err: ErrorPayload)            // 错误通知
```

### 6.2 关键 Payload 定义

```typescript
// 创建房间
interface CreateRoomPayload {
  nickname: string
  avatar?: string
  config?: Partial<RoomConfig>
}

// 游戏行动
interface GameActionPayload {
  type: 'fold' | 'check' | 'call' | 'raise' | 'allIn'
  amount?: number              // raise 时必填
}

// 发给玩家的私密手牌
interface YourCardsPayload {
  holeCards: [Card, Card]
  seatIndex: number
}

// 发给Admin/特权观众的所有手牌
interface AllCardsPayload {
  players: Array<{
    id: string
    nickname: string
    seatIndex: number
    holeCards: [Card, Card]
  }>
}

// 胜率 HUD 数据
interface OddsPayload {
  phase: GamePhase
  communityCards: Card[]
  playerOdds: Array<{
    id: string
    nickname: string
    holeCards: [Card, Card]    // Admin 视角可见
    winProbability: number     // 0.0 - 1.0
    tieProbability: number
    handDescription: string    // 当前最强手牌描述（如 "Top Pair"）
  }>
  simulationCount: number
  calculationMs: number
}

// 摊牌
interface ShowdownPayload {
  players: Array<{
    id: string
    nickname: string
    holeCards: [Card, Card]
    bestHand: Card[]
    handRank: number
    handName: string
  }>
  communityCards: Card[]
}

// 结算
interface GameResultPayload {
  winners: Array<{
    id: string
    nickname: string
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
  nextHandStartsIn: number     // ms，下一局倒计时
}
```

---

## 7. 游戏引擎设计

### 7.1 状态机流转

```
                     ┌──────────┐
                     │ waiting  │ ← 玩家就绪等待
                     └────┬─────┘
                          │ 达到最少人数 + 全部就绪
                     ┌────▼─────┐
                     │ preflop  │ ← 发手牌，收盲注
                     └────┬─────┘
                          │ 所有人行动完毕
                     ┌────▼─────┐
                     │   flop   │ ← 发3张公共牌
                     └────┬─────┘
                          │ 所有人行动完毕
                     ┌────▼─────┐
                     │   turn   │ ← 发第4张公共牌
                     └────┬─────┘
                          │ 所有人行动完毕
                     ┌────▼─────┐
                     │  river   │ ← 发第5张公共牌
                     └────┬─────┘
                          │ 所有人行动完毕
                     ┌────▼─────┐
                     │ showdown │ ← 摊牌比大小
                     └────┬─────┘
                          │
                     ┌────▼─────┐
                     │ finished │ → 结算 → 回到 waiting（等待下一局）
                     └──────────┘

特殊情况：
  - 任意阶段只剩1人未弃牌 → 直接 finished（不摊牌）
  - 所有人All-in → 跳过剩余街的行动轮次，直接发牌至 showdown
```

### 7.2 核心函数签名

```typescript
// ── 引擎纯函数（engine.ts） ───────────────────────────────

// 洗牌
function createShuffledDeck(): Card[]

// 处理玩家行动，返回新状态（不可变）
function applyAction(state: GameState, players: Player[], action: GameActionPayload): {
  newState: GameState
  newPlayers: Player[]
  events: GameEvent[]
}

// 判断当前轮次行动是否结束
function isBettingRoundComplete(state: GameState, players: Player[]): boolean

// 推进到下一阶段
function advancePhase(state: GameState, players: Player[], deck: Card[]): {
  newState: GameState
  newPlayers: Player[]
  communityCards: Card[]
}

// 计算合法行动（弃牌/跟注/加注范围）
function getLegalActions(state: GameState, player: Player): LegalActions

interface LegalActions {
  canCheck: boolean
  canCall: boolean
  callAmount: number
  canRaise: boolean
  minRaise: number
  maxRaise: number             // 玩家剩余筹码
  canAllIn: boolean
}

// ── 手牌评估（handEvaluator.ts） ─────────────────────────

// 从 7 张牌中选最优 5 张，返回手牌等级和描述
function evaluateHand(cards: Card[]): HandResult

interface HandResult {
  rank: number                 // 数值越高越强（用于比较）
  name: HandName               // 'Royal Flush' | 'Straight Flush' | ...
  bestFive: Card[]             // 最优5张
  description: string          // 人类可读描述，如 "Pair of Aces"
}

type HandName = 
  | 'Royal Flush' | 'Straight Flush' | 'Four of a Kind'
  | 'Full House' | 'Flush' | 'Straight' | 'Three of a Kind'
  | 'Two Pair' | 'One Pair' | 'High Card'

// 比较两手牌胜负
function compareHands(a: HandResult, b: HandResult): -1 | 0 | 1

// ── 边池计算（potCalculator.ts） ─────────────────────────

// 计算所有边池（处理多人All-in场景）
function calculatePots(players: Player[]): SidePot[]

// ── 胜率计算（oddsCalculator.ts） ────────────────────────

// 蒙特卡洛胜率模拟
function calculateOdds(
  playerHands: Array<[Card, Card]>,
  communityCards: Card[],        // 0-5张已知公共牌
  simulations: number            // 默认 5000
): OddsResult[]

interface OddsResult {
  winProbability: number
  tieProbability: number
  loseProbability: number
}
```

### 7.3 手牌强度枚举（用于AI决策参考）

```
皇家同花顺  Royal Flush      权重: 9000+
同花顺      Straight Flush   权重: 8000-8999
四条        Four of a Kind   权重: 7000-7999
葫芦        Full House       权重: 6000-6999
同花        Flush            权重: 5000-5999
顺子        Straight         权重: 4000-4999
三条        Three of a Kind  权重: 3000-3999
两对        Two Pair         权重: 2000-2999
一对        One Pair         权重: 1000-1999
高牌        High Card        权重: 0-999
```

---

## 8. AI 模块设计

### 8.1 可插拔接口

```typescript
interface BotInterface {
  readonly name: string
  readonly difficulty: 'easy' | 'medium' | 'hard' | 'ml'
  
  decide(
    gameState: GameState,
    myHand: [Card, Card],
    myPlayer: Player,
    legalActions: LegalActions
  ): Promise<GameActionPayload>
}
```

### 8.2 规则机器人（Phase 1-2 实现）

```typescript
class RuleBasedBot implements BotInterface {
  // 翻牌前决策流程
  private preflopDecide(hand, position, gameState, legal): GameActionPayload {
    // 1. Chen 公式计算手牌基础分（0-20分）
    const chenScore = calcChenScore(hand)
    
    // 2. 位置系数（按钮位 +3，早位 -2）
    const adjustedScore = chenScore + positionBonus(position)
    
    // 3. 根据分数决策
    if (adjustedScore >= 15)  → 加注 (2.5-3x BB)
    if (adjustedScore >= 10)  → 跟注
    if (adjustedScore >= 7)   → 仅在跟注划算时跟注
    else                      → 弃牌
    
    // 4. 加入随机性（10%概率反向操作，模拟人类）
  }
  
  // 翻牌后决策流程
  private postflopDecide(hand, communityCards, gameState, legal): GameActionPayload {
    // 1. 蒙特卡洛模拟胜率（1000次，约2ms）
    const winRate = quickMonteCarlo(hand, communityCards, opponents)
    
    // 2. 底池赔率
    const potOdds = gameState.currentBet / (gameState.mainPot + gameState.currentBet)
    
    // 3. 决策树
    if (winRate > 0.7)        → 加注/All-in
    if (winRate > potOdds)    → 跟注
    if (winRate > 0.3)        → 以30%概率诈唬
    else                      → 弃牌
    
    // 4. 加注金额：基于底池比例（0.5-1.5x 底池）
  }
}
```

**难度配置参数：**

| 参数 | Easy | Medium | Hard |
|------|------|--------|------|
| 蒙特卡洛模拟次数 | 500 | 1000 | 3000 |
| 随机性比例 | 25% | 10% | 3% |
| 诈唬频率 | 5% | 15% | 25% |
| 位置意识 | 无 | 基础 | 完整 |
| 模拟思考延迟 | 500-1000ms | 300-800ms | 200-600ms |

> 注：模拟思考延迟是人为加入的，目的是避免AI出牌过快影响游戏体验

### 8.3 未来 ML 模型接入（Phase 4+）

```typescript
class MLBotProxy implements BotInterface {
  private apiUrl = 'http://localhost:8001/decide'
  
  async decide(gameState, myHand, myPlayer, legalActions) {
    // 序列化游戏状态 → 调用 Python FastAPI
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      body: JSON.stringify({ gameState, myHand, legalActions })
    })
    return response.json()  // { type: 'raise', amount: 150 }
  }
}

// Python 端 (FastAPI + RLCard/自训练模型)
# POST /decide
# Input:  游戏状态 JSON
# Output: { "type": "raise", "amount": 150 }
# 延迟目标: < 50ms
```

### 8.4 AI 迭代路线

```
当前（Phase 1-2）
└── RuleBasedBot - Chen公式 + 蒙特卡洛
    ✓ 0ms 延迟，零成本，无依赖

Phase 3
└── RLCard 预训练模型（DQN/CFR）
    ✓ 米饭大学开源，有预训练权重
    ✓ 部署为 Python FastAPI 服务
    ✓ 约 50ms 延迟

Phase 4（未来）
└── 自我博弈训练（Self-Play）
    ✓ 收集对局数据 → RLCard 环境 → PPO 训练
    ✓ 多版本 AI（v1/v2/v3...），难度分级
    ✓ 每月迭代一次，持续增强
```

---

## 9. 前端界面设计

### 9.1 页面结构

```
pages/
├── Hall.vue          大厅页（创建/加入/快速匹配）
├── Table.vue         游戏牌桌主界面
│   ├── PlayerView    玩家视角布局
│   ├── SpectatorView 观众视角布局
│   └── AdminPanel    管理员浮层面板
├── Lobby.vue         等候室（开始前）
└── Result.vue        结算页（本局结果）
```

### 9.2 牌桌布局（移动端，9人桌）

```
┌─────────────────────────────────────┐  ← 手机屏幕（竖屏）
│  ┌──────────────────────────────┐   │
│  │  [P3]    [P2]    [P1]        │   │  ← 对面玩家区
│  │                              │   │
│  │  [P4]                [P9]   │   │  ← 两侧玩家
│  │                              │   │
│  │  ╔════════════════════╗      │   │
│  │  ║  公共牌区           ║      │   │  ← 牌面区
│  │  ║  🂡 🂢 🂣 [?] [?]    ║      │   │
│  │  ║                    ║      │   │
│  │  ║  底池: 420         ║      │   │
│  │  ╚════════════════════╝      │   │
│  │                              │   │
│  │  [P5]                [P8]   │   │  ← 两侧玩家
│  │                              │   │
│  │  [P6]    [P7]  [你(P0)]      │   │  ← 己方玩家区
│  └──────────────────────────────┘   │
│                                     │
│  ╔═════════════════════════════╗    │
│  ║ 你的手牌:  ♠A  ♥K           ║    │  ← 己方手牌（仅自己可见）
│  ╚═════════════════════════════╝    │
│                                     │
│  ┌──────────┬──────────┬────────┐   │
│  │  弃 牌   │  跟注50  │ 加 注  │   │  ← 操作栏
│  └──────────┴──────────┴────────┘   │
│  [加注额滑动条]                      │
└─────────────────────────────────────┘
```

### 9.3 管理员浮层面板（右上角图标展开）

```
┌──────────────────────────────────────┐
│ 🔧 管理员控制台                       │
├──────────────────────────────────────┤
│ 所有手牌:                            │
│  P1: ♠A ♥K  胜率: 67.3% [Top Pair]  │
│  P2: ♣7 ♦2  胜率: 12.1% [High Card] │
│  Bot1: ♥Q ♦J  胜率: 20.6%           │
├──────────────────────────────────────┤
│ 操作:                                │
│  [暂停游戏]  [添加机器人]             │
│  [踢出玩家 ▾] [强制摊牌]              │
├──────────────────────────────────────┤
│ 旁观者管理:                           │
│  观众A  [授权手牌可见] [授权胜率]      │
└──────────────────────────────────────┘
```

### 9.4 玩家座位组件状态

```
正常状态:    [昵称] [筹码: 980] 牌背 × 2
弃牌:        [昵称] [筹码: 980] 暗色遮罩
All-in:      [昵称] [ALL IN] 醒目标识
当前行动:    [昵称] [筹码: 980] 闪烁边框 + 倒计时环
断线:        [昵称] [断线中...] 灰色图标
摊牌时:      [昵称] ♠A ♥K  "一对A" ← 翻转显示
```

### 9.5 微信分享集成

```javascript
// 触发微信分享卡片
wx.updateAppMessageShareData({
  title: `${adminNickname} 开了一桌德州，来一局！`,
  desc: `${playerCount}人在玩 · 大盲 ${bigBlind} · 点击加入`,
  link: `https://yourdomain.com/join/${roomCode}`,
  imgUrl: 'https://yourdomain.com/share-cover.jpg',
})
```

---

## 10. 部署方案

### 10.1 Phase 1-2：本机部署（推荐）

```
硬件要求：
  ├── CPU: 任意（Node.js 处理100并发时 < 5% CPU）
  ├── 内存: 100MB（50个活跃房间约 50MB）
  ├── 网络: 普通家庭宽带（游戏数据极小，<1KB/s 每玩家）
  └── 系统: Windows 10（当前环境）

软件栈：
  ├── Node.js 20 LTS
  ├── PM2（进程守护，可选）
  └── cloudflared（内网穿透）

每次游玩流程：
  1. npm run start          启动游戏服务器（端口 3000）
  2. cloudflared tunnel     获取公网链接
  3. 复制链接发到微信群
  4. 玩完 Ctrl+C 关闭
```

### 10.2 一键启动脚本

```powershell
# start.ps1 - 放在项目根目录，双击运行
Write-Host "启动德州扑克服务器..." -ForegroundColor Green
Start-Process -NoNewWindow npm -ArgumentList "run","start"
Start-Sleep -Seconds 2
Write-Host "启动内网穿透..." -ForegroundColor Yellow
cloudflared tunnel --url http://localhost:3000
```

### 10.3 Phase 3+：云服务器部署

```
配置需求（入门）：
  ├── 腾讯云 / 阿里云 轻量服务器
  ├── 2核 2GB 内存
  ├── 约 24 元/月（约 288 元/年）
  └── 国内服务器：域名需 ICP 备案（10-14天）

软件栈：
  ├── Nginx（反向代理 + SSL终止）
  ├── Node.js + PM2（集群模式）
  ├── MongoDB Atlas 免费套餐（512MB）
  └── Let's Encrypt（免费 HTTPS 证书）
```

---

## 11. 阶段性开发计划

### Phase 0：项目脚手架（预计 1-2 天）

**目标**：能运行的空项目骨架

- [ ] 初始化 Node.js 后端（Express + Socket.io + TypeScript）
- [ ] 初始化 Vue3 前端（Vite + TypeScript + Pinia）
- [ ] 配置开发代理（前端访问后端 WebSocket）
- [ ] 建立 `shared/` 目录存放前后端共用类型定义
- [ ] 配置 Cloudflare Tunnel 本地测试

**交付物**：前后端通信正常，Socket.io 连接成功

---

### Phase 1：游戏引擎（预计 4-5 天）

**目标**：完整可测试的 NLHE 游戏引擎

- [ ] `Card` / `Deck` 基础类型和洗牌函数
- [ ] 手牌评估器（7选5，所有10种牌型）
- [ ] 边池计算器（支持多人 All-in）
- [ ] 游戏状态机（完整流转逻辑）
- [ ] 合法行动计算器
- [ ] 单元测试（覆盖边界情况：多路边池、同桌比较、平分底池）

**交付物**：引擎单元测试 100% 通过

---

### Phase 2：多人房间系统（预计 3-4 天）

**目标**：多个真实玩家可以在同一个房间完成一局游戏

- [ ] 房间创建 / 邀请码生成
- [ ] Socket.io 房间隔离（不同房间互不干扰）
- [ ] 手牌分发（私密，仅发给当事人）
- [ ] 断线重连（30秒内重连视为未离开）
- [ ] 计时器系统（超时自动弃牌）
- [ ] AI机器人补位（规则机器人初版）

**交付物**：2-4名真实玩家 + AI 可完整打一局

---

### Phase 3：三视角系统（预计 2-3 天）

**目标**：管理员/玩家/观众权限分离

- [ ] 角色分配逻辑（创建者=管理员，后来=玩家/观众）
- [ ] 差异化数据下发（各视角看到不同信息）
- [ ] 管理员控制台（暂停/踢人/加机器人/授权观众）
- [ ] 胜率 HUD 计算与推送（蒙特卡洛）
- [ ] 观众特权模式

**交付物**：三视角功能完整可用

---

### Phase 4：前端 H5 界面（预计 5-7 天）

**目标**：好看好用的手机端游戏界面

- [ ] 大厅页（创建/加入房间）
- [ ] 等候室（玩家列表 + 准备状态）
- [ ] 牌桌主界面（CSS 椭圆牌桌布局）
- [ ] 玩家座位组件（所有状态样式）
- [ ] 扑克牌 SVG 组件（花色/点数完整）
- [ ] 操作栏（弃牌/跟注/加注，加注额 Slider）
- [ ] 倒计时动效
- [ ] 结算弹窗
- [ ] 微信 JS-SDK 分享功能
- [ ] 移动端适配（iPhone SE ~ iPhone 16 Pro Max）

**交付物**：完整可玩的 H5 游戏，手机体验流畅

---

### Phase 5：AI 完善 + 联调（预计 2-3 天）

**目标**：规则机器人达到可玩水准

- [ ] 翻牌后蒙特卡洛策略完善
- [ ] 三档难度（Easy/Medium/Hard）
- [ ] AI 思考延迟模拟
- [ ] 全流程端到端测试
- [ ] 错误处理 + 边界情况修复
- [ ] 性能测试（10人同时在线压力测试）

**交付物**：稳定可玩的完整游戏，可分享给好友

---

### Phase 6（可选，未来）：ML 模型接入

**目标**：接入 RLCard 预训练模型，AI 水准显著提升

- [ ] Python FastAPI AI 服务搭建
- [ ] RLCard 预训练 DQN 模型部署
- [ ] 对接 Node.js MLBotProxy
- [ ] A/B 测试：规则机器人 vs ML机器人
- [ ] 自我博弈数据收集管线

---

### 时间线总览

```
Week 1:  Phase 0 + Phase 1（引擎）
Week 2:  Phase 2（多人房间）
Week 3:  Phase 3 + Phase 4 前期（三视角 + UI骨架）
Week 4:  Phase 4 后期（UI完善 + 分享）
Week 5:  Phase 5（AI完善 + 联调 + 测试）

总计约 4-5 周（1人开发，全职）
       6-8 周（兼职开发）
```

---

## 12. 未来扩展规划

### 12.1 大厅系统

- 多桌同时进行
- 游戏大厅列表（可见公开房间）
- 快速匹配（系统自动分配桌子）

### 12.2 锦标赛模式

```
Tournament 规则：
  ├── 固定起始筹码，淘汰制
  ├── 盲注每 X 局递增（Level 系统）
  ├── 气泡保护机制
  └── 最终排名积分
```

### 12.3 统计与回放

- 个人战绩（VPIP / PFR / AF / 3-bet% 等）
- 牌局历史列表
- 关键牌局回放（逐步动画）

### 12.4 更强 AI 自迭代训练

```
数据收集 → RLCard 环境 → PPO 自我博弈训练 → 导出模型
    ↑                                              │
    └──────────── 持续迭代（每月一版）──────────────┘
```

### 12.5 其他玩法扩展

- 短牌（Short Deck，36张）
- 奥马哈（Omaha，4张手牌）
- 锦标赛座位/门票系统

---

## 附录 A：技术栈完整清单

```
前端：
  vue@3.x             主框架
  vite@5.x            构建工具
  pinia@2.x           状态管理
  vue-router@4.x      路由
  socket.io-client    WebSocket
  @vueuse/core        工具库
  tailwindcss         样式（快速 UI）

后端：
  node.js@20 LTS      运行时
  express@4.x         HTTP 服务
  socket.io@4.x       WebSocket 服务
  typescript@5.x      类型系统
  mongodb@6.x         数据库驱动（Phase 3+）
  dotenv              环境变量

工具链：
  vitest              单元测试
  eslint + prettier   代码规范
  pm2                 进程守护
  cloudflared         内网穿透

未来 AI 扩展：
  python@3.11         AI服务运行时
  fastapi             AI HTTP服务
  rlcard              强化学习框架
  pytorch             深度学习
  stable-baselines3   PPO/DQN算法
```

## 附录 B：项目目录结构

```
texas-holdem/
├── shared/                         # 前后端共用代码
│   ├── types.ts                    # 所有类型定义
│   └── constants.ts                # 常量（手牌名称等）
│
├── server/                         # Node.js 后端
│   ├── game/
│   │   ├── engine.ts              # 游戏状态机
│   │   ├── handEvaluator.ts       # 手牌评估
│   │   ├── potCalculator.ts       # 边池计算
│   │   └── oddsCalculator.ts      # 胜率蒙特卡洛
│   ├── ai/
│   │   ├── BotInterface.ts        # AI可插拔接口
│   │   ├── RuleBasedBot.ts        # 规则机器人
│   │   └── MLBotProxy.ts          # ML模型代理（预留）
│   ├── rooms/
│   │   ├── RoomManager.ts         # 房间管理器
│   │   └── GameRoom.ts            # 单个房间逻辑
│   ├── socket/
│   │   ├── handlers.ts            # Socket事件处理
│   │   └── middleware.ts          # 鉴权中间件
│   ├── utils/
│   │   └── logger.ts              # 日志工具
│   └── index.ts                   # 服务入口
│
├── client/                         # Vue3 H5 前端
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Hall.vue           # 大厅
│   │   │   ├── Lobby.vue          # 等候室
│   │   │   ├── Table.vue          # 游戏桌
│   │   │   └── Result.vue         # 结算
│   │   ├── components/
│   │   │   ├── PokerTable.vue     # 牌桌布局
│   │   │   ├── PlayerSeat.vue     # 玩家座位
│   │   │   ├── PlayingCard.vue    # 扑克牌
│   │   │   ├── CommunityCards.vue # 公共牌区
│   │   │   ├── ActionBar.vue      # 操作栏
│   │   │   ├── PotDisplay.vue     # 底池显示
│   │   │   ├── OddsHUD.vue        # 胜率HUD（Admin）
│   │   │   └── AdminPanel.vue     # 管理员控制台
│   │   ├── composables/
│   │   │   ├── useSocket.ts       # WebSocket管理
│   │   │   ├── useGame.ts         # 游戏状态
│   │   │   └── useWechat.ts       # 微信JS-SDK
│   │   └── stores/
│   │       ├── room.ts            # 房间状态
│   │       └── user.ts            # 用户信息
│   └── vite.config.ts
│
├── scripts/
│   └── start.ps1                  # Windows一键启动脚本
│
├── package.json
├── tsconfig.json
├── DESIGN.md                       # 本文档
└── README.md
```

---

*文档最后更新：2026-08-25 | 下次更新：Phase 0 完成后*
