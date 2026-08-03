import { createHmac } from 'node:crypto';
import { buildIceCredential } from './ice-credentials';

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
