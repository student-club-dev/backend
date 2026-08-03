import { IceConfig, resolveIceServers, toIceUrl } from './ice-profile';

const NOW = 1_785_308_400_000; // 2026-07-28T00:20:00Z

const staticConfig: IceConfig = {
  provider: 'static',
  turnHost: 'turn.studentclub.uz',
  turnSecret: 's3cret',
  ttlSeconds: 3600,
};

const meteredConfig: IceConfig = {
  provider: 'metered',
  meteredUsername: 'metered_user',
  meteredCredential: 'metered_pass',
  ttlSeconds: 3600,
};

const urlsOf = (config: IceConfig): string[] =>
  (resolveIceServers(config, 'std_1', NOW) ?? []).flatMap((s) => s.urls);

describe('toIceUrl', () => {
  it('omits the transport parameter when none is set', () => {
    expect(toIceUrl({ scheme: 'turn', host: 'h', port: 80 })).toBe('turn:h:80');
  });

  it('appends the transport parameter when one is set', () => {
    expect(toIceUrl({ scheme: 'turns', host: 'h', port: 443, transport: 'tcp' })).toBe(
      'turns:h:443?transport=tcp',
    );
  });
});

describe('resolveIceServers — static (coturn)', () => {
  it('offers STUN plus UDP, TCP and TLS TURN', () => {
    const urls = urlsOf(staticConfig);
    expect(urls).toContain('stun:turn.studentclub.uz:3478');
    expect(urls).toContain('turn:turn.studentclub.uz:3478?transport=udp');
    expect(urls).toContain('turn:turn.studentclub.uz:3478?transport=tcp');
    // 443/TLS is not optional: students call from university Wi-Fi where only 443 is open, and
    // without it a share of calls never connect at all.
    expect(urls).toContain('turns:turn.studentclub.uz:443?transport=tcp');
  });

  // The HMAC scheme's whole point — one student's credential cannot spend another's coturn quota.
  it('mints a different credential per student', () => {
    const a = resolveIceServers(staticConfig, 'std_1', NOW);
    const b = resolveIceServers(staticConfig, 'std_2', NOW);
    expect(a?.[1].credential).not.toBe(b?.[1].credential);
  });

  it('is unavailable when the host or the secret is missing', () => {
    expect(resolveIceServers({ ...staticConfig, turnHost: undefined }, 'std_1', NOW)).toBeNull();
    expect(resolveIceServers({ ...staticConfig, turnSecret: undefined }, 'std_1', NOW)).toBeNull();
  });
});

describe('resolveIceServers — metered', () => {
  it('publishes Metered’s matrix: 80 and 443, UDP, TCP and TLS', () => {
    const urls = urlsOf(meteredConfig);
    expect(urls).toEqual([
      'stun:stun.relay.metered.ca:80',
      'turn:global.relay.metered.ca:80',
      'turn:global.relay.metered.ca:80?transport=tcp',
      'turn:global.relay.metered.ca:443',
      'turns:global.relay.metered.ca:443?transport=tcp',
    ]);
  });

  /**
   * ⚠️ The credential is passed through verbatim — Metered issues one long-lived username/password,
   * it is NOT derived from anything. Running it through `buildIceCredential` would produce an HMAC
   * their server has never heard of and every relayed call would fail authentication.
   */
  it('uses the configured credential unchanged, never an HMAC', () => {
    const servers = resolveIceServers(meteredConfig, 'std_1', NOW);
    expect(servers?.[1].username).toBe('metered_user');
    expect(servers?.[1].credential).toBe('metered_pass');
  });

  // Static credentials are shared, so two students get the same one — the security downgrade this
  // provider accepts, pinned here so it is a decision rather than a surprise.
  it('gives every student the same credential', () => {
    const a = resolveIceServers(meteredConfig, 'std_1', NOW);
    const b = resolveIceServers(meteredConfig, 'std_2', NOW);
    expect(a?.[1].credential).toBe(b?.[1].credential);
  });

  it('is unavailable when the username or the credential is missing', () => {
    expect(
      resolveIceServers({ ...meteredConfig, meteredUsername: undefined }, 'std_1', NOW),
    ).toBeNull();
    expect(
      resolveIceServers({ ...meteredConfig, meteredCredential: undefined }, 'std_1', NOW),
    ).toBeNull();
  });

  // Selecting `metered` must not silently fall back to coturn when coturn happens to be configured
  // too — a deployment would then relay through the wrong provider and the quota maths would be
  // measuring an account nobody is spending.
  it('does not fall back to coturn when both are configured', () => {
    const urls = urlsOf({
      ...meteredConfig,
      turnHost: 'turn.studentclub.uz',
      turnSecret: 's3cret',
    });
    expect(urls.every((u) => u.includes('metered.ca'))).toBe(true);
  });
});

describe('resolveIceServers — shared shape', () => {
  it.each([
    ['static', staticConfig],
    ['metered', meteredConfig],
  ])('attaches credentials only to the TURN entry (%s)', (_name, config) => {
    const [stun, turn] = resolveIceServers(config, 'std_1', NOW) ?? [];
    expect(stun.username).toBeUndefined();
    expect(stun.urls.every((u) => u.startsWith('stun:'))).toBe(true);
    expect(turn.username).toEqual(expect.any(String));
    expect(turn.urls.some((u) => u.startsWith('stun:'))).toBe(false);
  });

  /**
   * ⚠️ STUN must survive in both profiles. This endpoint has no peer, so it cannot know whether the
   * next call is `relayOnly` — dropping STUN here would drop it for the familiar pairs that are
   * supposed to go peer-to-peer, which is precisely the traffic that keeps off the relay budget.
   * The per-call control is `iceTransportPolicy: 'relay'` on the client.
   */
  it.each([
    ['static', staticConfig],
    ['metered', meteredConfig],
  ])('keeps a STUN entry (%s)', (_name, config) => {
    expect(urlsOf(config).some((u) => u.startsWith('stun:'))).toBe(true);
  });
});
