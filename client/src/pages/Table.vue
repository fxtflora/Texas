<template>
  <div class="table-wrap">
    <!-- 顶部状态栏 -->
    <div class="top-bar">
      <button class="back-btn" @click="doLeave">← 离开</button>
      <div class="center-info">
        <span class="phase-chip">{{ phaseText }}</span>
        <span class="hand-num" v-if="displayHandNum > 0">第 {{ displayHandNum }} 局</span>
      </div>
      <div class="top-right">
        <span v-if="store.isSpectator" class="spectator-badge-top">👁 观众</span>
        <span v-else class="my-chips-badge">🪙 {{ myPlayer?.chips ?? 0 }}</span>
      </div>
    </div>

    <!-- 牌桌场景（椭圆+坐位） -->
    <div class="table-scene" ref="sceneRef">
      <!-- 椭圆桌面 -->
      <div class="table-felt">
        <!-- 中心区：公共牌 + 底池 -->
        <div class="center-zone">
          <div class="community-cards">
            <div
              v-for="(card, i) in displayCommunityCards"
              :key="i"
              class="card-view"
              :class="cardSuit(card)"
            >
              <span class="cv-rank">{{ displayRank(card.rank) }}</span>
              <span class="cv-suit">{{ suitSym(card.suit) }}</span>
            </div>
            <div v-for="i in (5 - displayCommunityCards.length)" :key="`ph${i}`" class="card-placeholder" />
          </div>
          <div class="pot-row" v-if="pot > 0 && !store.handComplete">
            <span class="pot-icon">🪙</span>
            <span class="pot-amount">{{ pot }}</span>
          </div>
          <!-- 上一个行动的广播提示 -->
          <Transition name="fade">
            <div v-if="lastAction && !store.handComplete" class="action-ticker">
              {{ lastActionLabel }}
            </div>
          </Transition>
        </div>
      </div>

      <!-- 玩家坐位（动态椭圆分布） -->
      <div
        v-for="seat in layoutSeats"
        :key="seat.player.id"
        class="seat"
        :class="{
          'seat-me':      seat.isMe,
          'seat-current': seat.isCurrent && !store.handComplete,
          'seat-folded':  seat.player.status === 'folded',
          'seat-dc':      seat.player.status === 'disconnected',
          'seat-winner':  seat.isWinner,
        }"
        :style="seat.style"
      >
        <!-- 庄家标记（独立，醒目） -->
        <div v-if="seat.isDealer" class="dealer-btn">D</div>

        <!-- SB / BB 标记 -->
        <div class="seat-blind-badges">
          <span v-if="seat.isSB" class="btn-sb">SB</span>
          <span v-if="seat.isBB" class="btn-bb">BB</span>
        </div>

        <!-- 计时环（当前行动者） -->
        <div class="avatar-wrap" :class="{ 'is-acting': seat.isCurrent && !store.handComplete }">
          <svg v-if="seat.isCurrent && timerSec > 0 && !store.handComplete" class="timer-ring" viewBox="0 0 44 44">
            <circle class="tr-bg"  cx="22" cy="22" r="19" />
            <circle class="tr-arc" cx="22" cy="22" r="19"
              :stroke-dashoffset="119.4 * (1 - timerSec / maxTimerSec)"
              stroke-dasharray="119.4 119.4"
            />
          </svg>
          <div class="avatar">{{ seat.player.avatar }}</div>
        </div>

        <!-- 名字 + 角色 -->
        <div class="seat-name">
          <span>{{ seat.player.nickname }}</span>
          <span v-if="seat.player.role === 'host'" class="role-host">👑</span>
          <span v-if="seat.player.isBot" class="role-bot">🤖</span>
          <span v-if="seat.player.status === 'allIn'" class="role-allin">ALL IN</span>
        </div>

        <!-- 筹码 / 结算增减 -->
        <div v-if="seat.delta !== null" class="seat-delta-badge" :class="seat.delta >= 0 ? 'delta-pos' : 'delta-neg'">
          {{ seat.delta >= 0 ? '+' : '' }}{{ seat.delta }}
        </div>
        <div v-else class="seat-chips" :class="{ highlight: seat.player.bet > 0 }">
          {{ seat.player.chips }}
        </div>

        <!-- 手牌 -->
        <div class="seat-cards">
          <template v-if="getVisibleCards(seat.player.id)">
            <div
              v-for="(c, i) in getVisibleCards(seat.player.id)" :key="i"
              class="card-mini" :class="[cardSuit(c), seat.isWinner ? 'card-winner' : '']"
            >{{ displayRank(c.rank) }}{{ suitSym(c.suit) }}</div>
          </template>
          <template v-else-if="seat.player.hasHoleCards && seat.player.status !== 'folded'">
            <div class="card-back" /><div class="card-back" />
          </template>
        </div>

        <!-- 观众看牌按钮 -->
        <button
          v-if="store.isSpectator && seat.player.hasHoleCards && seat.player.status !== 'folded' && !store.spectatorRevealedCards.get(seat.player.id)"
          class="spectator-peek-btn"
          @click="sock.requestCards(seat.player.id)"
        >👁</button>

        <!-- 本轮下注 -->
        <div v-if="seat.player.bet > 0 && !store.handComplete" class="seat-bet-badge">{{ seat.player.bet }}</div>

        <!-- 行动 Flash -->
        <Transition name="action-flash">
          <div v-if="seatFlash[seat.player.id]" class="action-flash" :class="seatFlash[seat.player.id]?.cls">
            {{ seatFlash[seat.player.id]?.text }}
          </div>
        </Transition>
      </div>
    </div>

    <!-- 我的手牌（大牌，在桌面下方） -->
    <div class="my-cards-row" v-if="displayMyCards.length > 0">
      <div v-for="(c, i) in displayMyCards" :key="i" class="card-lg" :class="cardSuit(c)">
        <span class="card-rank">{{ displayRank(c.rank) }}</span>
        <span class="card-suit-sym">{{ suitSym(c.suit) }}</span>
      </div>
      <template v-if="inGame && !myCards">
        <div class="card-back-lg" /><div class="card-back-lg" />
      </template>
    </div>

    <!-- 操作栏 -->
    <Transition name="slide-up">
      <div v-if="store.myTurn && inGame" class="action-bar">
        <div v-if="showRaise" class="raise-row">
          <span class="raise-min-label">{{ minRaise }}</span>
          <input
            v-model.number="raiseAmt"
            type="range" :min="minRaise" :max="maxChips" :step="bigBlind"
            class="raise-slider"
          />
          <span class="raise-amt">{{ raiseAmt }}</span>
          <button class="btn-xs" @click="raiseAmt = Math.min(pot + (myPlayer?.bet ?? 0), maxChips)">锅</button>
        </div>
        <div class="action-btns">
          <button class="abtn abtn-fold"  @click="act('fold')">弃牌</button>
          <button v-if="sl?.canCheck" class="abtn abtn-check" @click="act('check')">过牌</button>
          <button v-if="sl?.canCall"  class="abtn abtn-call"  @click="act('call')">
            {{ store.gamePhase === 'preflop' && streetRaiseCount === 0 ? '平跟' : `跟 ${sl.callAmount}` }}
          </button>
          <button v-if="sl?.canRaise" class="abtn abtn-raise" @click="onRaiseClick">
            {{ showRaise ? `确认 ${raiseAmt}` : '加注' }}
          </button>
          <button v-if="sl?.canAllIn" class="abtn abtn-allin" @click="act('allIn')">全押</button>
        </div>
      </div>
    </Transition>

    <!-- 结算栏（替代弹窗，固定在底部） -->
    <Transition name="slide-up">
      <div v-if="store.handComplete" class="result-bar">
        <!-- 标题行 -->
        <div class="result-bar-head">
          <span class="result-bar-title">
            {{ store.handComplete.isFoldWin ? '🃏 弃牌获胜' : '🏆 摊牌结算' }}
          </span>
          <span class="result-bar-handnum">第 {{ store.handComplete.handNumber }} 局</span>
        </div>

        <!-- 赢家摘要 -->
        <div class="result-winners-row">
          <div
            v-for="w in store.handComplete.winners"
            :key="w.id + w.potAmount"
            class="result-win-chip"
          >
            {{ w.nickname }}
            <span class="win-amount">+{{ w.potAmount }}</span>
            <span v-if="!store.handComplete.isFoldWin && w.handName !== 'High Card'" class="win-hand">
              {{ handNameZh(w.handName) }}
            </span>
          </div>
        </div>

        <!-- 筹码增减（紧凑横排） -->
        <div class="result-delta-row">
          <span
            v-for="d in store.handComplete.playerDeltas"
            :key="d.id"
            class="delta-chip"
            :class="d.delta >= 0 ? 'pos' : 'neg'"
          >
            {{ d.nickname }} {{ d.delta >= 0 ? '+' : '' }}{{ d.delta }}
          </span>
        </div>

        <!-- 弃牌赢家亮牌 -->
        <div v-if="isFoldWinner" class="show-choice-row">
          <span class="show-choice-label">展示手牌？</span>
          <button class="scbtn scbtn-show" @click="onShowCards(true)">展示</button>
          <button class="scbtn scbtn-muck" @click="onShowCards(false)">不展示</button>
        </div>

        <!-- 房主操作 / 等待提示 -->
        <div class="result-bar-foot">
          <button v-if="store.isHost && canStartNext" class="btn-next-hand-bar" @click="onNextHand">
            开始下一局 ▶
          </button>
          <span v-else-if="!store.isHost" class="wait-hint-bar">等待房主开始下一局…</span>
          <span v-else-if="store.handComplete.isFoldWin" class="wait-hint-bar">
            等待 {{ (store.roomState?.foldWinnerIds ?? []).length }} 位玩家决定是否亮牌…
          </span>
        </div>
      </div>
    </Transition>

    <!-- Toast -->
    <TransitionGroup name="toast" tag="div" class="toast-list">
      <div v-for="m in store.messages" :key="m.id" class="toast" :class="m.type">{{ m.text }}</div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRoomStore } from '@/stores/room'
