// ============================================================
// 日志工具 —— 带颜色和时间戳的控制台日志
// ============================================================

type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'socket'

const COLORS: Record<LogLevel, string> = {
  info:   '\x1b[36m',   // 青色
  warn:   '\x1b[33m',   // 黄色
  error:  '\x1b[31m',   // 红色
  debug:  '\x1b[35m',   // 紫色
  socket: '\x1b[32m',   // 绿色
}
const RESET = '\x1b[0m'
const DIM   = '\x1b[2m'

function timestamp(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function log(level: LogLevel, tag: string, message: string, ...args: unknown[]): void {
  const color = COLORS[level]
  const prefix = `${DIM}${timestamp()}${RESET} ${color}[${level.toUpperCase().padEnd(6)}]${RESET} ${DIM}[${tag}]${RESET}`
  if (args.length > 0) {
    console.log(`${prefix} ${message}`, ...args)
  } else {
    console.log(`${prefix} ${message}`)
  }
}

export const logger = {
  info:   (tag: string, msg: string, ...args: unknown[]) => log('info',   tag, msg, ...args),
  warn:   (tag: string, msg: string, ...args: unknown[]) => log('warn',   tag, msg, ...args),
  error:  (tag: string, msg: string, ...args: unknown[]) => log('error',  tag, msg, ...args),
  debug:  (tag: string, msg: string, ...args: unknown[]) => log('debug',  tag, msg, ...args),
  socket: (tag: string, msg: string, ...args: unknown[]) => log('socket', tag, msg, ...args),
}
