<template>
  <!-- 断线/重连中提示横幅 -->
  <Transition name="banner">
    <div v-if="showBanner" class="reconnect-banner">
      <span v-if="status === 'disconnected' || status === 'connecting'">
        📡 网络已断开，正在重新连接…
      </span>
      <span v-else-if="status === 'error'">
        ⚠️ 连接失败，请检查网络后刷新页面
      </span>
    </div>
  </Transition>

  <RouterView />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSocket } from '@/composables/useSocket'

const { connect, status } = useSocket()

// 仅在已进入房间后才显示横幅（初次进入大厅不显示）
import { useRoomStore } from '@/stores/room'
const store = useRoomStore()
const showBanner = computed(() =>
  store.inRoom && (status.value === 'disconnected' || status.value === 'connecting' || status.value === 'error')
)

onMounted(() => { connect() })
</script>

<style>
.reconnect-banner {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 9999;
  background: #b45309;
  color: #fff;
  text-align: center;
  padding: 8px 16px;
  font-size: 13px;
  font-family: -apple-system, "PingFang SC", sans-serif;
}
.banner-enter-active,
.banner-leave-active { transition: transform 0.25s ease; }
.banner-enter-from,
.banner-leave-to    { transform: translateY(-100%); }
</style>
