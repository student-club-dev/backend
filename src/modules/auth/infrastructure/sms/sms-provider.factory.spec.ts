import { AppException } from '../../../../common/exceptions/app.exception';
import { SmsProvider } from '../../domain/sms/sms-provider';
import { createSmsProvider } from './sms-provider.factory';

const dev: SmsProvider = { send: jest.fn() };
const eskiz: SmsProvider = { send: jest.fn() };

describe('createSmsProvider', () => {
  it('returns the dev provider when SMS_PROVIDER=dev outside production', () => {
    expect(createSmsProvider('dev', 'development', dev, eskiz)).toBe(dev);
    expect(createSmsProvider('dev', 'test', dev, eskiz)).toBe(dev);
  });

  it('returns the eskiz provider when SMS_PROVIDER=eskiz', () => {
    expect(createSmsProvider('eskiz', 'production', dev, eskiz)).toBe(eskiz);
    expect(createSmsProvider('eskiz', 'development', dev, eskiz)).toBe(eskiz);
  });

  it('fails fast when the dev provider is selected in production', () => {
    expect(() => createSmsProvider('dev', 'production', dev, eskiz)).toThrow(AppException);
  });
});