import { useSocket } from '@/composables/useSocket'
import type { Card, PublicPlayer } from '@shared/types'
import { HAND_NAME_ZH } from '@shared/constants'

const route  = useRoute()
const router = useRouter()
const store  = useRoomStore()
const sock   = useSocket()

// ── 基础计算属性 ────────────────────────────────────────────
const myPlayer       = computed(() => store.myPlayer)
const pot            = computed(() => store.pot)
const inGame         = computed(() => store.inGame)
const myCards        = computed(() => store.myCards)
const lastAction     = computed(() => store.lastAction)
const phaseText      = computed(() => {
  const hc = store.handComplete
  if (hc) return hc.isFoldWin ? '弃牌获胜' : '摊牌结算'
  return ({ waiting:'等待中', preflop:'翻牌前', flop:'翻牌', turn:'转牌', river:'河牌', showdown:'摊牌', finished:'结束' })[store.gamePhase] ?? store.gamePhase
})
// 顶栏局号：结算期间保留上一局编号
const displayHandNum = computed(() =>
  store.handComplete?.handNumber
  ?? (store.roomState?.gameState as any)?.handNumber
  ?? 0
)
const bigBlind = computed(() => store.roomState?.config.bigBlind ?? 20)

// 游戏状态快捷访问
const gs = computed(() => store.roomState?.gameState as any)
const dealerSeat  = computed(() => gs.value?.dealerSeatIndex ?? store.handComplete?.winners[0]?.seatIndex ?? -1)
const sbSeat      = computed(() => gs.value?.smallBlindSeatIndex ?? -1)
const bbSeat      = computed(() => gs.value?.bigBlindSeatIndex ?? -1)

