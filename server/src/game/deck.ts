// ============================================================
// deck.ts — 牌组创建、洗牌、工具函数
// ============================================================

import type { Card, Rank, Suit } from '@shared/types'
import { RANKS, SUITS, SUIT_SYMBOLS, RANK_VALUE } from '@shared/constants'

/** 短牌排除的点数（2-5） */
const SHORT_DECK_EXCLUDE = new Set(['2', '3', '4', '5'])

/** 创建标准52张牌（未洗牌） */
export function createDeck(type: 'standard' | 'short' = 'standard'): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (type === 'short' && SHORT_DECK_EXCLUDE.has(rank)) continue
      deck.push({ rank, suit })
    }
  }
  return deck
}

/** Fisher-Yates 洗牌（返回新数组，不修改原数组） */
export function shuffleDeck(deck: Card[]): Card[] {
  const arr = [...deck]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** 创建并洗好的完整牌堆 */
export function createShuffledDeck(type: 'standard' | 'short' = 'standard'): Card[] {
  return shuffleDeck(createDeck(type))
}

/** 从牌堆顶部取 n 张牌，返回 [取出的牌, 剩余牌堆] */
export function dealCards(deck: Card[], n: number): [Card[], Card[]] {
  return [deck.slice(0, n), deck.slice(n)]
}

/** 从牌堆中移除指定的牌（用于组合剩余牌堆时去掉已知牌） */
export function removeCards(deck: Card[], toRemove: Card[]): Card[] {
  const removeSet = new Set(toRemove.map(cardKey))
  return deck.filter(c => !removeSet.has(cardKey(c)))
}

/** 牌的唯一键，用于集合/映射 */
export function cardKey(card: Card): string {
  return `${card.rank}${card.suit[0]}`
}

/** 牌的显示字符串，如 "A♠" */
export function cardToString(card: Card): string {
  return `${card.rank === 'T' ? '10' : card.rank}${SUIT_SYMBOLS[card.suit]}`
}

/** 获取牌的点数值（2-14，A最大） */
export function rankValue(card: Card): number {
  return RANK_VALUE[card.rank]
}

/** 比较两张牌的点数大小 */
export function compareCardRanks(a: Card, b: Card): number {
  return RANK_VALUE[a.rank] - RANK_VALUE[b.rank]
}

/** 从 n 张牌中生成所有 C(n, k) 的组合 */
export function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [first, ...rest] = arr
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c])
  const withoutFirst = combinations(rest, k)
  return [...withFirst, ...withoutFirst]
}
