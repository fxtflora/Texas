<template>
  <div class="hall">
    <!-- 标题 -->
    <div class="brand">
      <div class="brand-icon">🃏</div>
      <h1>德州扑克</h1>
      <p class="subtitle">Texas Hold'em</p>
    </div>

    <!-- 昵称 -->
    <div class="card form-card">
      <label class="field-label">昵称</label>
      <input
        v-model="nickname"
        class="input"
        placeholder="输入你的昵称（最多12字）"
        maxlength="12"
        @keydown.enter="joinCode ? doJoin() : (showCreate = !showCreate)"
      />
    </div>

    <!-- 加入房间（通过邀请码或链接） -->
    <div class="card form-card">
      <label class="field-label">加入已有房间</label>
      <div class="row-input">
        <input
          v-model="joinCode"
          class="input code-input"
          placeholder="输入6位房间码"
          maxlength="6"
          style="text-transform:uppercase"
        />
        <button class="btn btn-primary" :disabled="!canJoin" @click="doJoin">加入</button>
      </div>
      <label class="field-label" style="margin-top:8px">
        <input v-model="asSpectator" type="checkbox" /> 以观众身份加入
      </label>
    </div>

    <!-- 创建房间（可折叠） -->
    <div class="card form-card">
      <div class="section-header" @click="showCreate = !showCreate">
        <span>创建新房间</span>
        <span class="toggle-icon">{{ showCreate ? '▲' : '▼' }}</span>
      </div>

      <Transition name="slide">
        <div v-if="showCreate" class="create-form">
          <!-- 基础设置 -->
          <div class="cfg-row">
            <label>最大玩家数</label>
            <div class="stepper">
              <button @click="cfg.maxPlayers = Math.max(2, (cfg.maxPlayers ?? 6) - 1)">−</button>
              <span>{{ cfg.maxPlayers ?? 6 }}</span>
              <button @click="cfg.maxPlayers = Math.min(9, (cfg.maxPlayers ?? 6) + 1)">+</button>
            </div>
          </div>

          <div class="cfg-row">
            <label>起始筹码</label>
            <select v-model="cfg.startingChips" class="select">
              <option :value="500">500</option>
              <option :value="1000">1000</option>
              <option :value="2000">2000</option>
              <option :value="5000">5000</option>
            </select>
          </div>

          <div class="cfg-row">
            <label>大/小盲注</label>
            <select v-model="blindPair" class="select">
              <option value="5/10">5 / 10</option>
              <option value="10/20">10 / 20</option>
              <option value="25/50">25 / 50</option>
              <option value="50/100">50 / 100</option>
            </select>
          </div>

          <div class="cfg-row">
            <label>牌型</label>
            <div class="radio-group">
              <label>
                <input v-model="cfg.cardType" type="radio" value="standard" /> 长牌（52张）
              </label>
              <label>
                <input v-model="cfg.cardType" type="radio" value="short" /> 短牌（36张）
              </label>
            </div>
          </div>

          <div class="cfg-row">
            <label>行动超时</label>
            <select v-model="cfg.actionTimeoutSec" class="select">
              <option :value="15">15秒</option>
              <option :value="30">30秒</option>
              <option :value="60">60秒</option>
            </select>
          </div>

          <div class="cfg-row">
            <label>摊牌全部亮牌</label>
            <label class="toggle">
              <input v-model="cfg.showAllCards" type="checkbox" />
              <span class="toggle-track" />
            </label>
          </div>

          <button class="btn btn-success full-width" :disabled="!canCreate" @click="doCreate">
            创建房间
          </button>
        </div>
      </Transition>
    </div>

    <!-- 连接状态 -->
    <div class="status-bar" :class="status">
      <span class="dot" />
      {{ statusText }}
    </div>

    <!-- 错误提示 -->
    <Transition name="fade">
      <div v-if="errorMsg" class="error-toast" @click="errorMsg = ''">
        ⚠ {{ errorMsg }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSocket } from '@/composables/useSocket'
import { useRoomStore } from '@/stores/room'
import type { RoomConfig } from '@shared/types'

const route  = useRoute()
const router = useRouter()
const sock   = useSocket()
const store  = useRoomStore()

// ── 表单状态 ──────────────────────────────────────────────────
const nickname    = ref(localStorage.getItem('tx_nickname') ?? '')
const joinCode    = ref('')
const asSpectator = ref(false)
const showCreate  = ref(false)
const errorMsg    = ref('')

// ── 房间配置 ──────────────────────────────────────────────────
const cfg = ref<Partial<RoomConfig>>({
  maxPlayers:       6,
  startingChips:    1000,
  cardType:         'standard',
  actionTimeoutSec: 30,
  allowSpectators:  true,
  showAllCards:     false,
})
const blindPair = ref('10/20')

// ── 连接状态 ──────────────────────────────────────────────────
const { status, connect } = sock
const statusText = computed(() => ({
  connected:    '已连接',
  connecting:   '连接中…',
  disconnected: '未连接',
  error:        '连接失败，请刷新',
}[status.value] ?? ''))

