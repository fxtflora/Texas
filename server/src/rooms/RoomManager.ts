// ============================================================
// RoomManager.ts — 全局房间生命周期管理（单例）
// ============================================================

import type { Server } from 'socket.io'
import { GameRoom } from './GameRoom'
import { ROOM_CODE_LENGTH, ROOM_CODE_CHARS } from '@shared/constants'
import type { RoomConfig } from '@shared/types'
import { logger } from '../utils/logger'

export class RoomManager {
  private rooms = new Map<string, GameRoom>()   // code -> GameRoom
  private io: Server
  public  publicUrl: string

  constructor(io: Server, publicUrl: string) {
    this.io        = io
    this.publicUrl = publicUrl
    // 定时清理空房间（每5分钟）
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  /** 创建新房间，返回 GameRoom 实例 */
  create(config: Partial<RoomConfig>): GameRoom {
    const code = this.generateCode()
    const room = new GameRoom(code, config, this.io, this.publicUrl)
    this.rooms.set(code, room)
    logger.info('RoomManager', `新房间已创建: ${code}（当前房间数: ${this.rooms.size}）`)
    return room
  }

  /** 通过邀请码查找房间 */
  get(code: string): GameRoom | undefined {
    return this.rooms.get(code.toUpperCase())
  }

  /** 删除房间 */
  delete(code: string): void {
    const room = this.rooms.get(code)
    if (room) {
      room.destroy()
      this.rooms.delete(code)
      logger.info('RoomManager', `房间已销毁: ${code}（剩余: ${this.rooms.size}）`)
    }
  }

  /** 列出所有活跃房间信息（服务端调试用） */
  list(): Array<{ code: string; players: number; status: string }> {
    return [...this.rooms.values()].map(r => ({
      code:    r.code,
      players: r.playerCount,
      status:  r.status,
    }))
  }

  /** 当玩家 socket 断开时，通知所在房间 */
  handleDisconnect(socketId: string): void {
    for (const room of this.rooms.values()) {
      if (room.hasSocket(socketId)) {
        room.handleDisconnect(socketId)
        break
      }
    }
  }

  // ── 私有方法 ──────────────────────────────────────────────

  private generateCode(): string {
    let code: string
    do {
      code = Array.from({ length: ROOM_CODE_LENGTH }, () =>
        ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)],
      ).join('')
    } while (this.rooms.has(code))
    return code
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [code, room] of this.rooms.entries()) {
      // 超过2小时无活动的空房间自动删除
      if (room.playerCount === 0 && now - room.createdAt > 2 * 60 * 60 * 1000) {
        this.delete(code)
      }
    }
  }
}
