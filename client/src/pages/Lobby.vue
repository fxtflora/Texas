<template>
  <div class="lobby">
    <!-- 顶栏 -->
    <div class="top-bar">
      <button class="back-btn" @click="doLeave">← 离开</button>
      <div class="room-code">
        房间码：<span class="code">{{ roomCode }}</span>
      </div>
    </div>

    <!-- 分享链接（最重要，置顶） -->
    <div class="share-card" @click="copyUrl">
      <div class="share-title">📤 分享链接给朋友</div>
      <div class="share-url">{{ store.shareUrl }}</div>
      <div class="copy-hint">{{ copied ? '✅ 已复制' : '点击复制' }}</div>
    </div>

    <!-- 房间配置（仅展示，房主可点击修改） -->
    <div class="card">
      <div class="card-title">
        房间设置
        <button v-if="store.isHost && !inGame" class="btn-link" @click="showCfg = !showCfg">
          {{ showCfg ? '收起' : '修改' }}
        </button>
      </div>

      <div class="cfg-grid">
        <div class="cfg-item"><span>牌型</span><span>{{ cfgCardType }}</span></div>
        <div class="cfg-item"><span>盲注</span><span>{{ cfg.smallBlind }}/{{ cfg.bigBlind }}</span></div>
        <div class="cfg-item"><span>起始筹码</span><span>{{ cfg.startingChips }}</span></div>
        <div class="cfg-item"><span>最大人数</span><span>{{ cfg.maxPlayers }}</span></div>
        <div class="cfg-item"><span>行动超时</span><span>{{ cfg.actionTimeoutSec }}s</span></div>
      </div>

      <!-- 房主内联编辑 -->
      <Transition name="slide">
        <div v-if="showCfg && store.isHost" class="cfg-edit">
          <div class="cfg-row">
            <label>最大玩家</label>
            <div class="stepper">
              <button @click="editCfg.maxPlayers = Math.max(2, (editCfg.maxPlayers??6) - 1)">−</button>
              <span>{{ editCfg.maxPlayers ?? 6 }}</span>
              <button @click="editCfg.maxPlayers = Math.min(9, (editCfg.maxPlayers??6) + 1)">+</button>
            </div>
          </div>
          <div class="cfg-row">
            <label>起始筹码</label>
            <select v-model="editCfg.startingChips" class="select">
              <option :value="500">500</option>
              <option :value="1000">1000</option>
              <option :value="2000">2000</option>
              <option :value="5000">5000</option>
            </select>
          </div>
          <div class="cfg-row">
            <label>盲注档位</label>
            <select v-model="blindPair" class="select">
              <option value="5/10">5/10</option>
              <option value="10/20">10/20</option>
              <option value="25/50">25/50</option>
              <option value="50/100">50/100</option>
            </select>
          </div>
          <div class="cfg-row">
            <label>牌型</label>
            <div class="radio-group">
              <label><input v-model="editCfg.cardType" type="radio" value="standard" /> 长牌</label>
              <label><input v-model="editCfg.cardType" type="radio" value="short" /> 短牌</label>
            </div>
          </div>
          <button class="btn btn-primary full-width" @click="applyConfig">保存设置</button>
        </div>
      </Transition>
    </div>

    <!-- 玩家列表 -->
    <div class="card">
      <div class="card-title">玩家（{{ allSeated.length }}/{{ cfg.maxPlayers }}）</div>

      <div class="player-list">
        <div
          v-for="p in allSeated"
          :key="p.id"
          class="player-row"
          :class="{ 'is-host': p.role === 'host', 'is-bot': p.isBot, 'is-me': p.id === store.myId }"
        >
          <div class="p-avatar">{{ p.avatar }}</div>
          <div class="p-info">
            <span class="p-name">{{ p.nickname }}</span>
            <span v-if="p.role === 'host'" class="badge host-badge">房主</span>
            <span v-if="p.isBot" class="badge bot-badge">AI</span>
            <span v-if="p.id === store.myId" class="badge me-badge">我</span>
          </div>
          <div class="p-chips">{{ p.chips }} 筹</div>
          <div class="p-ready" :class="p.isReady || p.isBot ? 'ready' : 'not-ready'">
            {{ p.isBot ? '🤖' : p.isReady ? '✓' : '…' }}
          </div>
          <!-- 房主可以踢出机器人 -->
          <button
            v-if="store.isHost && p.isBot"
            class="kick-btn"
            @click="sock.removeBot(p.id)"
          >✕</button>
          <!-- 房主可以转让房主权（仅对非自己的真人玩家） -->
          <button
            v-if="store.isHost && !p.isBot && p.id !== store.myId"
            class="transfer-btn"
            :class="{ 'transfer-confirm': confirmTransferId === p.id }"
            @click="doTransferHost(p.id)"
          >
            {{ confirmTransferId === p.id ? '确认？' : '👑转让' }}
          </button>
        </div>

        <!-- 空位 -->
        <div v-for="i in emptySeats" :key="`empty-${i}`" class="player-row empty-seat">
          <div class="p-avatar">⬜</div>
          <div class="p-info"><span class="p-name" style="color:#4d5561">空位</span></div>
        </div>
      </div>

      <!-- 房主：添加机器人 -->
      <div v-if="store.isHost && !inGame" class="add-bot-row">
        <select v-model="botDiff" class="select">
          <option value="easy">简单 AI</option>
          <option value="medium">中等 AI</option>
          <option value="hard">困难 AI</option>
        </select>
        <button class="btn btn-outline" :disabled="seatedCount >= cfg.maxPlayers" @click="sock.addBot(botDiff as any)">
          + 添加 AI
        </button>
      </div>
    </div>

    <!-- 观众列表（单独列出，不计入玩家数） -->
    <div v-if="spectators.length > 0" class="card">
      <div class="card-title">观众（{{ spectators.length }}）</div>
      <div class="player-list">
        <div
          v-for="p in spectators"
          :key="p.id"
          class="player-row"
          :class="{ 'is-me': p.id === store.myId }"
        >
          <div class="p-avatar">{{ p.avatar || '👁' }}</div>
          <div class="p-info">
            <span class="p-name">{{ p.nickname }}</span>
            <span v-if="p.id === store.myId" class="badge me-badge">我</span>
            <span class="badge spectator-badge">观众</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 操作栏（观众无需操作） -->
    <div v-if="!store.isSpectator" class="action-bar">
      <button
        v-if="!store.isHost"
        class="btn"
        :class="store.myPlayer?.isReady ? 'btn-outline' : 'btn-primary'"
        @click="sock.setReady(!store.myPlayer?.isReady)"
      >
        {{ store.myPlayer?.isReady ? '取消准备' : '准备好了' }}
      </button>

      <button
        v-if="store.isHost"
        class="btn btn-success"
        :disabled="seatedCount < 2"
        @click="sock.startGame()"
      >
        开始游戏 🚀
      </button>
    </div>

    <!-- 系统消息 -->
    <TransitionGroup name="toast" tag="div" class="toast-list">
      <div v-for="m in store.messages" :key="m.id" class="toast" :class="m.type">
        {{ m.text }}
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRoomStore } from '@/stores/room'
import { useSocket } from '@/composables/useSocket'
import type { RoomConfig } from '@shared/types'

