import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import {
  ApnsPushProvider,
  buildApnsHeaders,
  buildApnsPayload,
  classifyApnsResponse,
} from './apns-push.provider';
import type { ApnsRequest, ApnsResponse, ApnsTransport } from './apns-transport';
import { PushNotification, PushTarget } from './push-provider';

const NOTIFICATION: PushNotification = {
  title: 'Kumush',
  body: 'Salom, bugun uchrashamizmi?',
  data: { conversationId: 'cnv_1', messageType: 'TEXT' },
  badge: 3,
};

const TOKEN = 'a'.repeat(64);

function iphone(overrides: Partial<PushTarget> = {}): PushTarget {
  return { id: 'dev_1', token: TOKEN, platform: 'IOS', apnsEnv: null, ...overrides };
}

function ok(): ApnsResponse {
  return { status: 200, reason: null };
}

function fail(status: number, reason: string | null = null): ApnsResponse {
  return { status, reason };
}

/** Answers each call from a scripted list; the last entry repeats once the list runs out. */
class FakeTransport implements ApnsTransport {
  readonly requests: ApnsRequest[] = [];
  expiredCount = 0;

  constructor(private readonly answers: (ApnsResponse | Error)[]) {}

  async post(request: ApnsRequest): Promise<ApnsResponse> {
    this.requests.push(request);
    const answer = this.answers[Math.min(this.requests.length - 1, this.answers.length - 1)];
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  }

  expireToken(): void {
    this.expiredCount += 1;
  }
}

