import { AppException } from '../../../../common/exceptions/app.exception';
import { OtpDeliveryChannel } from '../../domain/otp/otp-delivery-channel';
import { createOtpDeliveryChannel } from './otp-delivery.factory';

const dev = { name: 'dev' } as unknown as OtpDeliveryChannel;
const tg = { name: 'tg' } as unknown as OtpDeliveryChannel;
const sms = { name: 'sms' } as unknown as OtpDeliveryChannel;

describe('createOtpDeliveryChannel', () => {
  it('selects telegram / sms / dev by OTP_CHANNEL', () => {
    expect(createOtpDeliveryChannel('telegram', 'development', dev, tg, sms)).toBe(tg);
    expect(createOtpDeliveryChannel('sms', 'development', dev, tg, sms)).toBe(sms);
    expect(createOtpDeliveryChannel('dev', 'development', dev, tg, sms)).toBe(dev);
  });

  it('throws when dev is selected in production (fail-fast)', () => {
    expect(() => createOtpDeliveryChannel('dev', 'production', dev, tg, sms)).toThrow(AppException);
  });
});