// ── 验证 ──────────────────────────────────────────────────────
const canCreate = computed(() => nickname.value.trim().length > 0 && status.value === 'connected')
const canJoin   = computed(() => nickname.value.trim().length > 0 && joinCode.value.trim().length === 6 && status.value === 'connected')

// ── 自动填入URL中的邀请码 ─────────────────────────────────────
onMounted(() => {
  const socket = connect()
  if (route.params.code) {
    joinCode.value = String(route.params.code).toUpperCase()
    showCreate.value = false
  }

  // 监听 room:joined 跳转到 Lobby
  socket.on('room:joined', (payload: any) => {
    store.onJoined(payload)
    router.push(`/room/${payload.roomState.code}/lobby`)
  })

  socket.on('error', (err: { code: string; message: string }) => {
    errorMsg.value = err.message
    setTimeout(() => { errorMsg.value = '' }, 4000)
  })
})

watch(nickname, v => localStorage.setItem('tx_nickname', v))

// ── 操作 ──────────────────────────────────────────────────────
function doCreate() {
  if (!canCreate.value) return
  const [sb, bb] = blindPair.value.split('/').map(Number)
  sock.createRoom(nickname.value.trim(), { ...cfg.value, smallBlind: sb, bigBlind: bb })
}

function doJoin() {
  if (!canJoin.value) return
  sock.joinRoom(joinCode.value, nickname.value.trim(), asSpectator.value)
}
</script>

<style scoped>
.hall {
  min-height: 100vh;
  background: #0d1117;
  color: #e6edf3;
  padding: 24px 16px 80px;
  max-width: 480px;
  margin: 0 auto;
  font-family: -apple-system, "PingFang SC", sans-serif;
}

.brand { text-align: center; margin-bottom: 28px; }
.brand-icon { font-size: 52px; margin-bottom: 8px; }
.brand h1   { font-size: 28px; font-weight: 700; margin: 0; color: #f0c040; }
.subtitle   { color: #8b949e; font-size: 13px; margin: 4px 0 0; }

.card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 14px;
}

.field-label { font-size: 13px; color: #8b949e; display: block; margin-bottom: 8px; }

.input {
  width: 100%;
  box-sizing: border-box;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  color: #e6edf3;
  padding: 10px 12px;
  font-size: 15px;
  outline: none;
  transition: border-color .2s;
}
.input:focus { border-color: #f0c040; }

.row-input { display: flex; gap: 8px; }
.code-input { flex: 1; letter-spacing: 4px; font-weight: 700; text-align: center; }

.btn {
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity .2s;
}
.btn:disabled { opacity: .4; cursor: default; }
.btn-primary  { background: #f0c040; color: #0d1117; }
.btn-success  { background: #2ea043; color: #fff; }
.full-width   { width: 100%; margin-top: 12px; }

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  font-weight: 600;
  user-select: none;
}
.toggle-icon { color: #8b949e; }

.create-form { margin-top: 14px; }

.cfg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #21262d;
  font-size: 14px;
}
.cfg-row label { color: #c9d1d9; }

.stepper {
  display: flex;
  align-items: center;
  gap: 10px;
}
.stepper button {
  width: 28px; height: 28px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #e6edf3;
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
}
.stepper span { min-width: 24px; text-align: center; font-weight: 700; }

.select {
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #e6edf3;
  padding: 4px 8px;
  font-size: 14px;
  outline: none;
}

.radio-group { display: flex; gap: 12px; }
.radio-group label { display: flex; align-items: center; gap: 4px; }

/* Toggle switch */
.toggle { display: flex; align-items: center; cursor: pointer; }
.toggle input { display: none; }
.toggle-track {
  width: 42px; height: 24px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 12px;
  position: relative;
  transition: background .2s;
}
.toggle-track::after {
  content: '';
  position: absolute;
  top: 3px; left: 3px;
  width: 16px; height: 16px;
  background: #8b949e;
  border-radius: 50%;
  transition: transform .2s, background .2s;
}
.toggle input:checked + .toggle-track { background: #2ea04333; border-color: #2ea043; }
.toggle input:checked + .toggle-track::after { transform: translateX(18px); background: #2ea043; }

.status-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #8b949e;
  justify-content: center;
  padding: 8px;
}
.dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #8b949e;
}
.status-bar.connected .dot    { background: #2ea043; }
.status-bar.connecting .dot   { background: #f0c040; animation: pulse 1s infinite; }
.status-bar.error .dot        { background: #da3633; }

@keyframes pulse {
  0%,100% { opacity: 1; } 50% { opacity: .3; }
}

.error-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #da3633cc;
  color: #fff;
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 14px;
  backdrop-filter: blur(8px);
  cursor: pointer;
}

.slide-enter-active, .slide-leave-active { transition: all .2s ease; overflow: hidden; }
.slide-enter-from, .slide-leave-to       { max-height: 0; opacity: 0; }
.slide-enter-to,   .slide-leave-from     { max-height: 600px; opacity: 1; }

.fade-enter-active, .fade-leave-active { transition: opacity .3s; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
</style>
