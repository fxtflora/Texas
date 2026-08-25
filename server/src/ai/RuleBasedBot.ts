// ============================================================
// RuleBasedBot.ts — 规则机器人
// 翻牌前：Chen 公式 + 位置调整
// 翻牌后：蒙特卡洛胜率 + 底池赔率
// ============================================================

import type { Card, GameActionPayload } from '@shared/types'
import { RANK_VALUE } from '@shared/constants'
import type { BotInterface, BotDecideContext } from './BotInterface'
import { quickOdds } from '../game/oddsCalculator'

interface BotConfig {
  difficulty:    'easy' | 'medium' | 'hard'
  simulations:   number   // 蒙特卡洛模拟次数
  randomness:    number   // 随机决策概率 (0-1)
  bluffFreq:     number   // 诈唬频率 (0-1)
  positionAware: boolean  // 是否考虑位置
}

const BOT_CONFIGS: Record<string, BotConfig> = {
  easy:   { difficulty: 'easy',   simulations: 500,  randomness: 0.25, bluffFreq: 0.05, positionAware: false },
  medium: { difficulty: 'medium', simulations: 1000, randomness: 0.10, bluffFreq: 0.15, positionAware: true  },
  hard:   { difficulty: 'hard',   simulations: 3000, randomness: 0.03, bluffFreq: 0.25, positionAware: true  },
}

// ── Chen 公式翻牌前手牌评分 ────────────────────────────────

/** 牌的 Chen 公式基础分 */
function chenBaseScore(rank: string): number {
  const rv = RANK_VALUE[rank]
  if (rv >= 14) return 10   // A
  if (rv >= 13) return 8    // K
  if (rv >= 12) return 7    // Q
  if (rv >= 11) return 6    // J
  return rv / 2             // 2-T: 1-5分
}

/**
 * Chen 公式计算翻牌前手牌强度（0-20分）
 * 越高越强，适合用来判断是否值得参与底池
 */
export function calcChenScore(hand: [Card, Card]): number {
  const [a, b] = hand
  const av = RANK_VALUE[a.rank]
  const bv = RANK_VALUE[b.rank]
  const high = av >= bv ? a : b
  const low  = av >= bv ? b : a

  let score = chenBaseScore(high.rank)

  // 对子
  if (av === bv) {
    score = Math.max(score * 2, 5)
    return Math.round(score)
  }

  // 同花加分
  if (a.suit === b.suit) score += 2

  // 连牌加分（间隔越小加分越多）
  const gap = RANK_VALUE[high.rank] - RANK_VALUE[low.rank] - 1
  if (gap === 0)      score += 1
  else if (gap === 1) score -= 1
  else if (gap === 2) score -= 2
  else if (gap === 3) score -= 4
  else                score -= 5

  // 低牌惩罚（两张都低于 Q）
  if (RANK_VALUE[high.rank] < 12 && gap >= 0) score -= 1

  return Math.max(0, Math.round(score))
}

/** 位置加分（晚位有信息优势） */
function positionBonus(
  seatIndex: number,
  dealerSeat: number,
  totalSeats: number,
): number {
  const relativePos = (seatIndex - dealerSeat + 10) % totalSeats
  if (relativePos === 0) return 3     // 按钮位（庄家）
  if (relativePos === totalSeats - 1) return 2  // CO
  if (relativePos === totalSeats - 2) return 1  // HJ
  if (relativePos <= 2) return -2     // 早位（UTG/UTG+1）
  return 0
}

// ── 规则机器人主类 ──────────────────────────────────────────

export class RuleBasedBot implements BotInterface {
  readonly name: string
  readonly difficulty: 'easy' | 'medium' | 'hard'
  private cfg: BotConfig

  constructor(difficulty: 'easy' | 'medium' | 'hard' = 'medium', name?: string) {
    this.difficulty = difficulty
    this.cfg        = BOT_CONFIGS[difficulty]
    this.name       = name ?? `Bot-${difficulty[0].toUpperCase()}`
  }

  async decide(ctx: BotDecideContext): Promise<GameActionPayload> {
    const { gameState, myHand, myPlayer, legalActions, allPlayers } = ctx

    // 随机性：偶尔做出反常规决策（模拟人类不可预测性）
    if (Math.random() < this.cfg.randomness) {
      return this.randomAction(legalActions)
    }

    const opponentCount = allPlayers.filter(
      p => p.id !== myPlayer.id && p.status !== 'folded' && p.seatIndex !== null,
    ).length

    if (gameState.phase === 'preflop') {
      return this.preflopDecide(ctx, opponentCount)
    } else {
      return this.postflopDecide(ctx, opponentCount)
    }
  }

