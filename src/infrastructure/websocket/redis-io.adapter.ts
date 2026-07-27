import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter backed by Redis pub/sub, so real-time events (`message:new`, receipts, presence)
 * fan out across every app instance (docs/architecture/chat.md C2). Falls back to localhost when
 * `redisUrl` is unset (matches docker-compose). Call `connect()` before `app.listen()`.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterFactory?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl?: string,
  ) {
    super(app);
  }

  connect(): void {
    const pub = this.redisUrl === undefined ? new Redis() : new Redis(this.redisUrl);
    const sub = pub.duplicate();
    // Keep connection errors from crashing the process (mirrors RedisService).
    pub.on('error', () => undefined);
    sub.on('error', () => undefined);
    this.adapterFactory = createAdapter(pub, sub);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterFactory !== undefined) {
      server.adapter(this.adapterFactory);
    }
    return server;
  }
}
