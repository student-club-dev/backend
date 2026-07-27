import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { PresenceRepository } from '../domain/presence.repository';

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
}
