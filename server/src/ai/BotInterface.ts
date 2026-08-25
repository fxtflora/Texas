// ============================================================
// BotInterface.ts — AI 可插拔接口定义
// ============================================================

import type { Card, GameState, Player, GameActionPayload, LegalActions } from '@shared/types'

export interface BotDecideContext {
  gameState:    GameState
  myHand:       [Card, Card]
  myPlayer:     Player
  legalActions: LegalActions
  allPlayers:   Player[]     // 含对手信息（但对手手牌为 null）
}

export interface BotInterface {
  readonly name:       string
  readonly difficulty: 'easy' | 'medium' | 'hard' | 'ml'

  /**
   * AI 决策入口
   * 必须在 thinkDelayMs 毫秒内返回，否则外部会超时弃牌
   */
  decide(ctx: BotDecideContext): Promise<GameActionPayload>
}

/** 根据难度获取 AI 思考延迟范围（模拟人类思考时间，最低2秒） */
export function getBotThinkDelay(difficulty: string): number {
  const ranges: Record<string, [number, number]> = {
    easy:   [2000, 3000],   // 2.0~3.0s
    medium: [2000, 3500],   // 2.0~3.5s
    hard:   [2000, 4000],   // 2.0~4.0s
  }
  const [min, max] = ranges[difficulty] ?? [2000, 3000]
  return min + Math.random() * (max - min)
}
