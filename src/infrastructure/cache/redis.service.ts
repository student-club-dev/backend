import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env';

/**
 * Shared Redis client. Owns the connection lifecycle so every consumer injects one pooled client.
 * A thin typed wrapper over ioredis — Redis is used ONLY through this service (and repositories).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(config: ConfigService<Env, true>) {
    const url = config.get('REDIS_URL', { infer: true });
    this.client = url === undefined ? new Redis() : new Redis(url);
    // Without a listener ioredis re-emits connection errors as uncaught — keep the process alive.
    this.client.on('error', (error: Error) => this.logger.error(`Redis error: ${error.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  set(key: string, value: string, ttlSeconds: number): Promise<'OK'> {
    return this.client.set(key, value, 'EX', ttlSeconds);
  }

  /** Returns `null` when the key is absent or expired. */
  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) > 0;
  }

  /**
   * Sets the key only if it is absent, returning whether this call was the one that set it.
   * `SET NX EX` is a single atomic command — unlike `exists` followed by `set`, two concurrent
   * callers cannot both come back true, which is what makes it usable as a claim/once-guard.
   */
  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  decr(key: string): Promise<number> {
    return this.client.decr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  /** Seconds until the key expires, `-1` if it has no expiry, `-2` if it does not exist. */
  ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async hset(key: string, values: Record<string, string | number>): Promise<void> {
    await this.client.hset(key, values);
  }

  hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  hincrby(key: string, field: string, increment: number): Promise<number> {
    return this.client.hincrby(key, field, increment);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Run a Lua script server-side. The only way to make a multi-key decision atomic — the call
   * glare rule reads two `busy:` keys and writes three, and a two-command version would let two
   * simultaneous invites both conclude "the peer is free".
   *
   * Kept here rather than exposing the raw client: this file is the single place Redis is spoken to.
   */
  eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    return this.client.eval(script, keys.length, ...keys, ...args);
  }

  /**
   * Deletes every key matching a glob (`catalog:counts:*`). Uses SCAN rather than KEYS so it never
   * blocks the server. Needed to invalidate a cached aggregate when the data behind it changes —
   * the cache key encodes the query, so there is no single key to drop.
   */
  async delByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) {
        deleted += await this.client.del(...keys);
      }
    } while (cursor !== '0');
    return deleted;
  }
}
