import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useConnectionStore = defineStore('connection', () => {
  const isConnected   = ref(false)
  const socketId      = ref('')
  const serverVersion = ref('')
  const pingHistory   = ref<number[]>([])

  const avgPing = computed(() => {
    if (pingHistory.value.length === 0) return 0
    const sum = pingHistory.value.reduce((a, b) => a + b, 0)
    return Math.round(sum / pingHistory.value.length)
  })

  function setConnected(id: string, version: string) {
    isConnected.value   = true
    socketId.value      = id
    serverVersion.value = version
  }

  function setDisconnected() {
    isConnected.value = false
    socketId.value    = ''
  }

  function recordPing(ms: number) {
    pingHistory.value.push(ms)
    if (pingHistory.value.length > 10) pingHistory.value.shift()
  }

  return { isConnected, socketId, serverVersion, pingHistory, avgPing, setConnected, setDisconnected, recordPing }
})
