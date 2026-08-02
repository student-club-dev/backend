import { ConfigService } from '@nestjs/config';
import { decodeJwt, decodeProtectedHeader, exportPKCS8, generateKeyPair } from 'jose';
import type { Env } from '../../config/env';
import { Http2ApnsTransport } from './apns-transport';

/** Reaches the token cache the way the FCM spec reaches `authorize` — no socket is involved. */
interface TransportInternals {
  authorization(): Promise<string>;
  cachedToken: { jwt: string; signedAt: number } | null;
}

function internals(transport: Http2ApnsTransport): TransportInternals {
  return transport as unknown as TransportInternals;
}

async function makeTransport(): Promise<Http2ApnsTransport> {
  // A real ES256 key: the signing path is the thing under test, so a fake string would prove nothing.
  const { privateKey } = await generateKeyPair('ES256');
  const values: Record<string, string> = {
    APNS_KEY_P8: await exportPKCS8(privateKey),
    APNS_KEY_ID: 'ABC123DEFG',
    APNS_TEAM_ID: 'A1B2C3D4E5',
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
  return new Http2ApnsTransport(config);
}

/** Pretends the cached token was signed `minutes` ago. */
function age(transport: Http2ApnsTransport, minutes: number): void {
  const cached = internals(transport).cachedToken;
  if (cached !== null) {
    cached.signedAt = Date.now() - minutes * 60 * 1000;
  }
}

describe('Http2ApnsTransport — the provider token', () => {
  it('signs a JWT Apple accepts: ES256 + kid in the header, team as issuer', async () => {
    const transport = await makeTransport();

    const jwt = await internals(transport).authorization();

    expect(decodeProtectedHeader(jwt)).toMatchObject({ alg: 'ES256', kid: 'ABC123DEFG' });
    const payload = decodeJwt(jwt);
    expect(payload.iss).toBe('A1B2C3D4E5');
    expect(payload.iat).toBeGreaterThan(0);
  });

  // The single most common way to get APNs wrong: a fresh token per notification earns
  // `429 TooManyProviderTokenUpdates` and stops delivery for everyone.
  it('reuses the same token across requests instead of signing one each time', async () => {
    const transport = await makeTransport();

    const [first, second, third] = await Promise.all([
      internals(transport).authorization(),
      internals(transport).authorization(),
      internals(transport).authorization(),
    ]);

    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('re-signs on its own once the token approaches Apple’s one-hour limit', async () => {
    const transport = await makeTransport();
    const first = await internals(transport).authorization();

    age(transport, 55);

    expect(await internals(transport).authorization()).not.toBe(first);
  });

  describe('a forced expiry after 403 ExpiredProviderToken', () => {
    // Apple refuses an update inside 20 minutes; obeying the 403 blindly would trade one device's
    // failure for a 429 that blocks every device.
    it('keeps a token that is still inside Apple’s 20-minute re-sign floor', async () => {
      const transport = await makeTransport();
      const first = await internals(transport).authorization();

      transport.expireToken();

      expect(await internals(transport).authorization()).toBe(first);
    });

    it('re-signs once the floor has passed', async () => {
      const transport = await makeTransport();
      const first = await internals(transport).authorization();

      age(transport, 25);
      transport.expireToken();

      expect(await internals(transport).authorization()).not.toBe(first);
    });
  });

  it('shuts down cleanly when no session was ever opened', async () => {
    const transport = await makeTransport();
    expect(() => transport.onModuleDestroy()).not.toThrow();
  });
});