// 结算期间保留公共牌（gameState 在结算时为 null）
const displayCommunityCards = computed(() =>
  store.handComplete?.communityCards ?? store.communityCards
)

// 可见手牌：游戏中自己的牌 / 结算时摊牌牌 / 弃牌赢家亮牌
function getVisibleCards(pid: string): Card[] | null {
  const hc = store.handComplete
  if (hc) {
    // 摊牌情形：显示未弃牌玩家手牌
    if (!hc.isFoldWin) {
      const sp = hc.showdownPlayers.find(p => p.id === pid)
      if (sp) return sp.holeCards
    }
    // 弃牌赢家选择亮牌 / 全部亮牌
    const shown = store.shownCards.find(s => s.playerId === pid)
    if (shown) return shown.holeCards
    // 结算时展示自己牌
    if (pid === store.myId && myCards.value) return myCards.value
    // 观众私密已揭示
    const sr = store.spectatorRevealedCards.get(pid)
    if (sr) return sr
    return null
  }
  // 游戏中：只有自己的牌可见
  if (pid === store.myId && myCards.value) return myCards.value
  // 观众私密已揭示
  const sr = store.spectatorRevealedCards.get(pid)
  if (sr) return sr
  return null
}

// 我的大牌显示（底部大牌区）
const displayMyCards = computed(() => {
  const cards = getVisibleCards(store.myId)
  return cards ?? (inGame.value ? [] : [])
})

// 座位结算增减
function seatDelta(pid: string): number | null {
  if (!store.handComplete) return null
  const d = store.handComplete.playerDeltas.find(d => d.id === pid)
  return d?.delta ?? null
}

// ── 椭圆坐位布局 ───────────────────────────────────────────
const sceneRef = ref<HTMLElement | null>(null)

