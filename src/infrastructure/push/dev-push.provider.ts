import { Injectable, Logger } from '@nestjs/common';
import { PushNotification, PushProvider } from './push-provider';

/**
 * Development push provider — logs instead of hitting FCM/APNs, so the whole offline-push path works
 * end-to-end without credentials. The real FCM/APNs provider swaps in behind the same port + config.
 */
@Injectable()
export class DevPushProvider implements PushProvider {
  private readonly logger = new Logger(DevPushProvider.name);

  async send(tokens: string[], notification: PushNotification): Promise<void> {
    if (tokens.length === 0) {
      return;
    }
    this.logger.log(
      `[dev-push] → ${tokens.length} device(s): "${notification.title}" — ${notification.body}`,
    );
  }
}
