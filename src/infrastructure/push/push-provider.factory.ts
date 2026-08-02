import { Logger } from '@nestjs/common';
import type { Env } from '../../config/env';
import { PushProvider } from './push-provider';

/**
 * Selects the active push provider from config. `fcm` means the real pair — FCM for Android/web,
 * APNs for iOS — behind `PlatformRoutingPushProvider`.
 *
 * `dev` only writes a log line — no notification reaches any device. In production that is almost
 * always a misconfiguration, so it is reported at ERROR level on every boot: a silently dropped
 * notification is invisible until users start complaining about missed messages, and by then nobody
 * connects it to a config value.
 *
 * The same reasoning covers missing APNs settings, which is the exact shape of the bug this
 * routing replaced: Android kept working, iPhones received nothing, and no error appeared anywhere.
 *
 * It deliberately does **not** refuse to boot, unlike the SMS provider. Push was rolled out after
 * the service was already live, so blocking a deploy on credentials that are not ready yet would
 * cost more than it protects — the loud log is the trade.
 */
export function createPushProvider(
  provider: Env['PUSH_PROVIDER'],
  nodeEnv: Env['NODE_ENV'],
  apnsConfigured: boolean,
  dev: PushProvider,
  live: PushProvider,
): PushProvider {
  const logger = new Logger('PushProvider');
  if (provider === 'dev' && nodeEnv === 'production') {
    logger.error(
      'PUSH_PROVIDER=dev in production — NO push notification will reach any device. ' +
        'Offline students will not be told about new messages. ' +
        'Fix: set PUSH_PROVIDER=fcm together with FCM_PROJECT_ID, FCM_CLIENT_EMAIL and ' +
        'FCM_PRIVATE_KEY (see docs/handoff/RUNBOOK.md §C1).',
    );
  }
  if (provider === 'fcm' && !apnsConfigured) {
    logger.error(
      'PUSH_PROVIDER=fcm but APNs is not configured — every iPhone will be skipped silently ' +
        'while Android keeps working. Fix: set APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID and ' +
        'APNS_TOPIC (see docs/handoff/RUNBOOK.md §C1).',
    );
  }
  return provider === 'fcm' ? live : dev;
}
