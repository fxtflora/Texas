#!/usr/bin/env node
// scripts/kill-ports.cjs
// 启动前清理指定端口的残留进程（Windows / macOS / Linux 通用）

const { execSync } = require('child_process')

const PORTS = [3000, 5173, 5174, 5175]

function killPort(port) {
  try {
    if (process.platform === 'win32') {
      // Windows: 用 netstat + taskkill
      const output = execSync(
        `netstat -ano | findstr :${port}`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      )
      const pids = new Set()
      output.split('\n').forEach(line => {
        const m = line.trim().match(/(\d+)$/)
        if (m && m[1] !== '0') pids.add(m[1])
      })
      pids.forEach(pid => {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
          console.log(`  [kill-ports] 终止 PID ${pid} (端口 ${port})`)
        } catch (_) { /* 进程已不存在 */ }
      })
    } else {
      // macOS / Linux: 用 lsof
      const output = execSync(
        `lsof -ti tcp:${port}`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim()
      if (output) {
        output.split('\n').forEach(pid => {
          try {
            execSync(`kill -9 ${pid}`, { stdio: 'ignore' })
            console.log(`  [kill-ports] 终止 PID ${pid} (端口 ${port})`)
          } catch (_) { /* 进程已不存在 */ }
        })
      }
    }
  } catch (_) {
    // 端口未被占用，忽略
  }
}

console.log('[kill-ports] 检查并清理开发端口...')
PORTS.forEach(killPort)
console.log('[kill-ports] 完成\n')
