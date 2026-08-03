import { IceServer, buildIceCredential } from './ice-credentials';

/**
 * One reachable ICE endpoint. Providers differ only in which of these they publish — the scheme,
 * port and transport matrix is provider-specific, the shape is not.
 */
export interface IceEndpoint {
  scheme: 'stun' | 'turn' | 'turns';
  host: string;
  port: number;
  /**
   * Emitted as `?transport=` only when set. Omitting it means UDP per RFC 7065, and each provider
   * is mirrored exactly as it publishes its own array — coturn states `udp` explicitly, Metered
   * leaves it off. Two spellings of the same thing, and clients accept both; matching the vendor
   * keeps a copy-paste comparison against their docs honest.
   */
  transport?: 'udp' | 'tcp';
}

export function toIceUrl(endpoint: IceEndpoint): string {
  const query = endpoint.transport === undefined ? '' : `?transport=${endpoint.transport}`;
  return `${endpoint.scheme}:${endpoint.host}:${endpoint.port}${query}`;
}

/** Our own coturn, per `deploy/coturn/turnserver.conf`. */
export function coturnEndpoints(host: string): IceEndpoint[] {
  return [
    { scheme: 'stun', host, port: 3478 },
    { scheme: 'turn', host, port: 3478, transport: 'udp' },
    { scheme: 'turn', host, port: 3478, transport: 'tcp' },
    // Restrictive networks (university Wi-Fi, corporate proxies) usually leave only 443 open.
    { scheme: 'turns', host, port: 443, transport: 'tcp' },
  ];
}

/**
 * Metered's published matrix. Hard-coded rather than configured: the hostnames, the ports and the
 * static-credential scheme are one indivisible vendor contract — if Metered moves a host, the
 * matrix moves with it and this is a code change either way. `global.` is geo-routed by DNS.
 */
export const METERED_ENDPOINTS: IceEndpoint[] = [
  { scheme: 'stun', host: 'stun.relay.metered.ca', port: 80 },
  { scheme: 'turn', host: 'global.relay.metered.ca', port: 80 },
  { scheme: 'turn', host: 'global.relay.metered.ca', port: 80, transport: 'tcp' },
  { scheme: 'turn', host: 'global.relay.metered.ca', port: 443 },
  { scheme: 'turns', host: 'global.relay.metered.ca', port: 443, transport: 'tcp' },
];

/**
 * Groups endpoints the way `RTCConfiguration` requires: every URL inside one entry shares that
 * entry's credential, so STUN (which takes none) must not be merged with TURN (which must have one).
 *
 * ⚠️ STUN stays in the response even though §9.2 forces some calls through TURN. This endpoint has
 * no peer — `relayOnly` is decided per pair at invite time and delivered on the invite, so dropping
 * STUN here would drop it for *every* call, including the familiar pairs that are supposed to go
 * peer-to-peer. That is exactly the traffic the relay budget depends on keeping off TURN. The
 * per-call control belongs on the client: set `RTCConfiguration.iceTransportPolicy = 'relay'` when
 * the invite says `relayOnly`.
 */
export function toIceServers(
  endpoints: IceEndpoint[],
  credential: { username: string; credential: string },
): IceServer[] {
  const stun = endpoints.filter((e) => e.scheme === 'stun').map(toIceUrl);
  const relay = endpoints.filter((e) => e.scheme !== 'stun').map(toIceUrl);
  const servers: IceServer[] = [];
  if (stun.length > 0) {
    servers.push({ urls: stun });
  }
  if (relay.length > 0) {
    servers.push({ urls: relay, username: credential.username, credential: credential.credential });
  }
  return servers;
}

export type IceProvider = 'static' | 'metered';

export interface IceConfig {
  provider: IceProvider;
  turnHost?: string;
  turnSecret?: string;
  meteredUsername?: string;
  meteredCredential?: string;
  ttlSeconds: number;
}

/**
 * Builds the ICE server list for whichever provider this deployment runs, or `null` when that
 * provider is not configured — which the controller turns into a 503 rather than handing a client
 * a list it cannot authenticate against.
 *
 * Both branches are pure and offline: no provider is contacted, so this cannot fail, time out or
 * be slow. Metered's credentials are long-lived and come from the environment; that is a real
 * downgrade from the per-student, self-expiring coturn credential — one shared bearer token for
 * relay bandwidth, so coturn's per-user quota cannot apply and a leak lasts until it is rotated by
 * hand. It is inherent to their scheme, and the reason `metered` is a stopgap and `static` the
 * destination.
 */
export function resolveIceServers(
  config: IceConfig,
  studentId: string,
  nowMs: number,
): IceServer[] | null {
  if (config.provider === 'metered') {
    if (config.meteredUsername === undefined || config.meteredCredential === undefined) {
      return null;
    }
    return toIceServers(METERED_ENDPOINTS, {
      username: config.meteredUsername,
      credential: config.meteredCredential,
    });
  }
  if (config.turnHost === undefined || config.turnSecret === undefined) {
    return null;
  }
  return toIceServers(
    coturnEndpoints(config.turnHost),
    buildIceCredential(config.turnSecret, studentId, config.ttlSeconds, nowMs),
  );
}