const route  = useRoute()
const router = useRouter()
const store  = useRoomStore()
const sock   = useSocket()

const roomCode = computed(() => route.params.code as string)
const cfg      = computed(() => store.roomState?.config ?? {} as RoomConfig)
const inGame   = computed(() => store.inGame)
const allSeated   = computed(() => store.seatedPlayers)
const seatedCount = computed(() => allSeated.value.filter(p => !p.isBot).length + allSeated.value.filter(p => p.isBot).length)
const spectators  = computed(() => (store.roomState?.players ?? []).filter(p => p.seatIndex === null && !p.isBot))
const emptySeats  = computed(() => Math.max(0, (cfg.value.maxPlayers ?? 6) - allSeated.value.length))
const cfgCardType = computed(() => cfg.value.cardType === 'short' ? '短牌（36张）' : '长牌（52张）')

const showCfg  = ref(false)
const botDiff  = ref<'easy' | 'medium' | 'hard'>('medium')
const blindPair = ref('10/20')
const editCfg  = ref<Partial<RoomConfig>>({})
const copied   = ref(false)
const confirmTransferId = ref<string | null>(null)  // 正在确认转让的目标 ID

function doTransferHost(targetId: string) {
  if (confirmTransferId.value !== targetId) {
    // 第一次点击：进入确认态，3s 后自动取消
    confirmTransferId.value = targetId
    setTimeout(() => {
      if (confirmTransferId.value === targetId) confirmTransferId.value = null
    }, 3000)
  } else {
    // 第二次点击：确认转让
    sock.transferHost(targetId)
    confirmTransferId.value = null
  }
}