const layoutSeats = computed(() => {
  const seated = store.seatedPlayers
  const N = seated.length
  if (N === 0) return []

  const myIdx = seated.findIndex(p => p.id === store.myId)
  const seats = []

  for (let visualIdx = 0; visualIdx < N; visualIdx++) {
    const playerIdx = (myIdx + visualIdx) % N
    const player = seated[playerIdx]

    const angleDeg = 180 + visualIdx * (360 / N)
    const angleRad = (angleDeg * Math.PI) / 180
    const rx = 42, ry = 38
    const left = 50 + rx * Math.sin(angleRad)
    const top  = 50 - ry * Math.cos(angleRad)

    const delta = seatDelta(player.id)

    seats.push({
      player,
      isMe:      player.id === store.myId,
      isCurrent: player.seatIndex === store.currentSeatIndex,
      isDealer:  player.seatIndex === dealerSeat.value,
      isSB:      player.seatIndex === sbSeat.value,
      isBB:      player.seatIndex === bbSeat.value,
      isWinner:  store.handComplete?.winners.some(w => w.id === player.id) ?? false,
      delta,
      style: {
        left: `calc(${left.toFixed(1)}% - 44px)`,
        top:  `calc(${top.toFixed(1)}% - 52px)`,
      },
    })
  }
  return seats
})

// ── 计时器 ─────────────────────────────────────────────────
const timerSec    = ref(0)
const maxTimerSec = computed(() => store.roomState?.config.actionTimeoutSec ?? 30)
let timerInterval: ReturnType<typeof setInterval> | null = null

watch(() => store.timerExpiry, (exp) => {
  if (timerInterval) clearInterval(timerInterval)
  if (!exp) { timerSec.value = 0; return }
  const update = () => { timerSec.value = Math.max(0, Math.ceil((exp - Date.now()) / 1000)) }
  update()
  timerInterval = setInterval(update, 200)
})

// ── 行动 Flash + 标签 ──────────────────────────────────────
// 每条街加注/下注次数（用于判断 open/3bet/bet/raise）
const streetRaiseCount = ref(0)

// 街次切换或新局开始时重置
watch(() => store.gamePhase, () => { streetRaiseCount.value = 0 })
watch(inGame, (v) => { if (v) streetRaiseCount.value = 0 })

/**
 * 根据动作类型、金额、当前街次生成可读标签
 * 翻牌前：open / 3bet / 4bet …
 * 翻牌后：bet / raise / re-raise
 */
function computeActionLabel(action: string, amount: number, phase?: string): string {
  const ph = phase ?? store.gamePhase
  switch (action) {
    case 'fold':  return '弃牌'
    case 'check': return '过牌'
    case 'blind': return `盲注 ${amount}`
    case 'call': {
      // 翻牌前且尚无主动加注 = limp（跟入大盲）
      if (ph === 'preflop' && streetRaiseCount.value === 0) return 'limp'
      return `跟注 ${amount}`
    }
    case 'allIn': return `all-in ${amount}`
    case 'raise': {
      const cnt = streetRaiseCount.value
      if (ph === 'preflop') {
        if (cnt === 0) return `open ${amount}`
        if (cnt === 1) return `3bet ${amount}`
        if (cnt === 2) return `4bet ${amount}`
        return `${cnt + 2}bet ${amount}`
      } else {
        // 翻牌后：首次主动下注=bet，加注=raise，再加注=3bet/re-raise
        if (cnt === 0) return `bet ${amount}`
        if (cnt === 1) return `raise ${amount}`
        if (cnt === 2) return `3bet ${amount}`
        return `re-raise ${amount}`
      }
    }
    default: return action
  }
}

// 行动类型 → CSS 色系类
function actionCls(action: string): string {
  if (action === 'fold')  return 'flash-fold'
  if (action === 'check') return 'flash-check'
  if (action === 'call')  return 'flash-call'
  if (action === 'allIn') return 'flash-allin'
  if (action === 'raise') {
    const cnt = streetRaiseCount.value
    if (cnt === 0) return 'flash-open'   // open/bet → 绿
    if (cnt === 1) return 'flash-3bet'   // 3bet → 橙
    return 'flash-4bet'                  // 4bet+ → 红
  }
  return ''
}

const seatFlash = reactive<Record<string, { text: string; cls: string } | null>>({})

// 底池下方 ticker 使用与座位气泡完全相同的标签（同一时机计算）
const lastActionLabel = ref('')

watch(() => store.lastAction, (a) => {
  if (!a) return
  const player = store.seatedPlayers.find(p => p.nickname === a.playerName)
  if (!player) return

  const phase = (a as any).phase ?? store.gamePhase
  const cls   = actionCls(a.action)
  const label = computeActionLabel(a.action, a.amount, phase)

  // 先用旧的 raiseCount 算标签，再自增
  lastActionLabel.value = `${a.playerName}：${label}`

  if (a.action === 'raise') streetRaiseCount.value++

  const id = player.id
  seatFlash[id] = { text: label, cls }
  setTimeout(() => { seatFlash[id] = null }, 2500)
})

