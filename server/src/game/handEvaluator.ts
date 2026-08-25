// ============================================================
// handEvaluator.ts — 德州扑克手牌评估
// 支持 5-7 张牌输入，自动选最优5张
// 使用 base-15 数值编码，高值 = 强手牌，可直接数字比较
// ============================================================

import type { Card, HandName, HandResult } from '@shared/types'
import { HAND_NAME_ZH, RANK_VALUE } from '@shared/constants'
import { combinations } from './deck'

// ── 点数值映射（2=2 ... A=14） ─────────────────────────────
const RV = RANK_VALUE

// ── 手牌类型权重（用于 base-15 编码的最高位）─────────────────
const HAND_TYPE: Record<HandName, number> = {
  'High Card':       0,
  'One Pair':        1,
  'Two Pair':        2,
  'Three of a Kind': 3,
  'Straight':        4,
  'Flush':           5,
  'Full House':      6,
  'Four of a Kind':  7,
  'Straight Flush':  8,
  'Royal Flush':     8, // 与 Straight Flush 同类型，靠 tiebreaker 区分
}

/**
 * 将手牌类型和 tiebreaker 数组编码为单一可比较数值
 * 格式: type * 15^5 + tb[0] * 15^4 + ... + tb[4]
 */
function encodeRank(type: number, tbs: number[]): number {
  const padded = [...tbs, 0, 0, 0, 0, 0].slice(0, 5)
  return (
    type * 759375 +       // 15^5
    padded[0] * 50625 +   // 15^4
    padded[1] * 3375  +   // 15^3
    padded[2] * 225   +   // 15^2
    padded[3] * 15    +   // 15^1
    padded[4]             // 15^0
  )
}

/** 检查是否为顺子，返回最高牌值（A-2-3-4-5 时返回 5） */
function getStraightHigh(sortedDesc: number[]): number | null {
  const u = [...new Set(sortedDesc)].sort((a, b) => b - a)
  if (u.length < 5) return null

  // 普通顺子
  if (u[0] - u[4] === 4) return u[0]

  // 轮子顺子 A-2-3-4-5
  if (u[0] === 14 && u[1] === 5 && u[2] === 4 && u[3] === 3 && u[4] === 2) return 5

  return null
}