  // ── 翻牌前决策 ──────────────────────────────────────────

  private preflopDecide(ctx: BotDecideContext, opponentCount: number): GameActionPayload {
    const { gameState, myHand, myPlayer, legalActions, allPlayers } = ctx

    let score = calcChenScore(myHand)

    // 位置调整
    if (this.cfg.positionAware && myPlayer.seatIndex !== null) {
      const totalActive = allPlayers.filter(p => p.status !== 'sitOut' && p.seatIndex !== null).length
      score += positionBonus(myPlayer.seatIndex, gameState.dealerSeatIndex, totalActive)
    }

    const bb       = gameState.minRaise
    const potOdds  = legalActions.callAmount / (gameState.mainPot + legalActions.callAmount + 0.001)

    if (score >= 15) {
      // 强手：加注
      if (legalActions.canRaise) {
        const raiseAmount = Math.min(
          legalActions.maxRaise,
          Math.max(legalActions.minRaise, Math.round(bb * (2.5 + Math.random()))),
        )
        return { type: 'raise', amount: raiseAmount }
      }
      return { type: 'call' }
    }

    if (score >= 10) {
      // 中强手：跟注或小加注
      if (legalActions.canCheck) return { type: 'check' }
      if (legalActions.canCall)  return { type: 'call' }
    }

    if (score >= 7 && potOdds < 0.2) {
      // 边缘牌：只在赔率合适时跟注
      if (legalActions.canCheck) return { type: 'check' }
      if (legalActions.canCall && legalActions.callAmount <= bb * 2) return { type: 'call' }
    }

    // 弱手：弃牌（若不能过牌）
    if (legalActions.canCheck) return { type: 'check' }
    return { type: 'fold' }
  }

  // ── 翻牌后决策 ──────────────────────────────────────────

  private postflopDecide(ctx: BotDecideContext, opponentCount: number): GameActionPayload {
    const { gameState, myHand, legalActions } = ctx

    // 蒙特卡洛胜率
    const odds = quickOdds(
      myHand,
      opponentCount,
      gameState.communityCards,
      this.cfg.simulations,
    )

    const winRate = odds.winProbability + odds.tieProbability * 0.5
    const potOdds = legalActions.callAmount /
      (gameState.mainPot + legalActions.callAmount + 0.001)

    // 强手（胜率 > 70%）：积极下注/加注
    if (winRate > 0.70) {
      if (legalActions.canRaise) {
        const pot = gameState.mainPot
        const bet = Math.min(
          legalActions.maxRaise,
          Math.max(legalActions.minRaise, Math.round(pot * (0.6 + Math.random() * 0.6))),
        )
        return { type: 'raise', amount: bet }
      }
      if (legalActions.canCall) return { type: 'call' }
      return { type: 'check' }
    }

    // 中等手牌（胜率 > 底池赔率）：跟注
    if (winRate > potOdds + 0.05) {
      if (legalActions.canCheck) return { type: 'check' }
      if (legalActions.canCall)  return { type: 'call' }
    }

    // 诈唬（胜率差但概率触发）
    if (winRate > 0.25 && Math.random() < this.cfg.bluffFreq) {
      if (legalActions.canRaise) {
        const bluffBet = Math.min(
          legalActions.maxRaise,
          Math.max(legalActions.minRaise, Math.round(gameState.mainPot * 0.5)),
        )
        return { type: 'raise', amount: bluffBet }
      }
    }

    // 弱手：弃牌或过牌
    if (legalActions.canCheck) return { type: 'check' }
    return { type: 'fold' }
  }

  // ── 随机行动（用于引入不可预测性） ──────────────────────

  private randomAction(legal: BotDecideContext['legalActions']): GameActionPayload {
    const options: GameActionPayload[] = []
    if (legal.canCheck) options.push({ type: 'check' })
    if (legal.canCall)  options.push({ type: 'call' })
    if (legal.canRaise) options.push({ type: 'raise', amount: legal.minRaise })
    options.push({ type: 'fold' })
    return options[Math.floor(Math.random() * options.length)]
  }
}
