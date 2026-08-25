<template>
  <RouterView />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useSocket } from '@/composables/useSocket'

// 应用启动时立即建立 WebSocket 连接
const { connect } = useSocket()
onMounted(() => { connect() })
</script>