function makeConfig(overrides: Partial<Record<string, string>> = {}): ConfigService<Env, true> {
  const values: Record<string, string | undefined> = {
    APNS_KEY_P8: '-----BEGIN PRIVATE KEY-----\\nAAA\\n-----END PRIVATE KEY-----\\n',
    APNS_KEY_ID: 'ABC123DEFG',
    APNS_TEAM_ID: 'A1B2C3D4E5',
    APNS_TOPIC: 'uz.studentclub.ios',
    APNS_ENV: 'production',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
}

function makeProvider(transport: ApnsTransport, config = makeConfig()): ApnsPushProvider {
  return new ApnsPushProvider(config, transport);
}

describe('ApnsPushProvider', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('sends nothing for an empty target list', async () => {
    const transport = new FakeTransport([ok()]);
    await expect(makeProvider(transport).send([], NOTIFICATION)).resolves.toEqual({
      dead: [],
      delivered: [],
    });
    expect(transport.requests).toHaveLength(0);
  });

  it('reports a delivery with the environment that accepted it', async () => {
    const transport = new FakeTransport([ok()]);

    await expect(makeProvider(transport).send([iphone()], NOTIFICATION)).resolves.toEqual({
      dead: [],
      delivered: [{ token: TOKEN, apnsEnv: 'PRODUCTION' }],
    });
  });

  it('addresses the host already recorded on the device instead of the configured default', async () => {
    const transport = new FakeTransport([ok()]);

    await makeProvider(transport).send([iphone({ apnsEnv: 'SANDBOX' })], NOTIFICATION);

    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0].env).toBe('SANDBOX');
  });

  it('sends the headers Apple requires, and no collapse id', async () => {
    const transport = new FakeTransport([ok()]);

    await makeProvider(transport).send([iphone()], NOTIFICATION);

    const { headers, deviceToken } = transport.requests[0];
    expect(deviceToken).toBe(TOKEN);
    expect(headers['apns-topic']).toBe('uz.studentclub.ios');
    expect(headers['apns-push-type']).toBe('alert');
    expect(headers['apns-priority']).toBe('10');
    expect(Number(headers['apns-expiration'])).toBeGreaterThan(Date.now() / 1000);
    // A collapse id would replace the previous notification of the same conversation; a chat is
    // expected to show every message (§3.2).
    expect(headers['apns-collapse-id']).toBeUndefined();
  });

  // Registration rejects these now, but rows stored before that check can hold anything — and the
  // token is interpolated into the request path, so it is never handed to Apple unverified.
  it('discards a stored token that is not an APNs token without contacting Apple', async () => {
    const transport = new FakeTransport([ok()]);
    const junk = 'fMEP0v9tS...:APA91bF_an_fcm_token';

    await expect(
      makeProvider(transport).send([iphone({ token: junk })], NOTIFICATION),
    ).resolves.toEqual({ dead: [junk], delivered: [] });
    expect(transport.requests).toHaveLength(0);
  });

  it('still delivers to the valid devices in a batch containing a malformed one', async () => {
    const transport = new FakeTransport([ok()]);

    const outcome = await makeProvider(transport).send(
      [iphone({ id: 'dev_junk', token: 'nonsense' }), iphone()],
      NOTIFICATION,
    );

    expect(outcome.dead).toEqual(['nonsense']);
    expect(outcome.delivered).toEqual([{ token: TOKEN, apnsEnv: 'PRODUCTION' }]);
  });

  describe('when the app was deleted from the device', () => {
    it('reports the token as dead on 410 Unregistered', async () => {
      const transport = new FakeTransport([fail(410, 'Unregistered')]);

      await expect(makeProvider(transport).send([iphone()], NOTIFICATION)).resolves.toEqual({
        dead: [TOKEN],
        delivered: [],
      });
      expect(transport.requests).toHaveLength(1);
    });
  });

  describe('environment probing', () => {
    // The rows that already exist were never delivered to, so nobody knows which host issued them.
    it('retries the other host once when the token is not from this environment', async () => {
      const transport = new FakeTransport([fail(400, 'BadDeviceToken'), ok()]);

      await expect(makeProvider(transport).send([iphone()], NOTIFICATION)).resolves.toEqual({
        dead: [],
        delivered: [{ token: TOKEN, apnsEnv: 'SANDBOX' }],
      });
      expect(transport.requests.map((request) => request.env)).toEqual(['PRODUCTION', 'SANDBOX']);
    });

    it('deletes the token only after BOTH hosts reject it', async () => {
      const transport = new FakeTransport([fail(400, 'BadDeviceToken')]);

      await expect(makeProvider(transport).send([iphone()], NOTIFICATION)).resolves.toEqual({
        dead: [TOKEN],
        delivered: [],
      });
      expect(transport.requests).toHaveLength(2);
    });

    // The most expensive mistake available here: losing a live device to Apple having a bad minute.
    it('keeps the token when the second host answers with an outage instead of a rejection', async () => {
      const transport = new FakeTransport([fail(400, 'BadDeviceToken'), fail(503)]);

      await expect(makeProvider(transport).send([iphone()], NOTIFICATION)).resolves.toEqual({
        dead: [],
        delivered: [],
      });
    });
  });

  describe('configuration failures', () => {
    it('keeps the token and logs loudly on BadTopic', async () => {
      const transport = new FakeTransport([fail(400, 'BadTopic')]);

      await expect(makeProvider(transport).send([iphone()], NOTIFICATION)).resolves.toEqual({
        dead: [],
        delivered: [],
      });
      expect(errorSpy).toHaveBeenCalled();
      expect(String(errorSpy.mock.calls[0][0])).toContain('APNS_TOPIC');
    });

    it('keeps the token and logs loudly on InvalidProviderToken', async () => {
      const transport = new FakeTransport([fail(403, 'InvalidProviderToken')]);

      await expect(makeProvider(transport).send([iphone()], NOTIFICATION)).resolves.toEqual({
        dead: [],
        delivered: [],
      });
      expect(errorSpy).toHaveBeenCalled();
    });

    it('drops the send with an ERROR when APNs is not configured at all', async () => {
      const transport = new FakeTransport([ok()]);
      const provider = makeProvider(transport, makeConfig({ APNS_KEY_P8: undefined }));

      await expect(provider.send([iphone()], NOTIFICATION)).resolves.toEqual({
        dead: [],
        delivered: [],
      });
      expect(transport.requests).toHaveLength(0);
      expect(String(errorSpy.mock.calls[0][0])).toContain('APNs is not configured');
    });
  });

  describe('retries', () => {
    it('re-signs the provider token and repeats on ExpiredProviderToken', async () => {
      const transport = new FakeTransport([fail(403, 'ExpiredProviderToken'), ok()]);

      await expect(makeProvider(transport).send([iphone()], NOTIFICATION)).resolves.toEqual({
        dead: [],
        delivered: [{ token: TOKEN, apnsEnv: 'PRODUCTION' }],
      });
      expect(transport.expiredCount).toBe(1);
      expect(transport.requests).toHaveLength(2);
    });

    it('backs off and repeats while Apple throttles, then delivers', async () => {
      const transport = new FakeTransport([fail(429, 'TooManyRequests'), ok()]);

      await expect(makeProvider(transport).send([iphone()], NOTIFICATION)).resolves.toEqual({
        dead: [],
        delivered: [{ token: TOKEN, apnsEnv: 'PRODUCTION' }],
      });
    });

    it('gives up after three attempts on a persistent outage, keeping the token', async () => {
      const transport = new FakeTransport([fail(500)]);

      await expect(makeProvider(transport).send([iphone()], NOTIFICATION)).resolves.toEqual({
        dead: [],
        delivered: [],
      });
      expect(transport.requests).toHaveLength(3);
    });

    it('keeps the token when the connection itself fails', async () => {
      const transport = new FakeTransport([new Error('ECONNRESET')]);

      await expect(makeProvider(transport).send([iphone()], NOTIFICATION)).resolves.toEqual({
        dead: [],
        delivered: [],
      });
    });
  });

  it('separates dead devices from live ones in a mixed batch', async () => {
    const live = 'a'.repeat(64);
    const gone = 'b'.repeat(64);
    // One request each: the first device is delivered to, the second no longer has the app.
    const answers = new Map<string, ApnsResponse>([
      [live, ok()],
      [gone, fail(410, 'Unregistered')],
    ]);
    const transport: ApnsTransport = {
      post: async (request) => answers.get(request.deviceToken) ?? fail(500),
      expireToken: () => undefined,
    };

    const outcome = await makeProvider(transport).send(
      [iphone({ id: 'dev_live', token: live }), iphone({ id: 'dev_gone', token: gone })],
      NOTIFICATION,
    );

    expect(outcome.dead).toEqual([gone]);
    expect(outcome.delivered).toEqual([{ token: live, apnsEnv: 'PRODUCTION' }]);
  });

  it('never logs the device token, only the row id', async () => {
    const transport = new FakeTransport([ok()]);

    await makeProvider(transport).send([iphone()], NOTIFICATION);

    const lines = [...logSpy.mock.calls, ...warnSpy.mock.calls].map((call) => String(call[0]));
    expect(lines.join('\n')).toContain('deviceId=dev_1');
    for (const line of lines) {
      expect(line).not.toContain(TOKEN);
    }
  });
});

