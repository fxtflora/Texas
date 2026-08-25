// ============================================================
// 游戏常量
// ============================================================

import type { Rank, Suit, HandName } from './types'

/** 所有点数（从小到大） */
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']

/** 所有花色 */
export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']

/** 花色显示符号 */
export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades:   '♠',
  hearts:   '♥',
  diamonds: '♦',
  clubs:    '♣',
}

/** 花色颜色（用于UI） */
export const SUIT_COLORS: Record<Suit, string> = {
  spades:   '#1a1a2e',
  hearts:   '#e63946',
  diamonds: '#e63946',
  clubs:    '#1a1a2e',
}

/** 点数显示 */
export const RANK_DISPLAY: Record<string, string> = {
  T: '10',
  J: 'J',
  Q: 'Q',
  K: 'K',
  A: 'A',
}

/** 手牌名称中文映射 */
export const HAND_NAME_ZH: Record<HandName, string> = {
  'Royal Flush':    '皇家同花顺',
  'Straight Flush': '同花顺',
  'Four of a Kind': '四条',
  'Full House':     '葫芦',
  'Flush':          '同花',
  'Straight':       '顺子',
  'Three of a Kind':'三条',
  'Two Pair':       '两对',
  'One Pair':       '一对',
  'High Card':      '高牌',
}

/** 手牌强度权重（用于比较） */
export const HAND_RANK_BASE: Record<HandName, number> = {
  'Royal Flush':    9000,
  'Straight Flush': 8000,
  'Four of a Kind': 7000,
  'Full House':     6000,
  'Flush':          5000,
  'Straight':       4000,
  'Three of a Kind':3000,
  'Two Pair':       2000,
  'One Pair':       1000,
  'High Card':      0,
}

/** 点数权重（A最大） */
export const RANK_VALUE: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}

/** 默认起始筹码 */
export const DEFAULT_STARTING_CHIPS = 1000

/** 玩家决策超时秒数 */
export const DEFAULT_ACTION_TIMEOUT_SEC = 30

/** AI思考延迟范围（ms）—— 模拟人类思考 */
export const BOT_THINK_DELAY: Record<string, [number, number]> = {
  easy:   [600, 1200],
  medium: [300, 800],
  hard:   [200, 600],
}

/** 下一局开始倒计时（ms） */
export const NEXT_HAND_DELAY_MS = 5000

/** 断线重连宽限期（ms） */
export const RECONNECT_GRACE_MS = 30_000

/** 房间邀请码长度 */
export const ROOM_CODE_LENGTH = 6

/** 邀请码字符集（去除易混淆字符 0/O/I/1） */
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
