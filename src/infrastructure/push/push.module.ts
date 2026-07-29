import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { DevPushProvider } from './dev-push.provider';
import { FcmPushProvider } from './fcm-push.provider';
import { PUSH_PROVIDER, PushProvider } from './push-provider';
import { createPushProvider } from './push-provider.factory';

/**
 * Global push provider, chosen by `PUSH_PROVIDER` (dev | fcm). Both are constructed; the factory
 * picks one and refuses to boot production on the dev logger. Mirrors the SMS provider registry —
 * callers depend on the `PUSH_PROVIDER` interface only.
 */
@Global()
@Module({
  providers: [
    DevPushProvider,
    FcmPushProvider,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService, DevPushProvider, FcmPushProvider],
      useFactory: (
        config: ConfigService<Env, true>,
        dev: DevPushProvider,
        fcm: FcmPushProvider,
      ): PushProvider =>
        createPushProvider(
          config.get('PUSH_PROVIDER', { infer: true }),
          config.get('NODE_ENV', { infer: true }),
          dev,
          fcm,
        ),
    },
  ],
  exports: [PUSH_PROVIDER],
})
export class PushModule {}