/** 对一手恰好 5 张牌求值，返回 HandResult */
function evaluate5Card(hand: Card[]): HandResult {
  const ranks   = hand.map(c => RV[c.rank]).sort((a, b) => b - a)
  const suits   = hand.map(c => c.suit)
  const isFlush = suits.every(s => s === suits[0])

  // ── rank 计数 ─────────────────────────────────────────────
  const cnt = new Map<number, number>()
  for (const r of ranks) cnt.set(r, (cnt.get(r) ?? 0) + 1)

  // 按【出现次数降序, 点数降序】排列
  const groups = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const topCount = groups[0][1]

  // ── 顺子检查 ──────────────────────────────────────────────
  const strHigh = getStraightHigh(ranks)
  const isStraight = strHigh !== null

  // ── 判断牌型 ──────────────────────────────────────────────

  // 同花顺 / 皇家同花顺
  if (isFlush && isStraight) {
    const isRoyal = strHigh === 14 && ranks[1] === 13
    const name: HandName = isRoyal ? 'Royal Flush' : 'Straight Flush'
    const rank = encodeRank(HAND_TYPE[name], [strHigh!])
    return {
      rank,
      name,
      bestFive: [...hand].sort((a, b) => RV[b.rank] - RV[a.rank]),
      description: isRoyal ? HAND_NAME_ZH['Royal Flush'] : `${HAND_NAME_ZH['Straight Flush']}（${strHigh!}高）`,
    }
  }

  // 四条
  if (topCount === 4) {
    const quadRank   = groups[0][0]
    const kickerRank = groups[1][0]
    return {
      rank: encodeRank(HAND_TYPE['Four of a Kind'], [quadRank, kickerRank]),
      name: 'Four of a Kind',
      bestFive: sortBestFive(hand, groups),
      description: `${HAND_NAME_ZH['Four of a Kind']} ${quadRank}s`,
    }
  }

  // 葫芦
  if (topCount === 3 && groups[1][1] === 2) {
    const tripsRank = groups[0][0]
    const pairRank  = groups[1][0]
    return {
      rank: encodeRank(HAND_TYPE['Full House'], [tripsRank, pairRank]),
      name: 'Full House',
      bestFive: sortBestFive(hand, groups),
      description: `${HAND_NAME_ZH['Full House']} ${tripsRank}s满${pairRank}s`,
    }
  }

  // 同花
  if (isFlush) {
    return {
      rank: encodeRank(HAND_TYPE['Flush'], ranks),
      name: 'Flush',
      bestFive: [...hand].sort((a, b) => RV[b.rank] - RV[a.rank]),
      description: `${HAND_NAME_ZH['Flush']}（${ranks[0]}高）`,
    }
  }

  // 顺子
  if (isStraight) {
    return {
      rank: encodeRank(HAND_TYPE['Straight'], [strHigh!]),
      name: 'Straight',
      bestFive: [...hand].sort((a, b) => RV[b.rank] - RV[a.rank]),
      description: `${HAND_NAME_ZH['Straight']}（${strHigh!}高）`,
    }
  }

  // 三条
  if (topCount === 3) {
    const tripsRank  = groups[0][0]
    const kicker1    = groups[1][0]
    const kicker2    = groups[2][0]
    return {
      rank: encodeRank(HAND_TYPE['Three of a Kind'], [tripsRank, kicker1, kicker2]),
      name: 'Three of a Kind',
      bestFive: sortBestFive(hand, groups),
      description: `${HAND_NAME_ZH['Three of a Kind']} ${tripsRank}s`,
    }
  }

  // 两对
  if (topCount === 2 && groups[1][1] === 2) {
    const pairs = groups.filter(g => g[1] === 2).map(g => g[0]).sort((a, b) => b - a)
    const kicker = groups.find(g => g[1] === 1)![0]
    return {
      rank: encodeRank(HAND_TYPE['Two Pair'], [pairs[0], pairs[1], kicker]),
      name: 'Two Pair',
      bestFive: sortBestFive(hand, groups),
      description: `${HAND_NAME_ZH['Two Pair']} ${pairs[0]}s和${pairs[1]}s`,
    }
  }

  // 一对
  if (topCount === 2) {
    const pairRank = groups[0][0]
    const kickers  = groups.filter(g => g[1] === 1).map(g => g[0]).sort((a, b) => b - a)
    return {
      rank: encodeRank(HAND_TYPE['One Pair'], [pairRank, ...kickers]),
      name: 'One Pair',
      bestFive: sortBestFive(hand, groups),
      description: `${HAND_NAME_ZH['One Pair']} ${pairRank}s`,
    }
  }

  // 高牌
  return {
    rank: encodeRank(HAND_TYPE['High Card'], ranks),
    name: 'High Card',
    bestFive: [...hand].sort((a, b) => RV[b.rank] - RV[a.rank]),
    description: `${HAND_NAME_ZH['High Card']}（${ranks[0]}）`,
  }
}

/** 按组别顺序排列最优5张（用于显示） */
function sortBestFive(hand: Card[], groups: [number, number][]): Card[] {
  const order = groups.flatMap(([r, c]) => Array(c).fill(r) as number[])
  return [...hand].sort((a, b) => {
    const ai = order.indexOf(RV[a.rank])
    const bi = order.indexOf(RV[b.rank])
    return ai - bi
  })
}

// ── 公共 API ──────────────────────────────────────────────

/**
 * 从 5-7 张牌中评估最优 5 张手牌
 * @param cards 玩家手牌 + 公共牌（5-7张）
 */
export function evaluateHand(cards: Card[]): HandResult {
  if (cards.length < 5) throw new Error(`evaluateHand: 至少需要5张牌，收到${cards.length}张`)
  if (cards.length === 5) return evaluate5Card(cards)

  // 从 n 张中枚举所有 C(n,5) 组合，取最高分
  let best: HandResult | null = null
  for (const combo of combinations(cards, 5)) {
    const result = evaluate5Card(combo)
    if (best === null || result.rank > best.rank) {
      best = result
    }
  }
  return best!
}

/**
 * 比较两手牌
 * @returns 1 = a 更强, -1 = b 更强, 0 = 平局
 */
export function compareHands(a: HandResult, b: HandResult): 1 | -1 | 0 {
  if (a.rank > b.rank) return 1
  if (a.rank < b.rank) return -1
  return 0
}

/**
 * 在多个手牌中找出赢家索引（支持多人平局）
 * @returns 赢家在输入数组中的索引列表
 */
export function findWinnerIndices(results: HandResult[]): number[] {
  const maxRank = Math.max(...results.map(r => r.rank))
  return results.reduce<number[]>((acc, r, i) => {
    if (r.rank === maxRank) acc.push(i)
    return acc
  }, [])
}
