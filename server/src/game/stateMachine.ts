// ============================================================
// stateMachine.ts — NLHE 游戏状态机（纯函数，无副作用）
// 所有函数接收当前状态并返回新状态，不修改原对象
// ============================================================

import type {
  Card, Player, GameState, GamePhase,
  ActionType, ActionRecord, SidePot,
  RoomConfig, GameActionPayload,
} from '@shared/types'
import { NEXT_HAND_DELAY_MS, DEFAULT_ACTION_TIMEOUT_SEC } from '@shared/constants'
import { createShuffledDeck, dealCards } from './deck'
import { calculatePots, totalPotAmount } from './potCalculator'
import { evaluateHand, findWinnerIndices } from './handEvaluator'
import { getLegalActions, validateAction } from './legalActions'

// ── 类型扩展 ────────────────────────────────────────────────

export interface InitHandResult {
  gameState: GameState
  updatedPlayers: Player[]
  deck: Card[]           // 剩余牌堆（服务端私有，不下发客户端）
}

export interface ApplyActionResult {
  newState: GameState
  newPlayers: Player[]
  newDeck: Card[]
  roundComplete: boolean // 当前轮次行动是否结束
  error?: string
}

export interface AdvancePhaseResult {
  newState: GameState
  newPlayers: Player[]
  newDeck: Card[]
}

export interface WinnerInfo {
  playerId: string
  potIndex: number       // 赢得的是哪个底池（0=主池，1+= 边池）
  amount: number
  handName: string
  handRank: number
}

// ── 工具函数 ────────────────────────────────────────────────

/** 找到座位索引下一个应该行动的玩家（跳过弃牌/All-in/断线） */
function nextActiveSeat(
  players: Player[],
  fromSeat: number,
  direction: 1 | -1 = 1,
): number {
  const n = players.filter(p => p.seatIndex !== null).length
  if (n === 0) return fromSeat

  const seats = players
    .filter(p => p.seatIndex !== null)
    .map(p => p.seatIndex!)
    .sort((a, b) => a - b)

  let idx = seats.indexOf(fromSeat)
  for (let step = 1; step <= seats.length; step++) {
    const nextIdx = (idx + direction * step + seats.length) % seats.length
    const seat = seats[nextIdx]
    const p = players.find(pl => pl.seatIndex === seat)
    if (p && (p.status === 'active' || p.status === 'waiting')) {
      return seat
    }
  }
  return fromSeat
}

/** 找到行动顺序中 dealerSeat 之后的第 n 个活跃玩家的座位 */
function seatAfterDealer(players: Player[], dealerSeat: number, offset: number): number {
  const active = players
    .filter(p => p.seatIndex !== null && p.chips > 0)
    .sort((a, b) => {
      const N  = players.filter(p => p.seatIndex !== null).length || 10
      const ai = (a.seatIndex! - dealerSeat + N * 2) % N
      const bi = (b.seatIndex! - dealerSeat + N * 2) % N
      return ai - bi
    })

  if (active.length === 0) return dealerSeat
  return active[offset % active.length]?.seatIndex ?? dealerSeat
}

/** 克隆玩家数组（防止状态污染） */
function clonePlayers(players: Player[]): Player[] {
  return players.map(p => ({ ...p, holeCards: p.holeCards ? [...p.holeCards] : null }))
}

// ── 初始化新一局 ────────────────────────────────────────────

/**
 * 初始化新一局游戏
 * - 洗牌、确定庄家/盲注位置、发手牌、收盲注
 */