// ── 结算逻辑 ───────────────────────────────────────────────
// 只要自己在 foldWinnerIds 里，就能看到亮牌/不展示按钮
const isFoldWinner = computed(() =>
  store.handComplete?.isFoldWin
  && (store.roomState?.foldWinnerIds ?? []).includes(store.myId)
)

// 房主可开始下一局：等所有持牌玩家决定完（foldWinnerIds 清空）后才允许
const canStartNext = computed(() => {
  const hc = store.handComplete
  if (!hc) return false
  if (hc.isFoldWin && (store.roomState?.foldWinnerIds ?? []).length > 0) return false
  return true
})

function isWinner(pid: string): boolean {
  return store.handComplete?.winners.some(w => w.id === pid) ?? false
}
function getDelta(pid: string): number {
  return store.handComplete?.playerDeltas.find(d => d.id === pid)?.delta ?? 0
}
function onShowCards(show: boolean) {
  sock.showCards(show)
}
function onNextHand() {
  sock.nextHand()
}

// ── 简化合法操作（前端估算） ────────────────────────────────
const sl = computed(() => {
  if (!gs.value || !myPlayer.value || !store.myTurn) return null
  const currentBet = gs.value.currentBet ?? 0
  const playerBet  = myPlayer.value.bet ?? 0
  const playerChips = myPlayer.value.chips ?? 0
  const toCall     = Math.max(0, currentBet - playerBet)
  // 最小加注 = 当前注 + minRaise增量（服务端维护的最小加注步长）
  const minRaiseIncrement = gs.value.minRaise ?? bigBlind.value
  // action.amount 含义是本街总下注额（= player.bet 的目标值）
  const minRaiseTotal = currentBet + minRaiseIncrement
  // 最大可加注 = 全押对应的本街总下注 = playerBet + playerChips
  const maxRaiseTotal = playerBet + playerChips
  return {
    canCheck:    toCall === 0,
    canCall:     toCall > 0 && toCall < playerChips,
    canRaise:    playerChips > toCall && (minRaiseTotal <= maxRaiseTotal),
    canAllIn:    playerChips > 0,
    callAmount:  Math.min(toCall, playerChips),
    minRaise:    Math.min(minRaiseTotal, maxRaiseTotal),
    maxRaise:    maxRaiseTotal,
    raiseStep:   bigBlind.value,
  }
})
const minRaise = computed(() => sl.value?.minRaise ?? 0)
const maxChips = computed(() => sl.value?.maxRaise ?? 0)

const showRaise = ref(false)
const raiseAmt  = ref(0)
watch(sl, v => {
  if (v) { raiseAmt.value = v.minRaise; showRaise.value = false }
})

function onRaiseClick() {
  if (showRaise.value) { act('raise', raiseAmt.value); showRaise.value = false }
  else showRaise.value = true
}

function act(type: string, amount?: number) {
  sock.sendAction({ type: type as any, amount })
  showRaise.value = false
}

// ── 牌面工具 ────────────────────────────────────────────────
const SUIT_SYM  = { spades:'♠', hearts:'♥', diamonds:'♦', clubs:'♣' }
const RANK_DISP = { T:'10', J:'J', Q:'Q', K:'K', A:'A' }
const suitSym    = (s: string) => (SUIT_SYM as any)[s] ?? s
const displayRank = (r: string) => (RANK_DISP as any)[r] ?? r
const cardSuit   = (c: Card) => c.suit
const handNameZh  = (n: string) => (HAND_NAME_ZH as any)[n] ?? n

// ── 生命周期 ────────────────────────────────────────────────
onMounted(() => { if (!store.inRoom) router.replace('/') })
onUnmounted(() => { if (timerInterval) clearInterval(timerInterval) })

function doLeave() { sock.leaveRoom(); router.replace('/') }
</script>

<style scoped>
/* ── 整体布局 ─────────────────────────────────────────────── */
.table-wrap {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: #061a0a;
  color: #e6edf3;
  font-family: -apple-system, "PingFang SC", sans-serif;
  max-width: 480px;
  margin: 0 auto;
  overflow: hidden;
}

