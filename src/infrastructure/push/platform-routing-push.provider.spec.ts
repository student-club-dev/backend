import { Logger } from '@nestjs/common';
import type { ApnsPushProvider } from './apns-push.provider';
import type { FcmPushProvider } from './fcm-push.provider';
import { PlatformRoutingPushProvider } from './platform-routing-push.provider';
import { PushOutcome, PushProvider, PushTarget } from './push-provider';

const NOTIFICATION = { title: 'Yangi xabar', body: 'salom' };

function device(id: string, platform: PushTarget['platform']): PushTarget {
  return { id, token: `tok_${id}`, platform, apnsEnv: null };
}

function stub(outcome: Partial<PushOutcome> = {}): PushProvider {
  return { send: jest.fn().mockResolvedValue({ dead: [], delivered: [], ...outcome }) };
}

function makeRouter(fcm: PushProvider, apns: PushProvider): PlatformRoutingPushProvider {
  return new PlatformRoutingPushProvider(fcm as FcmPushProvider, apns as ApnsPushProvider);
}

describe('PlatformRoutingPushProvider', () => {
  // The bug this whole change exists for: an iPhone's APNs token used to be handed to FCM, which
  // accepted the request and delivered nothing.
  it('sends iOS devices to APNs and everything else to FCM', async () => {
    const fcm = stub();
    const apns = stub();
    const targets = [
      device('a', 'ANDROID'),
      device('i', 'IOS'),
      device('w', 'WEB'),
      device('i2', 'IOS'),
    ];

    await makeRouter(fcm, apns).send(targets, NOTIFICATION);

    expect(apns.send).toHaveBeenCalledWith([device('i', 'IOS'), device('i2', 'IOS')], NOTIFICATION);
    expect(fcm.send).toHaveBeenCalledWith(
      [device('a', 'ANDROID'), device('w', 'WEB')],
      NOTIFICATION,
    );
  });

  it('does not call a provider that has no devices to deliver to', async () => {
    const fcm = stub();
    const apns = stub();

    await makeRouter(fcm, apns).send([device('a', 'ANDROID')], NOTIFICATION);

    expect(fcm.send).toHaveBeenCalled();
    expect(apns.send).not.toHaveBeenCalled();
  });

  it('merges what both providers established', async () => {
    const fcm = stub({ dead: ['tok_a'], delivered: [{ token: 'tok_a2', apnsEnv: null }] });
    const apns = stub({ dead: ['tok_i'], delivered: [{ token: 'tok_i2', apnsEnv: 'SANDBOX' }] });

    const outcome = await makeRouter(fcm, apns).send(
      [device('a', 'ANDROID'), device('i', 'IOS')],
      NOTIFICATION,
    );

    expect(outcome.dead.sort()).toEqual(['tok_a', 'tok_i']);
    expect(outcome.delivered).toEqual(
      expect.arrayContaining([
        { token: 'tok_a2', apnsEnv: null },
        { token: 'tok_i2', apnsEnv: 'SANDBOX' },
      ]),
    );
  });

  it('still honours one platform when the other throws', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const fcm = stub({ delivered: [{ token: 'tok_a', apnsEnv: null }] });
    const apns: PushProvider = { send: jest.fn().mockRejectedValue(new Error('apns exploded')) };

    const outcome = await makeRouter(fcm, apns).send(
      [device('a', 'ANDROID'), device('i', 'IOS')],
      NOTIFICATION,
    );

    expect(outcome.delivered).toEqual([{ token: 'tok_a', apnsEnv: null }]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
