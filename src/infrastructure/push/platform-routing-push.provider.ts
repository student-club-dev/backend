import { Injectable, Logger } from '@nestjs/common';
import { ApnsPushProvider } from './apns-push.provider';
import { FcmPushProvider } from './fcm-push.provider';
import {
  PushNotification,
  PushOutcome,
  PushProvider,
  PushTarget,
  emptyPushOutcome,
} from './push-provider';

/**
 * Routes each device to the service that can actually reach it: iOS to Apple directly, Android and
 * web to FCM.
 *
 * This is the fix for the bug the whole change exists for. There used to be one provider for every
 * platform, so an iPhone's raw APNs token was handed to FCM, which does not recognise it — the send
 * "succeeded" and nothing ever arrived. Google offers no other channel for Android, and Apple none
 * for Android, so two providers is the floor, not a choice.
 *
 * The two run concurrently and independently: an APNs outage must not cost Android users their
 * notifications, and vice versa.
 */
@Injectable()
export class PlatformRoutingPushProvider implements PushProvider {
  private readonly logger = new Logger(PlatformRoutingPushProvider.name);

  constructor(
    private readonly fcm: FcmPushProvider,
    private readonly apns: ApnsPushProvider,
  ) {}

  async send(targets: PushTarget[], notification: PushNotification): Promise<PushOutcome> {
    const ios = targets.filter((target) => target.platform === 'IOS');
    const others = targets.filter((target) => target.platform !== 'IOS');

    const settled = await Promise.allSettled([
      ios.length > 0 ? this.apns.send(ios, notification) : emptyPushOutcome(),
      others.length > 0 ? this.fcm.send(others, notification) : emptyPushOutcome(),
    ]);

    const merged = emptyPushOutcome();
    for (const result of settled) {
      if (result.status === 'rejected') {
        // A provider is contractually not allowed to throw; if one ever does, the other's result is
        // still honoured rather than lost with it.
        this.logger.error(`Push provider threw: ${String(result.reason)}`);
        continue;
      }
      merged.dead.push(...result.value.dead);
      merged.delivered.push(...result.value.delivered);
    }
    return merged;
  }
}
