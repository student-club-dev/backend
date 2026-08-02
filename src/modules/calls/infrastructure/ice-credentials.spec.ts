import { createHmac } from 'node:crypto';
import { buildIceCredential, buildIceServers } from './ice-credentials';

describe('buildIceCredential', () => {
  const SECRET = 'test-secret';
  const NOW = 1_785_308_400_000; // 2026-07-28T00:20:00Z

  it('encodes expiry and student id in the username', () => {
    const { username } = buildIceCredential(SECRET, 'std_1', 3600, NOW);
    expect(username).toBe(`${NOW / 1000 + 3600}:std_1`);
  });

  // coturn's `use-auth-secret` scheme (draft-uberti-behave-turn-rest-00) accepts nothing else —
  // HMAC-SHA1, base64. SHA-1 collision weaknesses do not apply to HMAC; do not "upgrade" this.
  it('is base64 HMAC-SHA1 of the username', () => {
    const { username, credential } = buildIceCredential(SECRET, 'std_1', 3600, NOW);
    expect(credential).toBe(createHmac('sha1', SECRET).update(username).digest('base64'));
  });

  it('changes when the student changes', () => {
    const a = buildIceCredential(SECRET, 'std_1', 3600, NOW);
    const b = buildIceCredential(SECRET, 'std_2', 3600, NOW);
    expect(a.credential).not.toBe(b.credential);
  });

  it('embeds an integer expiry even from a sub-second timestamp', () => {
    const subSecondNow = NOW + 500; // .5s past the second
    const { username } = buildIceCredential(SECRET, 'std_1', 3600, subSecondNow);
    const [expiry] = username.split(':');
    expect(Number.isInteger(Number(expiry))).toBe(true);
    expect(expiry).toBe(String(Math.floor(subSecondNow / 1000) + 3600));
  });
});

describe('buildIceServers', () => {
  const cred = { username: 'u', credential: 'c' };

  it('offers STUN plus UDP, TCP and TLS TURN', () => {
    const servers = buildIceServers('turn.elonuz.uz', cred);
    const urls = servers.flatMap((s) => s.urls);
    expect(urls).toContain('stun:turn.elonuz.uz:3478');
    expect(urls).toContain('turn:turn.elonuz.uz:3478?transport=udp');
    expect(urls).toContain('turn:turn.elonuz.uz:3478?transport=tcp');
    // 443/TLS is not optional: students call from university Wi-Fi where only 443 is open, and
    // without it a share of calls never connect at all.
    expect(urls).toContain('turns:turn.elonuz.uz:443?transport=tcp');
  });

  it('attaches credentials only to the TURN entry', () => {
    const [stun, turn] = buildIceServers('turn.elonuz.uz', cred);
    expect(stun.username).toBeUndefined();
    expect(turn.username).toBe('u');
    expect(turn.credential).toBe('c');
  });
});
