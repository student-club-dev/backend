import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { ApnsPushProvider, isApnsConfigured } from './apns-push.provider';
import { APNS_TRANSPORT, Http2ApnsTransport } from './apns-transport';
import { DevPushProvider } from './dev-push.provider';
import { FcmPushProvider } from './fcm-push.provider';
import { PlatformRoutingPushProvider } from './platform-routing-push.provider';
import { PUSH_PROVIDER, PushProvider } from './push-provider';
import { createPushProvider } from './push-provider.factory';

/**
 * Global push provider, chosen by `PUSH_PROVIDER` (dev | fcm). All are constructed; the factory
 * picks between the dev logger and the real platform-routed pair (FCM for Android/web, APNs for
 * iOS). Mirrors the SMS provider registry — callers depend on the `PUSH_PROVIDER` interface only.
 */
@Global()
@Module({
  providers: [
    DevPushProvider,
    FcmPushProvider,
    { provide: APNS_TRANSPORT, useClass: Http2ApnsTransport },
    ApnsPushProvider,
    PlatformRoutingPushProvider,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService, DevPushProvider, PlatformRoutingPushProvider],
      useFactory: (
        config: ConfigService<Env, true>,
        dev: DevPushProvider,
        live: PlatformRoutingPushProvider,
      ): PushProvider =>
        createPushProvider(
          config.get('PUSH_PROVIDER', { infer: true }),
          config.get('NODE_ENV', { infer: true }),
          isApnsConfigured(config),
          dev,
          live,
        ),
    },
  ],
  // The two concrete providers are exported alongside the port because calls need channels the
  // port does not model: a VoIP push (APNs-only, its own headers) and a data-only Android push.
  // Widening `PushProvider` with call-shaped methods would put them on every caller instead.
  exports: [PUSH_PROVIDER, ApnsPushProvider, FcmPushProvider],
})
export class PushModule {}
