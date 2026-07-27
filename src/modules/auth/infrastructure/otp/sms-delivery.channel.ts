import { Inject, Injectable } from '@nestjs/common';
import { SMS_PROVIDER, SmsProvider } from '../../domain/sms/sms-provider';
import { OtpDeliveryChannel } from '../../domain/otp/otp-delivery-channel';

/**
 * OTP SMS text — the single source of truth. MUST match the template approved in the Eskiz
 * cabinet exactly (fixed text + the code), or Eskiz rejects the send. Approved 27.07.2026.
 */
export const buildOtpMessage = (code: string): string =>
  `Student Club ilovasiga kirish uchun tasdiqlash kodi: ${code} Kodni hech kimga bermang.`;

/** Delivers the code as an SMS via the configured SmsProvider. Active when OTP_CHANNEL=sms. */
@Injectable()
export class SmsDeliveryChannel implements OtpDeliveryChannel {
  constructor(@Inject(SMS_PROVIDER) private readonly sms: SmsProvider) {}

  async deliver(phoneNumber: string, code: string): Promise<void> {
    await this.sms.send(phoneNumber, buildOtpMessage(code));
  }
}