export function initHand(
  config: RoomConfig,
  players: Player[],
  handNumber: number,
  prevDealerSeat: number,
): InitHandResult {
  const ps = clonePlayers(players)

  // 重置所有玩家状态：有筹码→等待参与，无筹码→旁观
  // 必须覆盖上一局残留的 'active'/'folded'/'allIn' 状态
  for (const p of ps) {
    if (p.chips <= 0) p.status = 'sitOut'
    else              p.status = 'waiting'
    // 清除上局手牌
    p.holeCards = null
    p.bet       = 0
    p.totalBet  = 0
    p.hasActed  = false
  }

  const activePlayers = ps.filter(p => p.status === 'waiting' && p.seatIndex !== null)
  if (activePlayers.length < 2) throw new Error('活跃玩家不足2人，无法开始')

  // ── 确定庄家、小盲、大盲位置 ────────────────────────────
  const dealerSeat = seatAfterDealer(activePlayers, prevDealerSeat, 1)

  // 两人对战（Heads-up）特殊规则：庄家 = 小盲，先行动
  const isHeadsUp = activePlayers.length === 2
  const sbSeat    = isHeadsUp
    ? dealerSeat
    : seatAfterDealer(activePlayers, dealerSeat, 1)
  const bbSeat    = seatAfterDealer(activePlayers, dealerSeat, isHeadsUp ? 1 : 2)
  // 翻牌前：Heads-up时庄家/SB先行动；普通时UTG（BB后第一个）先行动
  const utg       = isHeadsUp
    ? dealerSeat
    : seatAfterDealer(activePlayers, dealerSeat, 3)

  // ── 洗牌发牌 ────────────────────────────────────────────
  let deck = createShuffledDeck(config.cardType ?? 'standard')
  for (const p of ps) {
    if (p.status !== 'waiting') continue
    let cards: Card[]
    ;[cards, deck] = dealCards(deck, 2)
    p.holeCards = [cards[0], cards[1]]
    p.status    = 'active'
  }

  // ── 收盲注 ────────────────────────────────────────────
  const sbPlayer = ps.find(p => p.seatIndex === sbSeat)!
  const bbPlayer = ps.find(p => p.seatIndex === bbSeat)!

  const sbAmount = Math.min(config.smallBlind, sbPlayer.chips)
  const bbAmount = Math.min(config.bigBlind,   bbPlayer.chips)

  sbPlayer.chips    -= sbAmount
  sbPlayer.bet       = sbAmount
  sbPlayer.totalBet  = sbAmount
  sbPlayer.hasActed  = false      // 盲注不算主动行动
  if (sbPlayer.chips === 0) sbPlayer.status = 'allIn'

  bbPlayer.chips    -= bbAmount
  bbPlayer.bet       = bbAmount
  bbPlayer.totalBet  = bbAmount
  bbPlayer.hasActed  = false      // 大盲注不算主动行动（保留 BB option）
  if (bbPlayer.chips === 0) bbPlayer.status = 'allIn'

  const actionHistory: ActionRecord[] = [
    { playerId: sbPlayer.id, playerName: sbPlayer.nickname, action: 'blind', amount: sbAmount, timestamp: Date.now(), phase: 'preflop' },
    { playerId: bbPlayer.id, playerName: bbPlayer.nickname, action: 'blind', amount: bbAmount, timestamp: Date.now(), phase: 'preflop' },
  ]

  // ── 构建初始游戏状态 ──────────────────────────────────
  const gameState: GameState = {
    phase:               'preflop',
    communityCards:      [],
    mainPot:             sbAmount + bbAmount,
    sidePots:            [],
    currentBet:          bbAmount,
    minRaise:            bbAmount,   // 最小加注 = 大盲注
    dealerSeatIndex:     dealerSeat,
    smallBlindSeatIndex: sbSeat,
    bigBlindSeatIndex:   bbSeat,
    currentSeatIndex:    utg,        // UTG 先行动
    actionHistory,
    handNumber,
    timerExpiresAt: Date.now() + config.actionTimeoutSec * 1000,
  }

  return { gameState, updatedPlayers: ps, deck }
}

// ── 处理玩家行动 ────────────────────────────────────────────

