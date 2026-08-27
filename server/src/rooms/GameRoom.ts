// ============================================================
// GameRoom.ts — 单个房间完整逻辑
// 集成：状态机 / 机器人 / 断线重连 / 计时器 / Socket广播
// ============================================================

import type { Server, Socket } from 'socket.io'
import type {
  Player, GameState, Card, RoomConfig, PublicRoomState,
  PublicPlayer, GameActionPayload, BotDifficulty,
} from '@shared/types'
import { DEFAULT_ROOM_CONFIG } from '@shared/types'
import { RECONNECT_GRACE_MS } from '@shared/constants'
import {
  initHand, applyAction, advancePhase, determineWinners,
  isBettingRoundComplete, type ShowdownWinner,
} from '../game/stateMachine'
import { getLegalActions } from '../game/legalActions'
import { calculateOdds } from '../game/oddsCalculator'
import { RuleBasedBot } from '../ai/RuleBasedBot'
import { getBotThinkDelay, type BotInterface } from '../ai/BotInterface'
import { logger } from '../utils/logger'

const TAG = 'GameRoom'
let botIdCounter = 1

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export class GameRoom {
  readonly code:      string
  readonly createdAt: number
  config:   RoomConfig

  private io:         Server
  private publicUrl:  string

  // ── 玩家与会话 ──────────────────────────────────────────
  private players  = new Map<string, Player>()  // socketId -> Player
  private sessions = new Map<string, string>()  // sessionToken -> socketId
  private sockets  = new Map<string, Socket>()  // socketId -> socket
  private hostId   = ''                         // 当前房主的 socketId

  // ── 游戏状态 ────────────────────────────────────────────
  private gameState: GameState | null = null
  private deck:      Card[]           = []
  private handNumber = 0
  private dealerSeat = -1
  private bots       = new Map<string, BotInterface>()
  betweenHands = false          // 每局结束后等待房主手动开始
  private foldWinnerIds: string[] = []  // 弃牌获胜时待决定亮牌的玩家ID列表
  private needsRebuyDecision: string[] = []  // 清零后待决定充值/旁观的玩家ID
  private lastHandResult: any = null

  // ── 计时器 ──────────────────────────────────────────────
  private actionTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()

  get status()      { return this.gameState ? (this.gameState.phase === 'waiting' ? 'waiting' : 'playing') : (this.betweenHands ? 'paused' : 'waiting') }
  get playerCount() { return [...this.players.values()].filter(p => p.seatIndex !== null).length }

  constructor(code: string, config: Partial<RoomConfig>, io: Server, publicUrl: string) {
    this.code      = code
    this.createdAt = Date.now()
    this.io        = io
    this.publicUrl = publicUrl
    this.config    = { ...DEFAULT_ROOM_CONFIG, ...config }
  }

  // ─────────────────────────────────────────────────────────
  // 玩家加入 / 离开 / 重连
  // ─────────────────────────────────────────────────────────

  join(socket: Socket, nickname: string, sessionToken: string, asSpectator = false): {
    ok: boolean; reason?: string; player?: Player
  } {
    // 断线重连检测
    const existingSocketId = this.sessions.get(sessionToken)
    if (existingSocketId && this.players.has(existingSocketId)) {
      return this.reconnect(socket, sessionToken)
    }

    if (!asSpectator) {
      const seats = this.config.maxPlayers
      const occupiedSeats = [...this.players.values()].filter(p => p.seatIndex !== null).length
      if (occupiedSeats >= seats) {
        if (this.config.allowSpectators) asSpectator = true
        else return { ok: false, reason: '房间已满' }
      }
    }

    const seatIndex = asSpectator ? null : this.nextFreeSeat()
    const player: Player = {
      id:             socket.id,
      nickname:       nickname.trim().slice(0, 12) || '玩家',
      avatar:         this.randomAvatar(),
      role:           this.players.size === 0 && !asSpectator ? 'host' : asSpectator ? 'spectator' : 'player',
      seatIndex,
      chips:          this.config.startingChips,
      bet:            0,
      totalBet:       0,
      holeCards:      null,
      status:         'waiting',
      isBot:          false,
      privilegeLevel: 0,
      isReady:        false,
      hasActed:       false,
      rebuyCount:     0,
      connectedAt:    Date.now(),
      lastActiveAt:   Date.now(),
    }

    if (player.role === 'host') this.hostId = socket.id

    this.players.set(socket.id, player)
    this.sessions.set(sessionToken, socket.id)
    this.sockets.set(socket.id, socket)
    socket.join(this.code)

    logger.socket(TAG, `[${this.code}] ${nickname} 加入 (${player.role}, 座位${seatIndex ?? '观众'})`)
    return { ok: true, player }
  }

  private reconnect(socket: Socket, sessionToken: string): { ok: boolean; reason?: string; player?: Player } {
    const oldId = this.sessions.get(sessionToken)!
    const player = this.players.get(oldId)
    if (!player) return { ok: false, reason: '会话无效' }

    // 取消断线倒计时
    const timer = this.reconnectTimers.get(oldId)
    if (timer) { clearTimeout(timer); this.reconnectTimers.delete(oldId) }

    // 主动断开旧 socket（如果还活着），防止僵尸连接占用计数
    const oldSocket = this.sockets.get(oldId)
    if (oldSocket && oldSocket.id !== socket.id && oldSocket.connected) {
      oldSocket.disconnect(true)
    }

    // 更新 socketId
    const updated = { ...player, id: socket.id, status: player.status === 'disconnected' ? 'active' : player.status } as Player
    this.players.delete(oldId)
    this.players.set(socket.id, updated)
    this.sessions.set(sessionToken, socket.id)
    this.sockets.delete(oldId)
    this.sockets.set(socket.id, socket)
    if (this.hostId === oldId) this.hostId = socket.id
    socket.join(this.code)

    logger.socket(TAG, `[${this.code}] ${player.nickname} 重连成功 (${oldId.slice(-4)} → ${socket.id.slice(-4)})`)
    this.broadcastRoomState()
    return { ok: true, player: updated }
  }

  leave(socketId: string): void {
    const player = this.players.get(socketId)
    if (!player) return
    socket_leave: {
      const socket = this.sockets.get(socketId)
      socket?.leave(this.code)
    }
    this.players.delete(socketId)
    this.sockets.delete(socketId)

    // 如果房主离开，转让给下一位真人玩家
    if (socketId === this.hostId) {
      const nextHost = [...this.players.values()].find(p => !p.isBot && p.seatIndex !== null)
      if (nextHost) {
        nextHost.role  = 'host'
        this.hostId    = nextHost.id
        this.emit(nextHost.id, 'system:message', { type: 'info', text: '你已成为新房主', timestamp: Date.now() })
      }
    }

    logger.socket(TAG, `[${this.code}] ${player.nickname} 离开`)
    this.broadcastRoomState()
  }

  handleDisconnect(socketId: string): void {
    const player = this.players.get(socketId)
    if (!player) return

    if (this.gameState && this.gameState.phase !== 'waiting') {
      // 游戏中：标记断线，30秒后自动弃牌
      player.status = 'disconnected'
      const timer = setTimeout(() => {
        if (this.gameState && this.gameState.currentSeatIndex === player.seatIndex) {
          const legal = getLegalActions(this.gameState, player)
          this.doAction(socketId, legal.canCheck ? { type: 'check' } : { type: 'fold' })
        }
        this.leave(socketId)
      }, RECONNECT_GRACE_MS)
      this.reconnectTimers.set(socketId, timer)
      this.broadcastRoomState()
    } else {
      this.leave(socketId)
    }
  }

  hasSocket(socketId: string): boolean {
    return this.players.has(socketId)
  }

  // ─────────────────────────────────────────────────────────
  // 房主操作
  // ─────────────────────────────────────────────────────────

  updateConfig(socketId: string, cfg: Partial<RoomConfig>): void {
    if (socketId !== this.hostId) return
    if (this.gameState) return  // 游戏进行中不允许修改
    this.config = { ...this.config, ...cfg }
    this.broadcastRoomState()
  }

  addBot(socketId: string, difficulty: BotDifficulty = 'medium'): void {
    if (socketId !== this.hostId) return
    const seats = this.config.maxPlayers
    const occupied = [...this.players.values()].filter(p => p.seatIndex !== null).length
    if (occupied >= seats) return

    const botId   = `bot_${botIdCounter++}`
    const bot     = new RuleBasedBot(difficulty)
    const seatIdx = this.nextFreeSeat()
    const botPlayer: Player = {
      id: botId, nickname: bot.name, avatar: '🤖',
      role: 'player', seatIndex: seatIdx,
      chips: this.config.startingChips, bet: 0, totalBet: 0,
      holeCards: null, status: 'waiting', isBot: true,
      privilegeLevel: 0, isReady: true, hasActed: false, rebuyCount: 0,
      connectedAt: Date.now(), lastActiveAt: Date.now(),
    }
    this.players.set(botId, botPlayer)
    this.bots.set(botId, bot)
    logger.info(TAG, `[${this.code}] 添加机器人 ${bot.name}(${difficulty})，座位${seatIdx}`)
    this.broadcastRoomState()
  }

  removeBot(socketId: string, botId: string): void {
    if (socketId !== this.hostId) return
    const bot = this.players.get(botId)
    if (!bot?.isBot) return
    this.players.delete(botId)
    this.bots.delete(botId)
    this.broadcastRoomState()
  }

  setReady(socketId: string, ready: boolean): void {
    const p = this.players.get(socketId)
    if (p && !p.isBot) { p.isReady = ready; this.broadcastRoomState() }
  }

  /** 房主开始游戏 */
  startGame(socketId: string): { ok: boolean; reason?: string } {
    if (socketId !== this.hostId) return { ok: false, reason: '只有房主能开始游戏' }
    const seated = [...this.players.values()].filter(p => p.seatIndex !== null)
    if (seated.length < 2) return { ok: false, reason: '至少需要2人才能开始' }
    this.startHand()
    return { ok: true }
  }

  // ─────────────────────────────────────────────────────────
  // 游戏流程
  // ─────────────────────────────────────────────────────────

  private startHand(): void {
    const activePlayers = [...this.players.values()].filter(
      p => p.seatIndex !== null && p.chips > 0,
    )
    if (activePlayers.length < 2) {
      this.broadcastSystem('游戏结束，筹码不足的玩家已出局')
      this.gameState = null
      this.broadcastRoomState()
      return
    }

    try {
      const result = initHand(this.config, activePlayers, ++this.handNumber, this.dealerSeat)
      this.gameState = result.gameState
      this.deck      = result.deck
      this.dealerSeat = result.gameState.dealerSeatIndex

      // 更新 players 筹码
      for (const updated of result.updatedPlayers) {
        const p = this.players.get(updated.id)
        if (p) Object.assign(p, updated)
      }

      // 广播新局开始
      this.broadcast('game:start', {
        handNumber:          this.handNumber,
        dealerSeatIndex:     result.gameState.dealerSeatIndex,
        smallBlindSeatIndex: result.gameState.smallBlindSeatIndex,
        bigBlindSeatIndex:   result.gameState.bigBlindSeatIndex,
      })

      // 私发手牌
      for (const p of result.updatedPlayers) {
        if (p.holeCards) {
          this.emit(p.id, 'game:cards', { holeCards: p.holeCards, seatIndex: p.seatIndex })
        }
      }

      this.broadcastGameState()
      this.scheduleCurrentPlayerTimer()

      // 若当前行动者是机器人，触发决策
      this.triggerBotIfNeeded()
    } catch (err) {
      logger.error(TAG, `initHand 失败: ${err}`)
      // 恢复 betweenHands，让客户端可以重试
      this.betweenHands = true
      this.broadcastSystem(`开局失败: ${err}，请重试`)
      this.broadcastRoomState()
    }
  }

  doAction(socketId: string, action: GameActionPayload): void {
    try {
      this._doAction(socketId, action)
    } catch (err) {
      logger.error(TAG, `[${this.code}] doAction 未捕获异常: ${err}`)
      this.broadcastSystem('发生内部错误，本局结束，即将开始下一局')
      this.gameState = null
      this.broadcastRoomState()
      setTimeout(() => { if (this.playerCount >= 2) this.startHand() }, 3000)
    }
  }

  private _doAction(socketId: string, action: GameActionPayload): void {
    if (!this.gameState) return
    const playerList = [...this.players.values()]
    const player     = playerList.find(p => p.id === socketId)
    if (!player) return

    const result = applyAction(this.gameState, playerList, this.deck, socketId, action)
    if (result.error) { this.emit(socketId, 'error', { code: 'INVALID_ACTION', message: result.error }); return }

    this.clearActionTimer()
    this.gameState = result.newState
    this.deck      = result.newDeck
    for (const updated of result.newPlayers) {
      const p = this.players.get(updated.id)
      if (p) Object.assign(p, updated)
    }

    // 广播行动
    this.broadcast('game:action', {
      playerId:   player.id,
      playerName: player.nickname,
      seatIndex:  player.seatIndex,
      action:     action.type,
      amount:     action.amount ?? 0,
      phase:      this.gameState.phase,
      timestamp:  Date.now(),
    })

    this.broadcastGameState()

    // 行动后短暂停顿（800ms），让玩家能看清动作再继续
    const POST_ACTION_DELAY = 800
    if (this.gameState.phase === 'finished') {
      setTimeout(() => this.finishHand(), POST_ACTION_DELAY)
    } else if (result.roundComplete) {
      setTimeout(() => this.advanceToNextPhase(), POST_ACTION_DELAY)
    } else {
      this.scheduleCurrentPlayerTimer()
      setTimeout(() => this.triggerBotIfNeeded(), POST_ACTION_DELAY)
    }
  }

  private advanceToNextPhase(): void {
    if (!this.gameState) return
    const playerList = [...this.players.values()]
    const result = advancePhase(this.gameState, playerList, this.deck, this.config.bigBlind)
    this.gameState = result.newState
    this.deck      = result.newDeck
    for (const updated of result.newPlayers) {
      const p = this.players.get(updated.id)
      if (p) Object.assign(p, updated)
    }

    this.broadcast('game:newPhase', {
      phase:         this.gameState.phase,
      communityCards: this.gameState.communityCards,
    })
    this.broadcastGameState()

    const PHASE_DELAY = 1200

    if (this.gameState.phase === 'showdown') {
      setTimeout(() => this.finishHand(), PHASE_DELAY)
      return
    }

    // 检查是否所有未弃牌、未出局的玩家都已全押（无需等待行动）
    const activePlayers = [...this.players.values()].filter(
      p => p.seatIndex !== null && p.status === 'active',
    )
    if (activePlayers.length === 0) {
      // 所有人全押，自动走完剩余公共牌
      setTimeout(() => this.advanceToNextPhase(), PHASE_DELAY)
      return
    }

    this.scheduleCurrentPlayerTimer()
    setTimeout(() => this.triggerBotIfNeeded(), PHASE_DELAY)
  }

  // 房主触发下一局
  hostNextHand(socketId: string): void {
    if (socketId !== this.hostId) { return }
    if (!this.betweenHands) return
    if (this.needsRebuyDecision.length > 0) return  // 等待清零玩家决定
    this.betweenHands = false
    this.foldWinnerIds = []
    this.lastHandResult = null
    this.startHand()
  }

  // 弃牌获胜时，玩家选择是否亮牌（所有持牌玩家都可以选择）
  playerShowCards(socketId: string, show: boolean): void {
    if (!this.betweenHands || !this.foldWinnerIds.includes(socketId)) return
    if (show) {
      const p = this.players.get(socketId)
      if (p?.holeCards) {
        this.broadcast('game:cardsShown', {
          playerId: p.id, nickname: p.nickname,
          seatIndex: p.seatIndex, holeCards: p.holeCards,
        })
      }
    }
    this.foldWinnerIds = this.foldWinnerIds.filter(id => id !== socketId)
    this.broadcastRoomState()
  }

  // 观众请求私密查看某位玩家手牌（仅发给该观众）
  spectatorRequestCards(socketId: string, targetPlayerId: string): void {
    const requester = this.players.get(socketId)
    if (!requester || requester.seatIndex !== null) return   // 只允许观众
    const target = this.players.get(targetPlayerId)
    if (!target?.holeCards) return
    this.emit(socketId, 'spectator:cards', {
      playerId:  target.id,
      nickname:  target.nickname,
      seatIndex: target.seatIndex,
      holeCards: target.holeCards,
    })
  }

  private finishHand(): void {
    if (!this.gameState) return
    const playerList = [...this.players.values()]

    // 判断是否属于"弃牌获胜"（除了一人外其余均弃牌）
    const notFolded = playerList.filter(
      p => p.seatIndex !== null && p.status !== 'folded' && p.status !== 'sitOut'
    )
    const isFoldWin = notFolded.length === 1

    // 计算赢家（determineWinners 已处理单人直接获胜）
    const winners = determineWinners(this.gameState, playerList)

    // 更新筹码：先把本局已扣除的 bet 还原，再按赢家分配
    // （因为 applyAction 已从 chips 扣除下注额，这里只需要加上赢得的部分）
    for (const winner of winners) {
      const p = this.players.get(winner.playerId)
      if (p) p.chips += winner.amount
    }

    // 构建 delta：winAmount - totalBet
    const deltas = playerList
      .filter(p => p.seatIndex !== null)
      .map(p => {
        const won = winners.filter(w => w.playerId === p.id).reduce((s, w) => s + w.amount, 0)
        return { id: p.id, nickname: p.nickname, delta: won - p.totalBet }
      })

    // 构建摊牌/亮牌数据
    const showdownEntries = isFoldWin ? [] : playerList
      .filter(p => p.seatIndex !== null && p.holeCards && p.status !== 'folded')
      .map(p => ({
        id: p.id, nickname: p.nickname, seatIndex: p.seatIndex!,
        holeCards: p.holeCards!,
        handName: winners.find(w => w.playerId === p.id)?.handName ?? 'High Card',
      }))

    if (!isFoldWin) {
      this.broadcast('game:showdown', {
        players:        showdownEntries,
        communityCards: this.gameState.communityCards,
      })
    }

    // 弃牌获胜：所有持牌玩家都可选择是否亮牌
    // 若开启全部亮牌，无需等待任何人决定
    const canShowPlayers = playerList.filter(p => p.seatIndex !== null && p.holeCards)

    this.foldWinnerIds = (isFoldWin && !this.config.showAllCards)
      ? canShowPlayers.map(p => p.id)
      : []

    if (this.config.showAllCards) {
      // 全部亮牌模式：所有持牌玩家 300ms 后统一亮牌
      setTimeout(() => {
        for (const p of canShowPlayers) {
          this.broadcast('game:cardsShown', {
            playerId: p.id, nickname: p.nickname, seatIndex: p.seatIndex!, holeCards: p.holeCards!,
          })
        }
      }, 300)
    } else if (isFoldWin) {
      // 弃牌获胜：bot 玩家错开 200ms 逐个自动亮牌
      let delay = 400
      for (const p of canShowPlayers.filter(pp => pp.isBot)) {
        const bot = { ...p }
        const botDelay = delay
        delay += 200
        setTimeout(() => {
          if (!this.foldWinnerIds.includes(bot.id)) return
          if (bot.holeCards) {
            this.broadcast('game:cardsShown', {
              playerId: bot.id, nickname: bot.nickname, seatIndex: bot.seatIndex!, holeCards: bot.holeCards!,
            })
          }
          this.foldWinnerIds = this.foldWinnerIds.filter(id => id !== bot.id)
          this.broadcastRoomState()
        }, botDelay)
      }
    }

    // 广播结算结果
    this.broadcast('game:handComplete', {
      isFoldWin,
      foldWinnerIds: this.foldWinnerIds,
      dealerSeatIndex:     this.gameState.dealerSeatIndex,
      smallBlindSeatIndex: this.gameState.smallBlindSeatIndex,
      bigBlindSeatIndex:   this.gameState.bigBlindSeatIndex,
      winners: winners.map(w => ({
        id:       w.playerId,
        nickname: playerList.find(p => p.id === w.playerId)?.nickname ?? '',
        seatIndex: playerList.find(p => p.id === w.playerId)?.seatIndex ?? 0,
        potAmount: w.amount,
        handName:  w.handName,
      })),
      showdownPlayers: showdownEntries,
      playerDeltas: deltas,
      communityCards: this.gameState.communityCards,
      handNumber: this.handNumber,
    })

    this.lastHandResult = { isFoldWin, foldWinnerIds: [...this.foldWinnerIds] }
    this.betweenHands = true
    this.gameState = null

    // ── 清零玩家处理 ────────────────────────────────────────
    // Bot 自动充值；真人等待决定
    this.needsRebuyDecision = []
    for (const p of playerList.filter(p => p.seatIndex !== null && p.chips === 0)) {
      if (p.isBot) {
        p.chips = this.config.startingChips
        p.rebuyCount = (p.rebuyCount ?? 0) + 1
        logger.socket(TAG, `[${this.code}] bot ${p.nickname} 自动充值 (第${p.rebuyCount}次)`)
      } else {
        this.needsRebuyDecision.push(p.id)
      }
    }

    this.broadcastRoomState()
  }

  // ─────────────────────────────────────────────────────────
  // 充值 / 旁观
  // ─────────────────────────────────────────────────────────

  /** 玩家选择充值继续 */
  playerRebuy(socketId: string): void {
    const player = this.players.get(socketId)
    if (!player || !this.needsRebuyDecision.includes(socketId)) return
    player.chips = this.config.startingChips
    player.rebuyCount = (player.rebuyCount ?? 0) + 1
    this.needsRebuyDecision = this.needsRebuyDecision.filter(id => id !== socketId)
    this.broadcastRoomState()
    this.broadcastSystem(`${player.nickname} 充值继续（第 ${player.rebuyCount} 次）`)
  }

  /** 玩家选择放弃，转为观众 */
  playerSitOut(socketId: string): void {
    const player = this.players.get(socketId)
    if (!player || !this.needsRebuyDecision.includes(socketId)) return
    player.role       = 'spectator'
    player.seatIndex  = null
    player.chips      = 0
    this.needsRebuyDecision = this.needsRebuyDecision.filter(id => id !== socketId)
    // 若该玩家是房主，转让房主
    if (socketId === this.hostId) {
      const nextHost = [...this.players.values()].find(p => !p.isBot && p.seatIndex !== null)
      if (nextHost) {
        nextHost.role = 'host'
        this.hostId   = nextHost.id
        this.emit(nextHost.id, 'system:message', { type: 'info', text: '你已成为新房主', timestamp: Date.now() })
      }
    }
    this.broadcastRoomState()
    this.broadcastSystem(`${player.nickname} 筹码耗尽，成为观众`)
  }

  // ─────────────────────────────────────────────────────────
  // 转让房主
  // ─────────────────────────────────────────────────────────

  /** 房主将房主权限转让给指定玩家 */
  transferHost(socketId: string, targetId: string): void {
    if (socketId !== this.hostId) return
    const target = this.players.get(targetId)
    if (!target || target.isBot) return   // 不能转让给 bot

    const current = this.players.get(socketId)
    if (current) current.role = 'player'

    target.role = 'host'
    this.hostId = targetId

    this.emit(targetId, 'system:message', { type: 'info', text: '你已成为新房主', timestamp: Date.now() })
    this.broadcastSystem(`房主已转让给 ${target.nickname}`)
    this.broadcastRoomState()
  }

  // ─────────────────────────────────────────────────────────
  // 计时器
  // ─────────────────────────────────────────────────────────

  private scheduleCurrentPlayerTimer(): void {
    this.clearActionTimer()
    if (!this.gameState) return
    const seat   = this.gameState.currentSeatIndex
    const player = [...this.players.values()].find(p => p.seatIndex === seat)
    if (!player || player.isBot) return

    const ms = this.config.actionTimeoutSec * 1000
    this.broadcast('game:timer', {
      playerId:   player.id,
      expiresAt:  Date.now() + ms,
      timeoutSec: this.config.actionTimeoutSec,
    })

    this.actionTimer = setTimeout(() => {
      const legal = getLegalActions(this.gameState!, player)
      this.doAction(player.id, legal.canCheck ? { type: 'check' } : { type: 'fold' })
    }, ms)
  }

  private clearActionTimer(): void {
    if (this.actionTimer) { clearTimeout(this.actionTimer); this.actionTimer = null }
  }

  // ─────────────────────────────────────────────────────────
  // 机器人决策
  // ─────────────────────────────────────────────────────────

  private async triggerBotIfNeeded(): Promise<void> {
    try {
      if (!this.gameState) return
      const seat   = this.gameState.currentSeatIndex
      const player = [...this.players.values()].find(p => p.seatIndex === seat)
      if (!player?.isBot) return
      const bot = this.bots.get(player.id)
      if (!bot || !player.holeCards) return

      const delay = getBotThinkDelay(bot.difficulty)
      await sleep(delay)

      // 延迟后重新检查：游戏状态、当前回合是否仍是该 bot
      if (!this.gameState) return
      if (this.gameState.currentSeatIndex !== seat) return

      const action = await bot.decide({
        gameState:    this.gameState,
        myHand:       player.holeCards as [Card, Card],
        myPlayer:     player,
        legalActions: getLegalActions(this.gameState, player),
        allPlayers:   [...this.players.values()],
      })
      this.doAction(player.id, action)
    } catch (err) {
      logger.error(TAG, `[${this.code}] bot决策异常: ${err}`)
    }
  }

  // ─────────────────────────────────────────────────────────
  // 广播工具
  // ─────────────────────────────────────────────────────────

  private broadcast(event: string, data: unknown): void {
    this.io.to(this.code).emit(event, data)
  }

  private emit(targetId: string, event: string, data: unknown): void {
    const socket = this.sockets.get(targetId)
    if (socket) socket.emit(event, data)
    // 机器人无 socket，忽略
  }

  private broadcastSystem(text: string): void {
    this.broadcast('system:message', { type: 'info', text, timestamp: Date.now() })
  }

  broadcastRoomState(): void {
    this.broadcast('room:state', this.toPublicState())
  }

  private broadcastGameState(): void {
    this.broadcast('game:state', this.toPublicGameState())
  }

  // ─────────────────────────────────────────────────────────
  // 序列化
  // ─────────────────────────────────────────────────────────

  toPublicState(): PublicRoomState {
    return {
      id:       this.code,
      code:     this.code,
      shareUrl: `${this.publicUrl}/join/${this.code}`,
      status:   this.status as any,
      config:   this.config,
      players:  [...this.players.values()].map(this.toPublicPlayer),
      gameState: this.gameState
        ? { ...this.gameState }
        : null,
      spectatorCount: [...this.players.values()].filter(p => p.seatIndex === null).length,
      hostId: this.hostId,
      betweenHands: this.betweenHands,
      foldWinnerIds: [...this.foldWinnerIds],
      needsRebuyDecision: [...this.needsRebuyDecision],
    }
  }

  private toPublicGameState() {
    if (!this.gameState) return null
    const state = { ...this.gameState }
    const players = [...this.players.values()].map(this.toPublicPlayer)
    return { ...state, players }
  }

  private toPublicPlayer(p: Player): PublicPlayer {
    return {
      id: p.id, nickname: p.nickname, avatar: p.avatar,
      role: p.role, seatIndex: p.seatIndex, chips: p.chips,
      bet: p.bet, totalBet: p.totalBet, hasHoleCards: !!p.holeCards,
      status: p.status, isBot: p.isBot, privilegeLevel: p.privilegeLevel,
      isReady: p.isReady, rebuyCount: p.rebuyCount ?? 0,
    }
  }

  // ─────────────────────────────────────────────────────────
  // 工具
  // ─────────────────────────────────────────────────────────

  private nextFreeSeat(): number {
    const occupied = new Set([...this.players.values()].map(p => p.seatIndex).filter(s => s !== null))
    for (let i = 0; i < this.config.maxPlayers; i++) {
      if (!occupied.has(i)) return i
    }
    return this.config.maxPlayers
  }

  private randomAvatar(): string {
    const avatars = ['😀','😎','🤠','🧐','👻','🦊','🐯','🦁','🐸','🤖']
    return avatars[Math.floor(Math.random() * avatars.length)]
  }

  destroy(): void {
    this.clearActionTimer()
    for (const t of this.reconnectTimers.values()) clearTimeout(t)
    this.reconnectTimers.clear()
  }
}