onMounted(() => {
  if (!store.inRoom) { router.replace('/'); return }
  editCfg.value  = { ...cfg.value }
  blindPair.value = `${cfg.value.smallBlind}/${cfg.value.bigBlind}`

  // 若游戏已经在进行中（例如观众中途加入），立即跳转到牌桌
  if (store.gamePhase !== 'waiting') {
    router.replace(`/room/${roomCode.value}/table`)
    return
  }

  // 当游戏开始时跳转到牌桌
  watch(() => store.gamePhase, (phase) => {
    if (phase !== 'waiting') {
      router.push(`/room/${roomCode.value}/table`)
    }
  })
})

function copyUrl() {
  navigator.clipboard.writeText(store.shareUrl).then(() => {
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  })
}

function applyConfig() {
  const [sb, bb] = blindPair.value.split('/').map(Number)
  sock.updateConfig({ ...editCfg.value, smallBlind: sb, bigBlind: bb })
  showCfg.value = false
}

function doLeave() {
  sock.leaveRoom()
  router.replace('/')
}
</script>

<style scoped>
.lobby {
  min-height: 100vh;
  background: #0d1117;
  color: #e6edf3;
  padding: 0 0 100px;
  max-width: 480px;
  margin: 0 auto;
  font-family: -apple-system, "PingFang SC", sans-serif;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
  position: sticky;
  top: 0;
  z-index: 10;
}
.back-btn {
  background: none;
  border: none;
  color: #8b949e;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 0;
}
.room-code { font-size: 14px; color: #8b949e; }
.code { font-size: 18px; font-weight: 700; color: #f0c040; letter-spacing: 2px; }

/* 分享卡片 */
.share-card {
  margin: 12px 16px;
  background: linear-gradient(135deg, #1a2744, #0d1b2a);
  border: 1px solid #2ea04366;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  user-select: none;
  transition: border-color .2s;
}
.share-card:active { border-color: #2ea043; }
.share-title { font-size: 13px; color: #8b949e; margin-bottom: 8px; }
.share-url {
  font-size: 13px;
  color: #4fc3f7;
  word-break: break-all;
  margin-bottom: 8px;
  font-family: monospace;
}
.copy-hint { font-size: 12px; color: #2ea043; text-align: right; }

/* 通用卡片 */
.card {
  margin: 0 16px 14px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 14px;
}
.card-title {
  font-weight: 600;
  font-size: 14px;
  color: #e6edf3;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.btn-link {
  background: none;
  border: none;
  color: #f0c040;
  font-size: 13px;
  cursor: pointer;
}

/* 配置网格 */
.cfg-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.cfg-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  background: #0d1117;
  border-radius: 6px;
  font-size: 13px;
  color: #8b949e;
}
.cfg-item span:last-child { color: #e6edf3; font-weight: 600; }

/* 内联编辑 */
.cfg-edit { margin-top: 12px; border-top: 1px solid #21262d; padding-top: 12px; }
.cfg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 14px;
}
.stepper { display: flex; align-items: center; gap: 8px; }
.stepper button {
  width: 28px; height: 28px;
  background: #21262d; border: 1px solid #30363d;
  border-radius: 6px; color: #e6edf3; font-size: 16px; cursor: pointer;
}
.stepper span { min-width: 24px; text-align: center; font-weight: 700; }
.select {
  background: #21262d; border: 1px solid #30363d;
  border-radius: 6px; color: #e6edf3;
  padding: 4px 8px; font-size: 13px; outline: none;
}
.radio-group { display: flex; gap: 12px; font-size: 13px; }
.radio-group label { display: flex; align-items: center; gap: 4px; }

/* 玩家列表 */
.player-list { display: flex; flex-direction: column; gap: 8px; }
.player-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: #0d1117;
  border-radius: 8px;
  border: 1px solid #21262d;
}
.player-row.is-me    { border-color: #2ea04366; }
.player-row.is-host  { border-color: #f0c04044; }
.player-row.empty-seat { opacity: .4; }
.p-avatar { font-size: 22px; width: 32px; text-align: center; }
.p-info   { flex: 1; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.p-name   { font-size: 14px; font-weight: 600; }
.p-chips  { font-size: 13px; color: #f0c040; }
.p-ready  { font-size: 16px; }
.ready    { color: #2ea043; }
.not-ready { color: #8b949e; }
.badge {
  font-size: 11px; padding: 1px 6px;
  border-radius: 10px; font-weight: 600;
}
.host-badge      { background: #f0c04022; color: #f0c040; border: 1px solid #f0c04044; }
.bot-badge       { background: #58a6ff22; color: #58a6ff; border: 1px solid #58a6ff44; }
.me-badge        { background: #2ea04322; color: #2ea043; border: 1px solid #2ea04344; }
.spectator-badge { background: #8b949e22; color: #8b949e; border: 1px solid #8b949e44; }
.kick-btn {
  background: none; border: none; color: #da3633; font-size: 14px; cursor: pointer; padding: 2px 6px;
}
.transfer-btn {
  background: none;
  border: 1px solid #f0c04055;
  color: #f0c040;
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
  padding: 2px 8px;
  transition: background .15s;
  white-space: nowrap;
}
.transfer-btn:active { background: #f0c04022; }
.transfer-confirm {
  background: #f0c04022;
  border-color: #f0c040;
  font-weight: 700;
}

.add-bot-row {
  display: flex; gap: 8px; margin-top: 12px; border-top: 1px solid #21262d; padding-top: 12px;
}
.add-bot-row .select { flex: 1; }

/* 底部操作 */
.action-bar {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  padding: 12px 16px;
  background: #161b22;
  border-top: 1px solid #30363d;
  max-width: 480px;
  margin: 0 auto;
}
.btn {
  width: 100%; padding: 14px;
  border: none; border-radius: 10px;
  font-size: 16px; font-weight: 700; cursor: pointer;
  transition: opacity .2s;
}
.btn:disabled { opacity: .4; cursor: default; }
.btn-primary  { background: #f0c040; color: #0d1117; }
.btn-success  { background: #2ea043; color: #fff; }
.btn-outline  { background: transparent; border: 1px solid #30363d; color: #e6edf3; }
.full-width   { width: 100%; margin-top: 8px; }

/* Toast */
.toast-list { position: fixed; top: 56px; left: 50%; transform: translateX(-50%); z-index: 100; display: flex; flex-direction: column; gap: 6px; width: 90%; max-width: 400px; }
.toast {
  padding: 10px 16px; border-radius: 8px;
  font-size: 14px; text-align: center;
  background: #21262d; color: #e6edf3;
}
.toast.error { background: #da363399; }
.toast.info  { background: #388bfd22; color: #58a6ff; }

.slide-enter-active, .slide-leave-active { transition: all .2s ease; overflow: hidden; }
.slide-enter-from, .slide-leave-to       { max-height: 0; opacity: 0; }
.slide-enter-to,   .slide-leave-from     { max-height: 400px; opacity: 1; }

.toast-enter-active, .toast-leave-active { transition: all .3s; }
.toast-enter-from, .toast-leave-to       { opacity: 0; transform: translateY(-10px); }
</style>