export function applyAction(
  state: GameState,
  players: Player[],
  deck: Card[],
  playerId: string,
  action: GameActionPayload,
): ApplyActionResult {
  const ps    = clonePlayers(players)
  const actor = ps.find(p => p.id === playerId)

  if (!actor) return { newState: state, newPlayers: players, newDeck: deck, roundComplete: false, error: '玩家不存在' }
  if (actor.seatIndex !== state.currentSeatIndex) return { newState: state, newPlayers: players, newDeck: deck, roundComplete: false, error: '不是你的回合' }

  const legal = getLegalActions(state, actor)
  const check = validateAction(state, actor, action)
  if (!check.valid) return { newState: state, newPlayers: players, newDeck: deck, roundComplete: false, error: check.reason }

  let newState = { ...state }
  let actualAmount = 0
  let actionType: ActionType = action.type as ActionType

  switch (action.type) {
    case 'fold':
      actor.status   = 'folded'
      actor.hasActed = true
      break

    case 'check':
      actor.hasActed = true
      break

    case 'call': {
      const toCall = legal.callAmount
      actor.chips   -= toCall
      actor.bet     += toCall
      actor.totalBet += toCall
      actor.hasActed  = true
      actualAmount   = toCall
      if (actor.chips === 0) {
        actor.status  = 'allIn'
        actionType    = 'allIn'
      }
      break
    }

    case 'raise': {
      const raiseTotal = action.amount ?? legal.minRaise
      const toAdd      = raiseTotal - actor.bet
      actor.chips    -= toAdd
      actor.bet       = raiseTotal
      actor.totalBet += toAdd
      actor.hasActed  = true
      actualAmount    = raiseTotal
      newState.currentBet = raiseTotal
      newState.minRaise   = raiseTotal - state.currentBet
      // 加注后，其他活跃玩家需要重新行动
      for (const p of ps) {
        if (p.id !== actor.id && p.status === 'active') p.hasActed = false
      }
      if (actor.chips === 0) {
        actor.status = 'allIn'
        actionType   = 'allIn'
      }
      break
    }

    case 'allIn': {
      const allInAmount = actor.chips
      actor.bet        += allInAmount
      actor.totalBet   += allInAmount
      actor.chips       = 0
      actor.status      = 'allIn'
      actor.hasActed    = true
      actualAmount      = actor.bet   // 记录总下注量，便于显示"all-in 500"
      if (actor.bet > newState.currentBet) {
        newState.minRaise   = actor.bet - newState.currentBet
        newState.currentBet = actor.bet
        // 超过当前注的全押视为加注，其他人需重新行动
        for (const p of ps) {
          if (p.id !== actor.id && p.status === 'active') p.hasActed = false
        }
      }
      break
    }
  }

  // ── 重新计算底池 ────────────────────────────────────────
  const allPots  = calculatePots(ps)
  const totalPot = totalPotAmount(allPots)
  newState.mainPot   = totalPot   // 临时存入 mainPot，摊牌时再拆分
  newState.sidePots  = []

  // ── 记录行动历史 ────────────────────────────────────────
  newState.actionHistory = [
    ...state.actionHistory,
    {
      playerId:   actor.id,
      playerName: actor.nickname,
      action:     actionType,
      amount:     actualAmount,
      timestamp:  Date.now(),
      phase:      state.phase,
    },
  ]

  // ── 检查是否只剩一人未弃牌 ─────────────────────────────
  const notFolded = ps.filter(p => p.status !== 'folded' && p.status !== 'sitOut' && p.seatIndex !== null)
  if (notFolded.length === 1) {
    // 其余全部弃牌，直接结束
    newState.phase = 'finished'
    return { newState, newPlayers: ps, newDeck: deck, roundComplete: true }
  }

  // ── 推进到下一个行动玩家 ────────────────────────────────
  const nextSeat = findNextActiveSeat(ps, state.currentSeatIndex)
  newState.currentSeatIndex = nextSeat
  newState.timerExpiresAt   = Date.now() + 30 * 1000

  // ── 检查当前轮次是否结束 ────────────────────────────────
  const roundComplete = isBettingRoundComplete(newState, ps)

  return { newState, newPlayers: ps, newDeck: deck, roundComplete }
}

/** 找下一个需要行动的玩家座位（跳过 folded / allIn / sitOut） */
function findNextActiveSeat(players: Player[], currentSeat: number): number {
  const active = players
    .filter(p => p.status === 'active' && p.seatIndex !== null)
    .sort((a, b) => a.seatIndex! - b.seatIndex!)

  if (active.length === 0) return currentSeat

  const idx = active.findIndex(p => p.seatIndex! > currentSeat)
  if (idx === -1) return active[0].seatIndex!
  return active[idx].seatIndex!
}

/** 判断当前轮次行动是否结束 */
export function isBettingRoundComplete(state: GameState, players: Player[]): boolean {
  const activePlayers = players.filter(
    p => p.status === 'active' && p.seatIndex !== null,
  )

  if (activePlayers.length === 0) return true

  // 必须：所有活跃玩家都已经行动过本轮（hasActed=true）
  // 且：下注额都等于当前最高注
  return activePlayers.every(p => p.hasActed && p.bet === state.currentBet)
}

// ── 推进到下一阶段 ──────────────────────────────────────────

const PHASE_ORDER: GamePhase[] = ['preflop', 'flop', 'turn', 'river', 'showdown']

