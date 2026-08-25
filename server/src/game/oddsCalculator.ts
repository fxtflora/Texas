// ============================================================
// oddsCalculator.ts — 蒙特卡洛胜率模拟
// 给定已知手牌和公共牌，估算各玩家胜率
// ============================================================

import type { Card } from '@shared/types'
import { createDeck, removeCards, shuffleDeck } from './deck'
import { evaluateHand, findWinnerIndices } from './handEvaluator'

export interface OddsResult {
  winProbability: number
  tieProbability: number
  loseProbability: number
}

/**
 * 蒙特卡洛胜率模拟
 *
 * @param playerHands  各玩家手牌（需知道，通常只有 Admin 视角或AI内部使用）
 * @param communityCards 已发出的公共牌（0-5张）
 * @param simulations  模拟次数（越多越准，越慢）
 * @returns 每位玩家对应的 OddsResult
 */
export function calculateOdds(
  playerHands: Array<[Card, Card]>,
  communityCards: Card[],
  simulations = 2000,
): OddsResult[] {
  const n = playerHands.length
  const wins  = new Array(n).fill(0)
  const ties  = new Array(n).fill(0)

  // 从完整牌堆中移除已知牌（手牌 + 公共牌）
  const knownCards: Card[] = [...communityCards, ...playerHands.flat()]
  const remainingDeck = removeCards(createDeck(), knownCards)

  const needed = 5 - communityCards.length  // 还需发几张公共牌

  for (let i = 0; i < simulations; i++) {
    // 随机补全公共牌
    const shuffled = shuffleDeck(remainingDeck)
    const fullBoard = [...communityCards, ...shuffled.slice(0, needed)]

    // 评估每位玩家手牌
    const results = playerHands.map(hand => evaluateHand([...hand, ...fullBoard]))

    // 找出赢家
    const winnerIndices = findWinnerIndices(results)

    if (winnerIndices.length === 1) {
      wins[winnerIndices[0]]++
    } else {
      // 平局：所有赢家各得一个 tie
      for (const idx of winnerIndices) {
        ties[idx]++
      }
    }
  }

  return playerHands.map((_, i) => ({
    winProbability: wins[i] / simulations,
    tieProbability: ties[i] / simulations,
    loseProbability: 1 - wins[i] / simulations - ties[i] / simulations,
  }))
}

/**
 * 快速粗略胜率（模拟次数少，用于 AI 翻牌后决策，约 1-3ms）
 */
export function quickOdds(
  myHand: [Card, Card],
  opponentCount: number,
  communityCards: Card[],
  simulations = 800,
): OddsResult {
  // 生成虚拟对手手牌（从剩余牌堆随机取）
  const knownCards: Card[] = [...communityCards, ...myHand]
  const deck = shuffleDeck(removeCards(createDeck(), knownCards))

  const opponents: Array<[Card, Card]> = []
  for (let i = 0; i < opponentCount; i++) {
    opponents.push([deck[i * 2], deck[i * 2 + 1]])
  }

  const allHands: Array<[Card, Card]> = [myHand, ...opponents]
  const fullDeck = removeCards(deck, opponents.flat())

  const wins  = { win: 0, tie: 0 }
  const needed = 5 - communityCards.length

  for (let i = 0; i < simulations; i++) {
    const shuffledRem = shuffleDeck(fullDeck)
    const fullBoard = [...communityCards, ...shuffledRem.slice(0, needed)]

    const results = allHands.map(hand => evaluateHand([...hand, ...fullBoard]))
    const winners = findWinnerIndices(results)

    if (winners.includes(0)) {
      if (winners.length === 1) {
        wins.win++
      } else {
        wins.tie++
      }
    }
  }

  return {
    winProbability: wins.win / simulations,
    tieProbability: wins.tie / simulations,
    loseProbability: 1 - wins.win / simulations - wins.tie / simulations,
  }
}
