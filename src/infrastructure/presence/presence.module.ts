import { Module } from '@nestjs/common';
import { PRESENCE_REPOSITORY } from './presence.repository';
import { PresenceRedisRepository } from './presence.redis.repository';

/**
 * Online-presence provider, shared by `chat` (writes it from the socket lifecycle) and
 * `connections` (reads it to fill `StudentSummary.online`). `RedisService` comes from the
 * global RedisModule.
 */
@Module({
  providers: [{ provide: PRESENCE_REPOSITORY, useClass: PresenceRedisRepository }],
  exports: [PRESENCE_REPOSITORY],
})
export class PresenceModule {}