export function advancePhase(
  state: GameState,
  players: Player[],
  deck: Card[],
  bigBlind: number = 20,  // 新街最小下注额（用于重置 minRaise）
): AdvancePhaseResult {
  const ps         = clonePlayers(players)
  let   newDeck    = [...deck]
  let   newState   = { ...state }

  const currentIdx = PHASE_ORDER.indexOf(state.phase)
  const nextPhase  = PHASE_ORDER[currentIdx + 1] ?? 'showdown'

  newState.phase = nextPhase

  // ── 发公共牌 ────────────────────────────────────────────
  let newCards: Card[] = []
  if (nextPhase === 'flop') {
    ;[newCards, newDeck] = dealCards(newDeck, 3)
  } else if (nextPhase === 'turn' || nextPhase === 'river') {
    ;[newCards, newDeck] = dealCards(newDeck, 1)
  }
  newState.communityCards = [...state.communityCards, ...newCards]

  // ── 重置本轮下注 ─────────────────────────────────────────
  for (const p of ps) {
    if (p.status === 'active') {
      p.bet      = 0
      p.hasActed = false    // 新街每人都需重新行动
    }
  }
  newState.currentBet = 0
  newState.minRaise   = bigBlind  // 新街最小下注重置为大盲注

  // ── 找到第一个行动的玩家（庄家左边第一个活跃玩家）────────
  const firstToAct = findFirstToActPostFlop(ps, state.dealerSeatIndex)
  newState.currentSeatIndex = firstToAct
  newState.timerExpiresAt   = Date.now() + DEFAULT_ACTION_TIMEOUT_SEC * 1000

  return { newState, newPlayers: ps, newDeck }
}

function findFirstToActPostFlop(players: Player[], dealerSeat: number): number {
  const N = players.filter(p => p.seatIndex !== null).length || 10
  const active = players
    .filter(p => p.status === 'active' && p.seatIndex !== null)
    .sort((a, b) => {
      // 按照距庄家座位的顺时针距离排序
      const ad = (a.seatIndex! - dealerSeat + N * 2) % N
      const bd = (b.seatIndex! - dealerSeat + N * 2) % N
      return ad - bd
    })

  return active[0]?.seatIndex ?? dealerSeat
}

// ── 摊牌决定赢家 ────────────────────────────────────────────

export interface ShowdownWinner {
  playerId:   string
  potIndex:   number
  amount:     number
  handName:   string
  handRank:   number
  bestFive:   Card[]
}

export function determineWinners(
  state:   GameState,
  players: Player[],
): ShowdownWinner[] {
  const ps = clonePlayers(players)

  // 最终边池分配
  const pots = calculatePots(ps)
  if (pots.length === 0) return []

  const winners: ShowdownWinner[] = []

  for (let potIdx = 0; potIdx < pots.length; potIdx++) {
    const pot = pots[potIdx]
    if (pot.amount === 0) continue

    const eligiblePlayers = ps.filter(
      p => pot.eligiblePlayerIds.includes(p.id) && p.holeCards,
    )
    if (eligiblePlayers.length === 0) continue

    // 只剩一位有资格的玩家（其余全弃牌）—— 直接获胜，无需评估手牌
    if (eligiblePlayers.length === 1) {
      const p = eligiblePlayers[0]
      winners.push({
        playerId: p.id,
        potIndex: potIdx,
        amount:   pot.amount,
        handName: 'High Card',
        handRank: 0,
        bestFive: [],
      })
      continue
    }

    // 公共牌不足5张时（理论上不应出现，保护性处理）
    const allCards = (p: Player) => [...p.holeCards!, ...state.communityCards]
    if (allCards(eligiblePlayers[0]).length < 5) {
      // 直接给第一个人（不做手牌比较）
      winners.push({
        playerId: eligiblePlayers[0].id,
        potIndex: potIdx,
        amount:   pot.amount,
        handName: 'High Card',
        handRank: 0,
        bestFive: [],
      })
      continue
    }

    // 评估每位有资格玩家的最强手牌
    const evaluated = eligiblePlayers.map(p => ({
      player:  p,
      result:  evaluateHand([...p.holeCards!, ...state.communityCards]),
    }))

    const bestRank = Math.max(...evaluated.map(e => e.result.rank))
    const potWinners = evaluated.filter(e => e.result.rank === bestRank)

    // 平分底池
    const share = Math.floor(pot.amount / potWinners.length)
    for (const { player, result } of potWinners) {
      player.chips += share
      winners.push({
        playerId: player.id,
        potIndex: potIdx,
        amount:   share,
        handName: result.name,
        handRank: result.rank,
        bestFive: result.bestFive,
      })
    }

    // 奇数筹码零头给第一位赢家
    const remainder = pot.amount % potWinners.length
    if (remainder > 0) {
      const first = potWinners[0].player
      first.chips += remainder
      const w = winners.find(w => w.playerId === first.id && w.potIndex === potIdx)
      if (w) w.amount += remainder
    }
  }

  return winners
}
