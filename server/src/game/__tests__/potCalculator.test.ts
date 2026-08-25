// ============================================================
// 边池计算器单元测试
// ============================================================

import { describe, it, expect } from 'vitest'
import { calculatePots, totalPotAmount } from '../potCalculator'
import type { Player } from '../../../../shared/src/types'

function makePlayer(id: string, totalBet: number, folded = false): Player {
  return {
    id, nickname: id, avatar: '',
    role: 'player', seatIndex: 0, chips: 0,
    bet: 0, totalBet, holeCards: null,
    status: folded ? 'folded' : 'allIn',
    isBot: false, privilegeLevel: 0, isReady: true,
    connectedAt: 0, lastActiveAt: 0,
  } as Player
}

describe('potCalculator — 边池计算', () => {

  it('无 All-in — 单一主池', () => {
    const players = [
      makePlayer('A', 100), makePlayer('B', 100), makePlayer('C', 100),
    ]
    const pots = calculatePots(players)
    expect(pots.length).toBe(1)
    expect(pots[0].amount).toBe(300)
    expect(pots[0].eligiblePlayerIds).toContain('A')
    expect(pots[0].eligiblePlayerIds).toContain('B')
  })

  it('一人 All-in 形成主池+边池', () => {
    // A all-in 100, B 下注 200, C 下注 200
    const players = [
      makePlayer('A', 100),   // all-in
      makePlayer('B', 200),
      makePlayer('C', 200),
    ]
    const pots = calculatePots(players)
    const total = totalPotAmount(pots)
    expect(total).toBe(500)

    // 主池：100×3=300（A/B/C均可赢）
    const main = pots[0]
    expect(main.amount).toBe(300)
    expect(main.eligiblePlayerIds).toContain('A')

    // 边池：100×2=200（只有B/C可赢）
    const side = pots[1]
    expect(side.amount).toBe(200)
    expect(side.eligiblePlayerIds).not.toContain('A')
    expect(side.eligiblePlayerIds).toContain('B')
    expect(side.eligiblePlayerIds).toContain('C')
  })

  it('弃牌玩家筹码计入底池但无法赢取', () => {
    // A 弃牌贡献了 200, B all-in 100, C 下注 300
    const players = [
      makePlayer('A', 200, true),  // 弃牌
      makePlayer('B', 100),
      makePlayer('C', 300),
    ]
    const pots = calculatePots(players)
    const total = totalPotAmount(pots)
    expect(total).toBe(600)

    // B 最多只能赢 100×3=300 的底池
    const mainPot = pots.find(p => p.eligiblePlayerIds.includes('B'))!
    expect(mainPot.amount).toBe(300)
    expect(mainPot.eligiblePlayerIds).not.toContain('A') // 弃牌者无法赢

    // 剩余部分 C 独赢
    const cPot = pots.find(p =>
      p.eligiblePlayerIds.includes('C') && !p.eligiblePlayerIds.includes('B')
    )!
    expect(cPot).toBeTruthy()
  })

  it('三人不同额度 All-in', () => {
    // A: 100, B: 200, C: 300
    const players = [
      makePlayer('A', 100),
      makePlayer('B', 200),
      makePlayer('C', 300),
    ]
    const pots = calculatePots(players)
    const total = totalPotAmount(pots)
    expect(total).toBe(600)
    expect(pots.length).toBeGreaterThanOrEqual(2)
  })
})
