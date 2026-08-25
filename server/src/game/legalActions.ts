// ============================================================
// legalActions.ts — 计算玩家当前的合法行动
// ============================================================

import type { Player, GameState, LegalActions } from '@shared/types'

/**
 * 计算给定游戏状态下某玩家的所有合法行动
 */
export function getLegalActions(state: GameState, player: Player): LegalActions {
  const { currentBet, minRaise, mainPot, sidePots } = state
  const totalPot = mainPot + sidePots.reduce((s, p) => s + p.amount, 0)
  const toCall   = Math.max(0, currentBet - player.bet)   // 需要补的金额
  const canAffordCall = player.chips >= toCall

  // ── 弃牌：始终合法（即使可以 check，也允许弃牌） ──────────────

  // ── 过牌（check）：当前没有需要跟注的金额时 ──────────────────
  const canCheck = toCall === 0

  // ── 跟注（call）：有需要补的金额，且筹码足够 ─────────────────
  const canCall = toCall > 0 && canAffordCall

  // ── 加注（raise）：上一动作后有筹码富余 ─────────────────────
  // 跟注后还需要能再多下 minRaise 才能加注
  const afterCall = player.chips - toCall
  const canRaise  = afterCall >= minRaise

  // ── All-in：只要有剩余筹码 ────────────────────────────────
  const canAllIn = player.chips > 0

  // ── 加注范围 ───────────────────────────────────────────────
  // 最小加注 = 跟注后再加上 minRaise
  const minRaiseAmount = toCall + minRaise
  // 最大加注 = 全押
  const maxRaiseAmount = player.chips

  // ── 底池下注参考（用于 AI 决策，不是合法性约束）──────────────
  const potBet = Math.min(player.chips, toCall + totalPot)

  return {
    canCheck,
    canCall,
    callAmount: Math.min(toCall, player.chips),  // All-in call 不超过剩余筹码
    canRaise,
    minRaise: Math.min(minRaiseAmount, player.chips),
    maxRaise: maxRaiseAmount,
    canAllIn,
    potBet,     // 底池下注金额（参考值）
    toCall,
  }
}

/** 校验玩家提交的行动是否合法 */
export function validateAction(
  state: GameState,
  player: Player,
  action: { type: string; amount?: number },
): { valid: boolean; reason?: string } {
  const legal = getLegalActions(state, player)

  switch (action.type) {
    case 'fold':
      return { valid: true }

    case 'check':
      if (!legal.canCheck) return { valid: false, reason: '当前无法过牌，需要跟注' }
      return { valid: true }

    case 'call':
      if (!legal.canCall) return { valid: false, reason: '无需跟注，请过牌' }
      return { valid: true }

    case 'raise': {
      if (!legal.canRaise) return { valid: false, reason: '筹码不足以加注' }
      const amount = action.amount ?? 0
      if (amount < legal.minRaise) {
        return { valid: false, reason: `加注额不足，最小加注为 ${legal.minRaise}` }
      }
      if (amount > legal.maxRaise) {
        return { valid: false, reason: `加注额超过筹码上限 ${legal.maxRaise}` }
      }
      return { valid: true }
    }

    case 'allIn':
      if (!legal.canAllIn) return { valid: false, reason: '没有筹码可以全押' }
      return { valid: true }

    default:
      return { valid: false, reason: `未知行动类型: ${action.type}` }
  }
}

// 扩展 LegalActions 类型增加辅助字段（不影响 shared/types.ts 接口）
declare module '@shared/types' {
  interface LegalActions {
    potBet: number   // 底池下注参考金额（AI 使用）
    toCall: number   // 当前需跟注金额
  }
}
