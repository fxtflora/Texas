// ============================================================
// 手牌评估器单元测试
// ============================================================

import { describe, it, expect } from 'vitest'
import { evaluateHand, compareHands } from '../handEvaluator'
import type { Card } from '../../../../shared/src/types'

// 快捷创建 Card 对象
const c = (rank: string, suit: string): Card =>
  ({ rank, suit } as Card)

// ── 辅助：生成5张牌并评估 ────────────────────────────────────
function hand(...cards: Card[]) {
  return evaluateHand(cards)
}

describe('handEvaluator — 手牌评估', () => {

  // ─── 基础牌型识别 ─────────────────────────────────────────

  it('皇家同花顺', () => {
    const h = hand(c('A','spades'), c('K','spades'), c('Q','spades'), c('J','spades'), c('T','spades'))
    expect(h.name).toBe('Royal Flush')
  })

  it('同花顺（K高）', () => {
    const h = hand(c('K','hearts'), c('Q','hearts'), c('J','hearts'), c('T','hearts'), c('9','hearts'))
    expect(h.name).toBe('Straight Flush')
  })

  it('轮子同花顺 A-2-3-4-5', () => {
    const h = hand(c('A','clubs'), c('2','clubs'), c('3','clubs'), c('4','clubs'), c('5','clubs'))
    expect(h.name).toBe('Straight Flush')
  })

  it('四条', () => {
    const h = hand(c('A','spades'), c('A','hearts'), c('A','diamonds'), c('A','clubs'), c('K','spades'))
    expect(h.name).toBe('Four of a Kind')
  })

  it('葫芦', () => {
    const h = hand(c('K','spades'), c('K','hearts'), c('K','diamonds'), c('A','clubs'), c('A','spades'))
    expect(h.name).toBe('Full House')
  })

  it('同花', () => {
    const h = hand(c('A','spades'), c('9','spades'), c('7','spades'), c('5','spades'), c('3','spades'))
    expect(h.name).toBe('Flush')
  })

  it('顺子（T高）', () => {
    const h = hand(c('T','spades'), c('9','hearts'), c('8','diamonds'), c('7','clubs'), c('6','spades'))
    expect(h.name).toBe('Straight')
  })

  it('轮子顺子 A-2-3-4-5', () => {
    const h = hand(c('A','spades'), c('2','hearts'), c('3','diamonds'), c('4','clubs'), c('5','spades'))
    expect(h.name).toBe('Straight')
  })

  it('三条', () => {
    const h = hand(c('Q','spades'), c('Q','hearts'), c('Q','diamonds'), c('A','clubs'), c('K','spades'))
    expect(h.name).toBe('Three of a Kind')
  })

  it('两对', () => {
    const h = hand(c('A','spades'), c('A','hearts'), c('K','diamonds'), c('K','clubs'), c('Q','spades'))
    expect(h.name).toBe('Two Pair')
  })

  it('一对', () => {
    const h = hand(c('A','spades'), c('A','hearts'), c('K','diamonds'), c('Q','clubs'), c('J','spades'))
    expect(h.name).toBe('One Pair')
  })

  it('高牌', () => {
    const h = hand(c('A','spades'), c('K','hearts'), c('Q','diamonds'), c('J','clubs'), c('9','spades'))
    expect(h.name).toBe('High Card')
  })

  // ─── 7选5 ─────────────────────────────────────────────────

  it('7张牌选最优5张 — 同花顺', () => {
    const cards = [
      c('K','hearts'), c('Q','hearts'), c('J','hearts'), c('T','hearts'), c('9','hearts'),
      c('2','spades'), c('3','clubs'),
    ]
    const h = evaluateHand(cards)
    expect(h.name).toBe('Straight Flush')
  })

  it('7张牌选最优5张 — 忽略弱牌选四条', () => {
    const cards = [
      c('A','spades'), c('A','hearts'), c('A','diamonds'), c('A','clubs'),
      c('2','spades'), c('3','hearts'), c('4','diamonds'),
    ]
    const h = evaluateHand(cards)
    expect(h.name).toBe('Four of a Kind')
  })

  // ─── 比较大小 ─────────────────────────────────────────────

  it('同花顺 > 四条', () => {
    const sf   = hand(c('K','hearts'), c('Q','hearts'), c('J','hearts'), c('T','hearts'), c('9','hearts'))
    const foak = hand(c('A','spades'), c('A','hearts'), c('A','diamonds'), c('A','clubs'), c('K','spades'))
    expect(compareHands(sf, foak)).toBe(1)
  })

  it('A高牌 vs K高牌', () => {
    const ace  = hand(c('A','spades'), c('K','hearts'), c('Q','diamonds'), c('J','clubs'), c('9','spades'))
    const king = hand(c('K','spades'), c('Q','hearts'), c('J','diamonds'), c('T','clubs'), c('8','spades'))
    expect(compareHands(ace, king)).toBe(1)
  })

  it('同等两对 — kicker 决胜', () => {
    const withA = hand(c('K','spades'), c('K','hearts'), c('Q','diamonds'), c('Q','clubs'), c('A','spades'))
    const withJ = hand(c('K','spades'), c('K','hearts'), c('Q','diamonds'), c('Q','clubs'), c('J','spades'))
    expect(compareHands(withA, withJ)).toBe(1)
  })

  it('完全相同手牌 — 平局', () => {
    const a = hand(c('A','spades'), c('K','hearts'), c('Q','diamonds'), c('J','clubs'), c('T','spades'))
    const b = hand(c('A','hearts'), c('K','diamonds'), c('Q','clubs'), c('J','spades'), c('T','hearts'))
    expect(compareHands(a, b)).toBe(0)
  })

  it('轮子顺子 < 普通顺子', () => {
    const wheel  = hand(c('A','spades'), c('2','hearts'), c('3','diamonds'), c('4','clubs'), c('5','spades'))
    const normal = hand(c('6','spades'), c('5','hearts'), c('4','diamonds'), c('3','clubs'), c('2','spades'))
    expect(compareHands(wheel, normal)).toBe(-1)
  })
})
