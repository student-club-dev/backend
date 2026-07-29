import { AccountType } from '../../../common/enums/account-type.enum';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { PushProvider } from '../../../infrastructure/push/push-provider';
import { DeviceTokenRepository } from '../domain/device-token.repository';
import { DevicePlatform } from '../domain/enums/device-platform.enum';
import { NotificationsService } from './notifications.service';

const student: AuthenticatedUser = { id: 'stu-1', type: AccountType.STUDENT };

function makeDevices(overrides: Partial<DeviceTokenRepository> = {}): DeviceTokenRepository {
  return {
    upsert: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    tokensFor: jest.fn().mockResolvedValue([]),
    removeMany: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makePush(dead: string[] = []): PushProvider {
  return { send: jest.fn().mockResolvedValue(dead) };
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
    expect(devices.upsert).toHaveBeenCalledWith('stu-1', 'tok-1', DevicePlatform.ANDROID);
  });

  it('removes a device token', async () => {
    const devices = makeDevices();
    await makeService(devices).removeDevice(student, 'tok-1');
    expect(devices.remove).toHaveBeenCalledWith('stu-1', 'tok-1');
  });

  it('pushes to all of a student’s device tokens', async () => {
    const devices = makeDevices({ tokensFor: jest.fn().mockResolvedValue(['a', 'b']) });
    const push = makePush();
    await makeService(devices, push).pushToStudent('stu-1', { title: 'Hi', body: 'there' });
    expect(push.send).toHaveBeenCalledWith(['a', 'b'], { title: 'Hi', body: 'there' });
  });

  it('does not call the provider when the student has no tokens', async () => {
    const push = makePush();
    await makeService(makeDevices(), push).pushToStudent('stu-1', { title: 'Hi', body: 'there' });
    expect(push.send).not.toHaveBeenCalled();
  });

  // Without this every account that ever reinstalled the app keeps a dead token forever, and each
  // later send pays to retry it.
  it('deletes the tokens the provider reports as dead', async () => {
    const devices = makeDevices({ tokensFor: jest.fn().mockResolvedValue(['live', 'dead']) });
    const push = makePush(['dead']);

    await makeService(devices, push).pushToStudent('stu-1', { title: 'Hi', body: 'there' });

    expect(devices.removeMany).toHaveBeenCalledWith(['dead']);
  });

  it('leaves the store alone when every token was accepted', async () => {
    const devices = makeDevices({ tokensFor: jest.fn().mockResolvedValue(['a']) });

    await makeService(devices, makePush([])).pushToStudent('stu-1', { title: 'Hi', body: 'x' });

    expect(devices.removeMany).not.toHaveBeenCalled();
  });
});
