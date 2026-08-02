import { Logger } from '@nestjs/common';
import { PushProvider } from './push-provider';
import { createPushProvider } from './push-provider.factory';

const dev = { send: jest.fn() } as unknown as PushProvider;
const live = { send: jest.fn() } as unknown as PushProvider;

describe('createPushProvider', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns the dev logger outside production, quietly', () => {
    expect(createPushProvider('dev', 'development', true, dev, live)).toBe(dev);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns the platform-routed providers when selected', () => {
    expect(createPushProvider('fcm', 'production', true, dev, live)).toBe(live);
    expect(createPushProvider('fcm', 'development', true, dev, live)).toBe(live);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('still boots on the dev logger in production, but says so loudly', () => {
    // Deliberately not a hard failure: push is being rolled out after the service went live, so
    // blocking a deploy on credentials that are not ready yet would cost more than it protects.
    // The ERROR line is the trade — a dropped notification is otherwise invisible.
    expect(createPushProvider('dev', 'production', true, dev, live)).toBe(dev);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = String(errorSpy.mock.calls[0][0]);
    expect(message).toContain('NO push notification will reach any device');
    expect(message).toContain('PUSH_PROVIDER=fcm');
  });

  it('warns loudly when the real providers are on but APNs is unconfigured', () => {
    // This is the exact shape of the bug the routing replaced: Android keeps working, iPhones get
    // nothing, and without this line the deployment looks perfectly healthy.
    expect(createPushProvider('fcm', 'production', false, dev, live)).toBe(live);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = String(errorSpy.mock.calls[0][0]);
    expect(message).toContain('every iPhone will be skipped silently');
    expect(message).toContain('APNS_KEY_P8');
  });
});
