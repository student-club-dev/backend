import { ERROR_CODE } from '../../common/errors/error-code';
import { PushProvider } from './push-provider';
import { createPushProvider } from './push-provider.factory';

const dev = { send: jest.fn() } as unknown as PushProvider;
const fcm = { send: jest.fn() } as unknown as PushProvider;

describe('createPushProvider', () => {
  it('returns the dev logger outside production', () => {
    expect(createPushProvider('dev', 'development', dev, fcm)).toBe(dev);
    expect(createPushProvider('dev', 'test', dev, fcm)).toBe(dev);
  });

  it('returns FCM when selected', () => {
    expect(createPushProvider('fcm', 'production', dev, fcm)).toBe(fcm);
    expect(createPushProvider('fcm', 'development', dev, fcm)).toBe(fcm);
  });

  it('refuses to boot production on the dev logger', () => {
    // The dev provider only writes a log line. Shipping it would drop every offline notification
    // silently — nobody finds out until users complain about missed messages.
    expect(() => createPushProvider('dev', 'production', dev, fcm)).toThrow(
      expect.objectContaining({ code: ERROR_CODE.INTERNAL_ERROR }),
    );
  });
});
