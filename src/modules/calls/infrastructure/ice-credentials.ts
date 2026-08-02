import { createHmac } from 'node:crypto';

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

/**
 * A short-lived TURN account, per coturn's `use-auth-secret` REST scheme
 * (draft-uberti-behave-turn-rest-00). The username carries its own expiry, so coturn validates it
 * without any shared state with us.
 *
 * ⚠️ This is a bearer capability for relay bandwidth — it is not tied to a call or a peer. Anyone
 * holding it can relay traffic until it expires, which is why the TTL is an hour, the student id is
 * embedded (coturn's `user-quota` is per username), and the endpoint that issues it is throttled.
 *
 * HMAC-SHA1 is the protocol, not a choice: coturn accepts nothing else. SHA-1's collision
 * weaknesses do not apply to HMAC, which needs only PRF security.
 */
export function buildIceCredential(
  secret: string,
  studentId: string,
  ttlSeconds: number,
  nowMs: number,
): { username: string; credential: string } {
  const username = `${Math.floor(nowMs / 1000) + ttlSeconds}:${studentId}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential };
}

export function buildIceServers(
  host: string,
  cred: { username: string; credential: string },
): IceServer[] {
  return [
    { urls: [`stun:${host}:3478`] },
    {
      urls: [
        `turn:${host}:3478?transport=udp`,
        `turn:${host}:3478?transport=tcp`,
        // Restrictive networks (university Wi-Fi, corporate proxies) usually leave only 443 open.
        `turns:${host}:443?transport=tcp`,
      ],
      username: cred.username,
      credential: cred.credential,
    },
  ];
}
