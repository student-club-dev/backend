import type { ApnsPushProvider } from '../../../infrastructure/push/apns-push.provider';
import { voipMessage } from '../../../infrastructure/push/apns-push.provider';
import type { FcmPushProvider } from '../../../infrastructure/push/fcm-push.provider';
import { emptyPushOutcome } from '../../../infrastructure/push/push-provider';
import type { CallDeviceDirectoryRepository } from '../domain/call-device.repository';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallPushService } from './call-push.service';

const RING = {
  calleeId: 'std_callee',
  callId: 'cal_1',
  conversationId: 'cnv_1',
  callerId: 'std_caller',
  callerName: 'Aziz Karimov',
  callerAvatarUrl: 'https://cdn/a.webp',
  media: CallMedia.VIDEO,
  expiresAt: '2026-08-05T09:15:07.000Z',
};

describe('CallPushService', () => {
  let devices: jest.Mocked<CallDeviceDirectoryRepository>;
  let apns: { sendVoip: jest.Mock };
  let fcm: { sendCallData: jest.Mock };
  let service: CallPushService;

  beforeEach(() => {
    devices = {
      voipTokensFor: jest
        .fn()
        .mockResolvedValue([{ id: 'd1', token: 'a'.repeat(64), apnsEnv: null }]),
      androidTokensFor: jest
        .fn()
        .mockResolvedValue([{ id: 'd2', token: 'fcm-tok', apnsEnv: null }]),
      removeDead: jest.fn().mockResolvedValue(undefined),
    };
    apns = { sendVoip: jest.fn().mockResolvedValue(emptyPushOutcome()) };
    fcm = { sendCallData: jest.fn().mockResolvedValue(emptyPushOutcome()) };
    service = new CallPushService(
      devices,
      apns as unknown as ApnsPushProvider,
      fcm as unknown as FcmPushProvider,
    );
  });

  describe('ring', () => {
    it('reaches both channels', async () => {
      await service.ring(RING);

      expect(apns.sendVoip).toHaveBeenCalledTimes(1);
      expect(fcm.sendCallData).toHaveBeenCalledTimes(1);
    });

    it('carries everything the ringing screen needs (§7.4)', async () => {
      await service.ring(RING);

      expect(apns.sendVoip.mock.calls[0][1]).toEqual({
        type: 'call',
        callId: 'cal_1',
        conversationId: 'cnv_1',
        callerId: 'std_caller',
        callerName: 'Aziz Karimov',
        callerAvatarUrl: 'https://cdn/a.webp',
        media: 'VIDEO',
        expiresAt: '2026-08-05T09:15:07.000Z',
      });
    });

    /**
     * `callId` is what lets the client ignore the second arrival when both the socket event and the
     * push land — which is the whole reason the push may be sent to an online user (§7.6).
     */
    it('always carries callId', async () => {
      await service.ring(RING);
      expect(apns.sendVoip.mock.calls[0][1].callId).toBe('cal_1');
      expect(fcm.sendCallData.mock.calls[0][1].callId).toBe('cal_1');
    });

    it('omits an absent avatar rather than sending null — FCM rejects a non-string value', async () => {
      await service.ring({ ...RING, callerAvatarUrl: null });

      expect(fcm.sendCallData.mock.calls[0][1]).not.toHaveProperty('callerAvatarUrl');
    });

    it('sends every data value as a string', async () => {
      await service.ring(RING);

      for (const value of Object.values(fcm.sendCallData.mock.calls[0][1])) {
        expect(typeof value).toBe('string');
      }
    });

    /** §7.7 — a phone that regains signal after the call must not start ringing for it. */
    it('gives Android a TTL no longer than the ring timeout', async () => {
      await service.ring(RING);

      expect(fcm.sendCallData.mock.calls[0][2]).toBeLessThanOrEqual(45);
    });

    it('touches neither provider when the callee has no devices', async () => {
      devices.voipTokensFor.mockResolvedValue([]);
      devices.androidTokensFor.mockResolvedValue([]);

      await service.ring(RING);

      expect(apns.sendVoip).not.toHaveBeenCalled();
      expect(fcm.sendCallData).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('sends call_cancel on the same two channels (§7.7)', async () => {
      await service.cancel('std_callee', 'cal_1');

      expect(apns.sendVoip.mock.calls[0][1]).toEqual({ type: 'call_cancel', callId: 'cal_1' });
      expect(fcm.sendCallData.mock.calls[0][1]).toEqual({ type: 'call_cancel', callId: 'cal_1' });
    });
  });

  describe('robustness', () => {
    it('never throws when a provider fails — a call must not fail because a push did', async () => {
      apns.sendVoip.mockRejectedValue(new Error('APNs down'));

      await expect(service.ring(RING)).resolves.toBeUndefined();
    });

    it('never throws when the device lookup fails', async () => {
      devices.voipTokensFor.mockRejectedValue(new Error('db down'));

      await expect(service.ring(RING)).resolves.toBeUndefined();
    });

    it('prunes tokens a provider reported dead', async () => {
      apns.sendVoip.mockResolvedValue({ dead: ['gone'], delivered: [] });

      await service.ring(RING);

      expect(devices.removeDead).toHaveBeenCalledWith(['gone']);
    });

    it('still delivers on the other channel when one is down', async () => {
      apns.sendVoip.mockRejectedValue(new Error('APNs down'));

      await service.ring(RING);

      expect(fcm.sendCallData).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * The four headers in §7.4. Three of them are the difference between arriving and not, so they are
 * asserted individually rather than as one object — a future edit that drops one should name it.
 */
describe('voipMessage headers (§7.4)', () => {
  const headers = voipMessage({ type: 'call', callId: 'cal_1' }).headers('uz.studentclub.ios', 0);

  it('marks the push as VoIP — iOS 13+ rejects it outright without this', () => {
    expect(headers['apns-push-type']).toBe('voip');
  });

  it('addresses the .voip topic, not the plain bundle id', () => {
    expect(headers['apns-topic']).toBe('uz.studentclub.ios.voip');
  });

  it('sends at priority 10 — immediately', () => {
    expect(headers['apns-priority']).toBe('10');
  });

  /** Deliver now or discard: a queued call push rings for a call that ended ten minutes ago. */
  it('expires immediately rather than being held in Apple’s queue', () => {
    expect(headers['apns-expiration']).toBe('0');
  });

  it('carries no aps alert — the app draws the call itself through CallKit', () => {
    const body = JSON.parse(voipMessage({ type: 'call', callId: 'cal_1' }).body) as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty('aps');
    expect(body.callId).toBe('cal_1');
  });
});
