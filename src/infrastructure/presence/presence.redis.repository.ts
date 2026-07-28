import { Injectable } from '@nestjs/common';
import { RedisService } from '../cache/redis.service';
import { PresenceRepository } from './presence.repository';

/** Seconds a presence key lives without a refresh — a safety net if a disconnect is missed. */
const PRESENCE_TTL_SECONDS = 90;

const key = (studentId: string): string => `presence:${studentId}`;

/**
 * Redis-backed online presence, refcounted by open sockets (C7). Multiple devices → multiple
 * sockets → the key only clears when the last one disconnects.
 */
@Injectable()
export class PresenceRedisRepository implements PresenceRepository {
  constructor(private readonly redis: RedisService) {}

  async online(studentId: string): Promise<void> {
    await this.redis.incr(key(studentId));
    await this.redis.expire(key(studentId), PRESENCE_TTL_SECONDS);
  }

  async offline(studentId: string): Promise<boolean> {
    const remaining = await this.redis.decr(key(studentId));
    if (remaining <= 0) {
      await this.redis.del(key(studentId));
      return true;
    }
    await this.redis.expire(key(studentId), PRESENCE_TTL_SECONDS);
    return false;
  }

  isOnline(studentId: string): Promise<boolean> {
    return this.redis.exists(key(studentId));
  }

  /** One round-trip per id, issued together — keeps list endpoints off a per-row await chain. */
  async onlineAmong(studentIds: string[]): Promise<Set<string>> {
    if (studentIds.length === 0) {
      return new Set();
    }
    const flags = await Promise.all(studentIds.map((id) => this.redis.exists(key(id))));
    return new Set(studentIds.filter((_, index) => flags[index]));
  }
}
