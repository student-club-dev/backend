import { Injectable, Logger } from '@nestjs/common';
import {
  PushNotification,
  PushOutcome,
  PushProvider,
  PushTarget,
  emptyPushOutcome,
} from './push-provider';

/**
 * Development push provider — logs instead of hitting FCM/APNs, so the whole offline-push path works
 * end-to-end without credentials. The real FCM/APNs providers swap in behind the same port + config.
 */
@Injectable()
export class DevPushProvider implements PushProvider {
  private readonly logger = new Logger(DevPushProvider.name);

  async send(targets: PushTarget[], notification: PushNotification): Promise<PushOutcome> {
    if (targets.length > 0) {
      const platforms = targets.map((target) => target.platform).join(',');
      this.logger.log(
        `[dev-push] → ${targets.length} device(s) [${platforms}]: "${notification.title}" — ${notification.body}`,
      );
    }
    // Nothing was really sent, so nothing can be known to be dead — or delivered.
    return emptyPushOutcome();
  }
}