describe('buildApnsPayload', () => {
  it('puts custom fields at the root, next to aps — APNs has no data section', () => {
    const payload = buildApnsPayload(NOTIFICATION);

    expect(payload.conversationId).toBe('cnv_1');
    expect(payload.messageType).toBe('TEXT');
    expect((payload.aps as Record<string, unknown>).conversationId).toBeUndefined();
  });

  it('carries the alert, sound, badge and the thread that groups a conversation', () => {
    const aps = buildApnsPayload(NOTIFICATION).aps as Record<string, unknown>;

    expect(aps.alert).toEqual({ title: 'Kumush', body: 'Salom, bugun uchrashamizmi?' });
    expect(aps.sound).toBe('default');
    expect(aps.badge).toBe(3);
    expect(aps['thread-id']).toBe('cnv_1');
    expect(aps['mutable-content']).toBe(1);
  });

  it('omits the badge when the caller has no count to send', () => {
    const aps = buildApnsPayload({ title: 't', body: 'b' }).aps as Record<string, unknown>;
    expect('badge' in aps).toBe(false);
  });

  it('sends badge 0 rather than dropping it — that is what clears the app icon', () => {
    const aps = buildApnsPayload({ title: 't', body: 'b', badge: 0 }).aps as Record<
      string,
      unknown
    >;
    expect(aps.badge).toBe(0);
  });

  it('never lets a custom field overwrite the aps section', () => {
    const payload = buildApnsPayload({ title: 't', body: 'b', data: { aps: 'hijacked' } });
    expect(typeof payload.aps).toBe('object');
  });
});

describe('buildApnsHeaders', () => {
  it('expires a notification a day out, in unix seconds', () => {
    const now = 1_800_000_000_000;
    expect(buildApnsHeaders('uz.studentclub.ios', now)['apns-expiration']).toBe(
      String(now / 1000 + 24 * 60 * 60),
    );
  });
});

describe('classifyApnsResponse', () => {
  it.each([
    [200, null, 'DELIVERED'],
    [410, 'Unregistered', 'DEAD'],
    [400, 'BadDeviceToken', 'WRONG_ENV'],
    [400, 'BadTopic', 'CONFIG_ERROR'],
    [400, 'PayloadTooLarge', 'CONFIG_ERROR'],
    [403, 'ExpiredProviderToken', 'EXPIRED_TOKEN'],
    [403, 'InvalidProviderToken', 'CONFIG_ERROR'],
    [429, 'TooManyRequests', 'RETRY'],
    [429, 'TooManyProviderTokenUpdates', 'RETRY'],
    [500, null, 'RETRY'],
    [503, null, 'RETRY'],
    [404, 'BadPath', 'KEPT'],
  ])('maps %i %s to %s', (status, reason, verdict) => {
    expect(classifyApnsResponse(status, reason)).toBe(verdict);
  });
});
