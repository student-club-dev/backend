import { Injectable, Logger } from '@nestjs/common';
import { OtpDeliveryChannel } from '../../domain/otp/otp-delivery-channel';

/** Local-only channel: logs the code instead of delivering it. Never selected in production. */
@Injectable()
export class DevDeliveryChannel implements OtpDeliveryChannel {
  private readonly logger = new Logger(DevDeliveryChannel.name);

  deliver(phoneNumber: string, code: string): Promise<void> {
    this.logger.warn(`[DEV OTP] ${phoneNumber} -> ${code}`);
    return Promise.resolve();
  }
}
