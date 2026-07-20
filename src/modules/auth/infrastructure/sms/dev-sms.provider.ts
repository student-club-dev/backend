import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from '../../domain/sms/sms-provider';

/**
 * Local/dev SMS provider — makes NO external call. Logs the message (including the OTP code) so
 * developers can read it from the console, then resolves with the same contract as the production
 * provider. The factory refuses to bind this in production (fail-fast), so the code is never
 * exposed on a live system.
 */
@Injectable()
export class DevSmsProvider implements SmsProvider {
  private readonly logger = new Logger(DevSmsProvider.name);

  send(phoneNumber: string, text: string): Promise<void> {
    this.logger.log(`[DEV SMS] → ${phoneNumber}: ${text}`);
    return Promise.resolve();
  }
}
