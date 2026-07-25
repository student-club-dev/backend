import { Inject, Injectable } from '@nestjs/common';
import { SMS_PROVIDER, SmsProvider } from '../../domain/sms/sms-provider';
import { OtpDeliveryChannel } from '../../domain/otp/otp-delivery-channel';

/** OTP SMS text — the single source of truth (moved here from OtpService). */
export const buildOtpMessage = (code: string): string =>
  `Hurmatli foydalanuvchi sizning kodingiz - ${code}`;

/** Delivers the code as an SMS via the configured SmsProvider. Active when OTP_CHANNEL=sms. */
@Injectable()
export class SmsDeliveryChannel implements OtpDeliveryChannel {
  constructor(@Inject(SMS_PROVIDER) private readonly sms: SmsProvider) {}

  async deliver(phoneNumber: string, code: string): Promise<void> {
    await this.sms.send(phoneNumber, buildOtpMessage(code));
  }
}
