import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      '@':      fileURLToPath(new URL('./src',          import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    host: '0.0.0.0',          // 允许局域网访问（本机手机测试用）
    allowedHosts: true,        // 允许 cloudflared 临时域名等任意 Host 访问
    proxy: {
      // 将 /socket.io 请求代理到后端（包含 WebSocket 升级）
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
