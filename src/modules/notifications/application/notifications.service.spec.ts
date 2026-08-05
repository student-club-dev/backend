import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { PushOutcome, PushProvider } from '../../../infrastructure/push/push-provider';
import { DeviceTarget, DeviceTokenRepository } from '../domain/device-token.repository';
import { DeviceTokenType } from '../domain/enums/device-token-type.enum';
import { DevicePlatform } from '../domain/enums/device-platform.enum';
import { NotificationsService } from './notifications.service';

const student: AuthenticatedUser = { id: 'stu-1', type: AccountType.STUDENT };
/** A well-formed APNs token: 32 bytes, hex-encoded. */
const APNS_TOKEN = 'a'.repeat(64);

function target(token: string, platform = DevicePlatform.ANDROID): DeviceTarget {
  return {
    id: `dev_${token}`,
    token,
    platform,
    tokenType: platform === DevicePlatform.IOS ? DeviceTokenType.APNS : DeviceTokenType.FCM,
    apnsEnv: null,
  };
}

function makeDevices(overrides: Partial<DeviceTokenRepository> = {}): DeviceTokenRepository {
  return {
    upsert: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    targetsFor: jest.fn().mockResolvedValue([]),
    callTargetsFor: jest.fn().mockResolvedValue([]),
    markDelivered: jest.fn().mockResolvedValue(undefined),
    removeMany: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makePush(outcome: Partial<PushOutcome> = {}): PushProvider {
  return {
    send: jest.fn().mockResolvedValue({ dead: [], delivered: [], ...outcome }),
  };
}

function makeService(
  devices: DeviceTokenRepository = makeDevices(),
  push: PushProvider = makePush(),
): NotificationsService {
  return new NotificationsService(devices, push);
}

describe('NotificationsService', () => {
  it('registers a device token', async () => {
    const devices = makeDevices();
    await makeService(devices).registerDevice(student, 'tok-1', DevicePlatform.ANDROID);
    expect(devices.upsert).toHaveBeenCalledWith(
      'stu-1',
      'tok-1',
      DevicePlatform.ANDROID,
      DeviceTokenType.FCM,
    );
  });

  it('accepts an APNs-shaped token for iOS', async () => {
    const devices = makeDevices();
    await makeService(devices).registerDevice(student, APNS_TOKEN, DevicePlatform.IOS);
    // ⚠️ APNS, not FCM. The spec's default table says iOS → FCM, but this backend delivers to
    // Apple directly — labelling an iPhone FCM would hand its token to a service that cannot
    // address it, which is the exact bug the APNs work fixed.
    expect(devices.upsert).toHaveBeenCalledWith(
      'stu-1',
      APNS_TOKEN,
      DevicePlatform.IOS,
      DeviceTokenType.APNS,
    );
  });

  // An iOS build that still registers an FCM token is precisely the failure that made iPhones
  // silent: FCM accepted the send and dropped it. Rejecting it here makes that visible at once.
  it.each([
    ['an FCM registration token', 'fMEP0v9tS...:APA91bF_long_fcm_token'],
    ['uppercase hex', 'A'.repeat(64)],
    ['too short', 'a'.repeat(63)],
    ['too long', 'a'.repeat(65)],
  ])('rejects %s for iOS with INVALID_DEVICE_TOKEN', async (_label, token) => {
    const devices = makeDevices();
    const call = (): Promise<void> =>
      makeService(devices).registerDevice(student, token, DevicePlatform.IOS);

    await expect(call()).rejects.toBeInstanceOf(AppException);
    await expect(call()).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_DEVICE_TOKEN,
      status: 422,
    });
    expect(devices.upsert).not.toHaveBeenCalled();
  });

  it('does not impose the APNs format on Android', async () => {
    const devices = makeDevices();
    await makeService(devices).registerDevice(student, 'not-hex-at-all', DevicePlatform.ANDROID);
    expect(devices.upsert).toHaveBeenCalled();
  });

  it('removes a device token', async () => {
    const devices = makeDevices();
    await makeService(devices).removeDevice(student, 'tok-1');
    expect(devices.remove).toHaveBeenCalledWith('stu-1', 'tok-1');
  });

  it('pushes to every device with the platform it needs to be routed by', async () => {
    const devices = makeDevices({
      targetsFor: jest
        .fn()
        .mockResolvedValue([target('a'), target(APNS_TOKEN, DevicePlatform.IOS)]),
    });
    const push = makePush();

    await makeService(devices, push).pushToStudent('stu-1', { title: 'Hi', body: 'there' });

    expect(push.send).toHaveBeenCalledWith([target('a'), target(APNS_TOKEN, DevicePlatform.IOS)], {
      title: 'Hi',
      body: 'there',
    });
  });

  it('does not call the provider when the student has no devices', async () => {
    const push = makePush();
    await makeService(makeDevices(), push).pushToStudent('stu-1', { title: 'Hi', body: 'there' });
    expect(push.send).not.toHaveBeenCalled();
  });

  // Without this every account that ever reinstalled the app keeps a dead token forever, and each
  // later send pays to retry it.
  it('deletes the tokens the provider reports as dead', async () => {
    const devices = makeDevices({
      targetsFor: jest.fn().mockResolvedValue([target('live'), target('dead')]),
    });
    const push = makePush({ dead: ['dead'], delivered: [{ token: 'live', apnsEnv: null }] });

    await makeService(devices, push).pushToStudent('stu-1', { title: 'Hi', body: 'there' });

    expect(devices.removeMany).toHaveBeenCalledWith(['dead']);
  });

  // The environment is learned, not configured: it is what makes the second send skip the probe.
  it('records the delivered tokens with the environment that accepted them', async () => {
    const devices = makeDevices({
      targetsFor: jest.fn().mockResolvedValue([target(APNS_TOKEN, DevicePlatform.IOS)]),
    });
    const push = makePush({ delivered: [{ token: APNS_TOKEN, apnsEnv: 'SANDBOX' }] });

    await makeService(devices, push).pushToStudent('stu-1', { title: 'Hi', body: 'x' });

    expect(devices.markDelivered).toHaveBeenCalledWith([{ token: APNS_TOKEN, apnsEnv: 'SANDBOX' }]);
  });

  it('leaves the store alone when nothing was delivered and nothing died', async () => {
    const devices = makeDevices({ targetsFor: jest.fn().mockResolvedValue([target('a')]) });

    await makeService(devices, makePush()).pushToStudent('stu-1', { title: 'Hi', body: 'x' });

    expect(devices.removeMany).not.toHaveBeenCalled();
    expect(devices.markDelivered).not.toHaveBeenCalled();
  });
});
