import { ConfigService } from '@nestjs/config';
import { FcmPushProvider } from './fcm-push.provider';
import { PushOutcome, PushTarget } from './push-provider';

const NOTIFICATION = { title: 'Yangi xabar', body: 'salom', data: { conversationId: 'cnv_1' } };

/** An Android device row, the only kind this provider is routed. */
function android(token: string): PushTarget {
  return { id: `dev_${token}`, token, platform: 'ANDROID', apnsEnv: null };
}

/** The delivered half of an outcome, for the tokens expected to have arrived. */
function delivered(...tokens: string[]): PushOutcome['delivered'] {
  return tokens.map((token) => ({ token, apnsEnv: null }));
}

function makeProvider(): FcmPushProvider {
  const config = {
    get: (key: string) =>
      ({
        FCM_PROJECT_ID: 'studentclub',
        FCM_CLIENT_EMAIL: 'push@studentclub.iam.gserviceaccount.com',
        FCM_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nAAA\\n-----END PRIVATE KEY-----\\n',
      })[key],
  } as unknown as ConfigService<never, true>;
  const provider = new FcmPushProvider(config);
  // Stub the OAuth exchange — the unit under test is the send path, not Google's token minting.
  (provider as unknown as { authorize: () => Promise<string> }).authorize = async () => 'oauth-tok';
  return provider;
}

/** A per-token FCM error, shaped the way the v1 API returns it. */
function fcmError(errorCode: string, status = 404): unknown {
  return {
    ok: false,
    status,
    json: async () => ({
      error: {
        status: 'NOT_FOUND',
        details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }],
      },
    }),
  };
}

const ACCEPTED = { ok: true, status: 200, json: async () => ({ name: 'projects/x/messages/1' }) };

describe('FcmPushProvider', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('sends nothing and reports nothing for an empty token list', async () => {
    global.fetch = jest.fn();
    await expect(makeProvider().send([], NOTIFICATION)).resolves.toEqual({
      dead: [],
      delivered: [],
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends one request per token', async () => {
    global.fetch = jest.fn().mockResolvedValue(ACCEPTED);
    await expect(
      makeProvider().send([android('a'), android('b'), android('c')], NOTIFICATION),
    ).resolves.toEqual({ dead: [], delivered: delivered('a', 'b', 'c') });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('builds a message FCM accepts: string data, high priority, both platforms', async () => {
    const fetchMock = jest.fn().mockResolvedValue(ACCEPTED);
    global.fetch = fetchMock;

    await makeProvider().send([android('tok')], NOTIFICATION);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/studentclub/messages:send');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer oauth-tok');

    const { message } = JSON.parse(init.body as string) as { message: Record<string, never> };
    expect(message).toMatchObject({
      token: 'tok',
      notification: { title: 'Yangi xabar', body: 'salom' },
      data: { conversationId: 'cnv_1' },
      android: { priority: 'high' },
    });
    // Every data value must be a string — FCM rejects anything else.
    for (const value of Object.values(message.data as Record<string, unknown>)) {
      expect(typeof value).toBe('string');
    }
  });

  it.each(['UNREGISTERED', 'INVALID_ARGUMENT', 'SENDER_ID_MISMATCH'])(
    'reports a token back as dead on %s',
    async (errorCode) => {
      global.fetch = jest.fn().mockResolvedValue(fcmError(errorCode));
      await expect(makeProvider().send([android('dead-tok')], NOTIFICATION)).resolves.toEqual({
        dead: ['dead-tok'],
        delivered: [],
      });
    },
  );

  it('keeps a token when the failure is transient, not the token’s fault', async () => {
    // A 500 from Google says nothing about this device — deleting the token would lose a real user.
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    // Neither dead nor delivered: a 500 proves nothing, so `lastSuccessAt` must not move either.
    await expect(makeProvider().send([android('tok')], NOTIFICATION)).resolves.toEqual({
      dead: [],
      delivered: [],
    });
  });

  it('keeps a token when the network fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(makeProvider().send([android('tok')], NOTIFICATION)).resolves.toEqual({
      dead: [],
      delivered: [],
    });
  });

  it('separates the dead tokens from the live ones in a mixed batch', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(ACCEPTED)
      .mockResolvedValueOnce(fcmError('UNREGISTERED'))
      .mockResolvedValueOnce(ACCEPTED);

    await expect(
      makeProvider().send([android('live1'), android('dead'), android('live2')], NOTIFICATION),
    ).resolves.toEqual({ dead: ['dead'], delivered: delivered('live1', 'live2') });
  });

  it('never throws when authorisation fails — a push must not fail the message', async () => {
    const provider = makeProvider();
    (provider as unknown as { authorize: () => Promise<string> }).authorize = async () => {
      throw new Error('invalid_grant');
    };
    global.fetch = jest.fn();

    await expect(provider.send([android('tok')], NOTIFICATION)).resolves.toEqual({
      dead: [],
      delivered: [],
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
