// ============================================================
// potCalculator.ts — 边池计算
// 正确处理多人 All-in 场景，生成主池和多个边池
// ============================================================

import type { Player, SidePot } from '@shared/types'

interface PotContributor {
  id: string
  totalBet: number   // 本局累计下注（含盲注）
  folded: boolean
}

/**
 * 根据玩家本局下注情况计算所有边池
 *
 * 算法：
 * 1. 按 totalBet 从小到大排序（只考虑未弃牌且有下注的玩家）
 * 2. 逐级处理：每个 All-in 层级创建一个新的底池
 *    - 底池额 = (当前层级下注 - 上一层级) × 该层级有效贡献人数（包含弃牌者！）
 * 3. 弃牌者不参与赢取任何底池，但其筹码已贡献到各底池
 *
 * 示例：
 *   A: 全押 100   B: 全押 300   C: 下注 500（有剩余）  D: 弃牌 200
 *   → 主池 [100×4=400] 四人均贡献，A/B/C 可赢
 *   → 边池1 [200×3=600] B/C/D 贡献 200，但 D 弃牌，B/C 可赢
 *   → 边池2 [200×2=400] B/C 贡献 200，B/C 可赢
 *   → 边池3 [200×1=200] 只有 C 贡献 200，C 必赢
 */
export function calculatePots(players: Player[]): SidePot[] {
  // 收集所有有下注的玩家（弃牌者也要计入，其筹码已入池）
  const contributors: PotContributor[] = players
    .filter(p => p.totalBet > 0)
    .map(p => ({
      id: p.id,
      totalBet: p.totalBet,
      folded: p.status === 'folded',
    }))

  if (contributors.length === 0) return []

  // 获取所有唯一的下注层级（从小到大）
  const levels = [...new Set(contributors.map(c => c.totalBet))].sort((a, b) => a - b)

  const pots: SidePot[] = []
  let prevLevel = 0

  for (const level of levels) {
    const layerAmount = level - prevLevel
    if (layerAmount <= 0) continue

    // 本层所有贡献者（下注 >= level 的人）
    const layerContributors = contributors.filter(c => c.totalBet >= level)
    const potAmount = layerAmount * layerContributors.length

    // 只有未弃牌的玩家才有资格赢得该底池
    const eligible = layerContributors
      .filter(c => !c.folded)
      .map(c => c.id)

    if (potAmount > 0 && eligible.length > 0) {
      // 如果与上一个底池的有资格玩家完全相同，合并到上一个底池
      const last = pots[pots.length - 1]
      if (
        last &&
        last.eligiblePlayerIds.length === eligible.length &&
        last.eligiblePlayerIds.every(id => eligible.includes(id))
      ) {
        last.amount += potAmount
      } else {
        pots.push({ amount: potAmount, eligiblePlayerIds: eligible })
      }
    }

    prevLevel = level
  }

  return pots
}

/**
 * 计算底池总额（主池 + 所有边池之和）
 */
export function totalPotAmount(pots: SidePot[]): number {
  return pots.reduce((sum, p) => sum + p.amount, 0)
}

/**
 * 简化版：只有一个主池（无 All-in）
 */
export function simpleMainPot(players: Player[]): SidePot {
  const amount = players.reduce((sum, p) => sum + p.totalBet, 0)
  const eligible = players
    .filter(p => p.status !== 'folded')
    .map(p => p.id)
  return { amount, eligiblePlayerIds: eligible }
}