/* ── 顶部栏 ──────────────────────────────────────────────── */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: #0d1117cc;
  border-bottom: 1px solid #1e4520;
  flex-shrink: 0;
}
.back-btn { background: none; border: none; color: #8b949e; font-size: 13px; cursor: pointer; }
.center-info { display: flex; align-items: center; gap: 8px; }
.phase-chip {
  background: #1e4520; color: #4fc04a;
  font-size: 12px; font-weight: 600;
  padding: 2px 10px; border-radius: 10px;
}
.hand-num { font-size: 12px; color: #4d5561; }
.my-chips-badge { font-size: 13px; font-weight: 600; color: #f0c040; }

/* ── 桌面场景 ─────────────────────────────────────────────── */
.table-scene {
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* 椭圆桌面 */
.table-felt {
  position: absolute;
  left: 8%; right: 8%; top: 10%; bottom: 12%;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, #1a5c22 0%, #124017 60%, #0a2a0e 100%);
  border: 6px solid #2d6b33;
  box-shadow:
    0 0 0 3px #1a5c22,
    0 0 0 6px #4a8a50,
    inset 0 4px 20px #00000055;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 中心区 */
.center-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px;
  width: 100%;
}

/* 公共牌 */
.community-cards { display: flex; gap: 5px; align-items: center; }
.card-view {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 36px; height: 50px;
  border-radius: 5px;
  background: #fff;
  border: 1px solid #ccc;
  font-weight: 700; line-height: 1; user-select: none;
  box-shadow: 0 2px 4px #00000055;
}
.card-view .cv-rank { font-size: 13px; }
.card-view .cv-suit { font-size: 10px; }
.card-view.hearts, .card-view.diamonds { color: #e63946; }
.card-view.spades,  .card-view.clubs   { color: #0d1117; }
.card-placeholder {
  width: 36px; height: 50px;
  border-radius: 5px;
  border: 2px dashed #2d6b3399;
}

/* 底池 */
.pot-row { display: flex; align-items: center; gap: 4px; }
.pot-icon { font-size: 14px; }
.pot-amount { font-size: 16px; font-weight: 700; color: #f0c040; text-shadow: 0 0 8px #f0c04066; }

/* 行动提示 */
.action-ticker {
  background: #ffffff18;
  backdrop-filter: blur(4px);
  color: #f0c040;
  font-size: 12px;
  padding: 3px 12px;
  border-radius: 12px;
  max-width: 200px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── 坐位 ─────────────────────────────────────────────────── */
.seat {
  position: absolute;
  width: 88px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  transition: opacity .3s;
  z-index: 5;
}
.seat-folded  { opacity: .35; }
.seat-dc      { opacity: .5; }

/* 庄注标识 */
/* 庄家按钮（Dealer button）—— 醒目的金色圆形筹码 */
.dealer-btn {
  position: absolute;
  top: -10px; left: 50%; transform: translateX(-50%);
  width: 22px; height: 22px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #ffe680, #c89600);
  border: 2px solid #8a6200;
  box-shadow: 0 2px 6px #00000088, inset 0 1px 0 #fff4;
  color: #3a2800; font-size: 10px; font-weight: 900;
  display: flex; align-items: center; justify-content: center;
  letter-spacing: -.5px;
  z-index: 12;
}

/* SB / BB 徽章 */
.seat-blind-badges {
  position: absolute;
  bottom: -18px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 3px;
  z-index: 10;
  white-space: nowrap;
}
.btn-sb {
  background: #dde5ee; color: #0d1117;
  font-size: 9px; font-weight: 800;
  padding: 1px 5px; border-radius: 5px;
  border: 1px solid #aab8c8;
  line-height: 14px;
}
.btn-bb {
  background: #1a4faa; color: #fff;
  font-size: 9px; font-weight: 800;
  padding: 1px 5px; border-radius: 5px;
  border: 1px solid #388bfd;
  line-height: 14px;
}

/* 头像 + 计时环 */
.avatar-wrap {
  position: relative;
  width: 42px; height: 42px;
  display: flex; align-items: center; justify-content: center;
}
.avatar-wrap.is-acting {
  filter: drop-shadow(0 0 6px #f0c040aa);
}
.timer-ring {
  position: absolute; inset: 0;
  transform: rotate(-90deg);
  width: 42px; height: 42px;
}
.tr-bg  { fill: none; stroke: #30363d; stroke-width: 3; }
.tr-arc { fill: none; stroke: #f0c040; stroke-width: 3; stroke-linecap: round; transition: stroke-dashoffset .25s linear; }
.avatar { font-size: 22px; position: relative; z-index: 2; }

/* 坐位文字 */
.seat-name {
  font-size: 11px; font-weight: 600;
  color: #c9d1d9;
  max-width: 88px;
  text-align: center;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: flex; align-items: center; gap: 2px;
}
.role-host  { font-size: 10px; }
.role-bot   { font-size: 10px; }
.role-allin {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: .5px;
  color: #f85149;
  background: #f8514922;
  border: 1px solid #f8514966;
  border-radius: 4px;
  padding: 0 3px;
  animation: allin-pulse 1s ease-in-out infinite alternate;
}
@keyframes allin-pulse {
  from { opacity: .7; }
  to   { opacity: 1; }
}

.seat-chips {
  font-size: 11px; color: #f0c040; font-weight: 700;
  transition: color .2s;
}
.seat-chips.highlight { color: #ff9f43; }

/* 手牌（迷你） */
.seat-cards { display: flex; gap: 2px; }
.card-mini {
  width: 22px; height: 30px;
  border-radius: 3px;
  background: #fff;
  font-size: 8px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #ccc;
  line-height: 1;
}
.card-mini.hearts, .card-mini.diamonds { color: #e63946; }
.card-mini.spades,  .card-mini.clubs   { color: #0d1117; }
.card-back {
  width: 22px; height: 30px; border-radius: 3px;
  background: linear-gradient(135deg, #1e3a5f, #2e6a9e);
  border: 1px solid #4a90d9;
}

/* 观众看牌按钮 */
.spectator-peek-btn {
  position: absolute;
  top: -8px; right: -8px;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: #21262d;
  border: 1px solid #30363d;
  font-size: 11px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: .7;
  transition: opacity .15s, transform .15s;
  z-index: 5;
}
.spectator-peek-btn:hover { opacity: 1; transform: scale(1.15); }

/* 观众顶部标识 */
.spectator-badge-top {
  font-size: 12px;
  color: #8b949e;
  padding: 2px 8px;
  border: 1px solid #30363d;
  border-radius: 10px;
}

/* 下注徽章 */
.seat-bet-badge {
  position: absolute;
  bottom: -18px;
  font-size: 10px; font-weight: 700;
  color: #ffe066;
  background: #2e2a00cc;
  padding: 1px 6px; border-radius: 8px;
  pointer-events: none;
}

/* 行动 Flash —— 醒目标签（open/3bet/bet/raise/…） */
.action-flash {
  position: absolute;
  top: -28px;
  left: 50%; transform: translateX(-50%);
  font-size: 12px; font-weight: 800;
  padding: 3px 10px; border-radius: 10px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 20;
  letter-spacing: .3px;
  border: 1px solid transparent;
}
/* fold */
.flash-fold  { background: #da3633cc; color: #fff; border-color: #ff6b6b44; }
/* check */
.flash-check { background: #21262d; color: #8b949e; border-color: #30363d; }
/* call */
.flash-call  { background: #1a4520; color: #56d364; border-color: #2ea04366; }
/* open / first bet — 亮绿 */
.flash-open  { background: #0d3a1a; color: #3fb950; border-color: #2ea04388; }
/* 3bet — 橙 */
.flash-3bet  { background: #3a1e00; color: #f0a040; border-color: #f0a04066; }
/* 4bet+ — 红橙 */
.flash-4bet  { background: #3a0a00; color: #ff6b2b; border-color: #ff6b2b66; }
/* all-in */
.flash-allin { background: #3a0060; color: #d2a8ff; border-color: #9a00dd66; }

/* 当前玩家坐位发光 */
.seat-current .avatar-wrap { filter: drop-shadow(0 0 8px #f0c040bb); }

/* ── 我的手牌（大牌） ─────────────────────────────────────── */
.my-cards-row {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 6px 0 4px;
  flex-shrink: 0;
  background: #061a0a;
}
.card-lg {
  width: 52px; height: 74px;
  border-radius: 7px;
  background: #fff;
  border: 1px solid #ccc;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  font-weight: 700; line-height: 1;
  box-shadow: 0 4px 12px #00000088;
  user-select: none;
}
.card-lg .card-rank { font-size: 22px; }
.card-lg .card-suit-sym { font-size: 14px; }
.card-lg.hearts, .card-lg.diamonds { color: #e63946; }
.card-lg.spades,  .card-lg.clubs   { color: #0d1117; }
.card-back-lg {
  width: 52px; height: 74px; border-radius: 7px;
  background: linear-gradient(135deg, #1e3a5f, #2e6a9e);
  border: 1px solid #4a90d9;
  box-shadow: 0 4px 12px #00000088;
}

/* ── 操作栏 ───────────────────────────────────────────────── */
.action-bar {
  background: #0d1117ee;
  border-top: 1px solid #1e4520;
  padding: 8px 12px 12px;
  flex-shrink: 0;
  backdrop-filter: blur(12px);
}
.raise-row {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #1e4520;
}
.raise-min-label { font-size: 11px; color: #8b949e; white-space: nowrap; }
.raise-slider { flex: 1; accent-color: #f0c040; }
.raise-amt    { font-size: 14px; font-weight: 700; color: #f0c040; min-width: 38px; text-align: right; }
.btn-xs {
  background: #21262d; border: 1px solid #30363d; border-radius: 5px;
  color: #e6edf3; font-size: 11px; padding: 2px 8px; cursor: pointer;
}
.action-btns { display: grid; grid-template-columns: repeat(auto-fit, minmax(68px, 1fr)); gap: 8px; }
.abtn {
  padding: 12px 4px; border: none; border-radius: 8px;
  font-size: 13px; font-weight: 800; cursor: pointer;
  letter-spacing: .5px; transition: opacity .15s;
}
.abtn:active { opacity: .6; }
.abtn-fold  { background: #da3633; color: #fff; }
.abtn-check { background: #388bfd; color: #fff; }
.abtn-call  { background: #2ea043; color: #fff; }
.abtn-raise { background: #f0c040; color: #0d1117; }
.abtn-allin { background: #9a00dd; color: #fff; }

/* ── 坐位结算增减 ─────────────────────────────────────────── */
.seat-winner .avatar-wrap { filter: drop-shadow(0 0 8px #f0c040cc) !important; }
.seat-winner .seat-name   { color: #f0c040; }
.seat-delta-badge {
  font-size: 12px; font-weight: 800;
  padding: 1px 6px; border-radius: 8px;
  line-height: 1.4;
}
.delta-pos { color: #2ea043; background: #0d3a1a; }
.delta-neg { color: #da3633; background: #2a0a0a; }

/* 赢家牌高亮 */
.card-mini.card-winner { box-shadow: 0 0 6px #f0c040aa; }

/* ── 结算栏（底部，不遮挡桌面） ───────────────────────────── */
.result-bar {
  flex-shrink: 0;
  background: #0d1117ee;
  border-top: 2px solid #f0c04066;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  backdrop-filter: blur(12px);
}
.result-bar-head {
  display: flex; align-items: center; justify-content: space-between;
}
.result-bar-title { font-size: 14px; font-weight: 700; color: #f0c040; }
.result-bar-handnum { font-size: 11px; color: #4d5561; }

.result-winners-row {
  display: flex; flex-wrap: wrap; gap: 6px;
}
.result-win-chip {
  background: #2a2200;
  border: 1px solid #f0c04066;
  border-radius: 20px;
  padding: 3px 10px;
  font-size: 12px; font-weight: 700;
  color: #f0c040;
  display: flex; align-items: center; gap: 4px;
}
.win-amount { color: #2ea043; }
.win-hand   { color: #8b949e; font-size: 10px; font-weight: 400; }

.result-delta-row {
  display: flex; flex-wrap: wrap; gap: 4px;
}
.delta-chip {
  font-size: 11px; font-weight: 700;
  padding: 2px 8px; border-radius: 10px;
  background: #161b22;
}
.delta-chip.pos { color: #2ea043; }
.delta-chip.neg { color: #da3633; }

.show-choice-row {
  display: flex; align-items: center; gap: 8px;
  padding-top: 4px;
}
.show-choice-label { font-size: 12px; color: #8b949e; flex: 1; }
.scbtn {
  padding: 7px 16px; border-radius: 8px; border: none;
  font-size: 13px; font-weight: 700; cursor: pointer;
}
.scbtn-show { background: #2ea043; color: #fff; }
.scbtn-muck { background: #30363d; color: #8b949e; }

.result-bar-foot { display: flex; align-items: center; }
.btn-next-hand-bar {
  flex: 1; padding: 11px;
  background: linear-gradient(135deg, #2ea043, #1a7a2e);
  border: none; border-radius: 10px;
  color: #fff; font-size: 14px; font-weight: 800;
  cursor: pointer; letter-spacing: .5px;
  transition: opacity .15s;
}
.btn-next-hand-bar:active { opacity: .7; }
.wait-hint-bar { color: #4d5561; font-size: 12px; padding: 4px 0; }

/* ── Toast ────────────────────────────────────────────────── */
.toast-list {
  position: fixed; top: 50px; left: 50%; transform: translateX(-50%);
  z-index: 100; display: flex; flex-direction: column; gap: 6px;
  width: 90%; max-width: 360px; pointer-events: none;
}
.toast { padding: 8px 14px; border-radius: 8px; font-size: 13px; text-align: center; background: #21262d; color: #e6edf3; }
.toast.error { background: #da363399; }

/* ── 动画 ─────────────────────────────────────────────────── */
.slide-up-enter-active, .slide-up-leave-active { transition: all .25s ease; }
.slide-up-enter-from, .slide-up-leave-to       { transform: translateY(100%); opacity: 0; }
.fade-enter-active, .fade-leave-active   { transition: opacity .3s; }
.fade-enter-from, .fade-leave-to         { opacity: 0; }
.toast-enter-active, .toast-leave-active { transition: all .3s; }
.toast-enter-from, .toast-leave-to       { opacity: 0; transform: translateY(-8px); }
.action-flash-enter-active, .action-flash-leave-active { transition: all .3s; }
.action-flash-enter-from, .action-flash-leave-to       { opacity: 0; transform: translateX(-50%) translateY(6px); }
</style>
