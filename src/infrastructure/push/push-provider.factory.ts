import { Logger } from '@nestjs/common';
import type { Env } from '../../config/env';
import { PushProvider } from './push-provider';

/**
 * Selects the active push provider from config.
 *
 * `dev` only writes a log line — no notification reaches any device. In production that is almost
 * always a misconfiguration, so it is reported at ERROR level on every boot: a silently dropped
 * notification is invisible until users start complaining about missed messages, and by then nobody
 * connects it to a config value.
 *
 * It deliberately does **not** refuse to boot, unlike the SMS provider. Push is being rolled out
 * after the service was already live, so blocking a deploy on credentials that are not ready yet
 * would cost more than it protects — the loud log is the trade. Once `PUSH_PROVIDER=fcm` is set
 * everywhere, tightening this to a hard failure is a two-line change.
 */
export function createPushProvider(
  provider: Env['PUSH_PROVIDER'],
  nodeEnv: Env['NODE_ENV'],
  dev: PushProvider,
  fcm: PushProvider,
): PushProvider {
  if (provider === 'dev' && nodeEnv === 'production') {
    new Logger('PushProvider').error(
      'PUSH_PROVIDER=dev in production — NO push notification will reach any device. ' +
        'Offline students will not be told about new messages. ' +
        'Fix: set PUSH_PROVIDER=fcm together with FCM_PROJECT_ID, FCM_CLIENT_EMAIL and ' +
        'FCM_PRIVATE_KEY (see docs/handoff/RUNBOOK.md §C1).',
    );
  }
  return provider === 'fcm' ? fcm : dev;
}
