import { Global, Module } from '@nestjs/common';
import { DevPushProvider } from './dev-push.provider';
import { PUSH_PROVIDER } from './push-provider';

/**
 * Global push provider. Bound to the dev (logging) impl for now; a real FCM/APNs provider swaps in
 * behind the same `PUSH_PROVIDER` token (config-gated) once credentials exist.
 */
@Global()
@Module({
  providers: [{ provide: PUSH_PROVIDER, useClass: DevPushProvider }],
  exports: [PUSH_PROVIDER],
})
export class PushModule {}
