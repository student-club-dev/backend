import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http2 from 'node:http2';
import { SignJWT, importPKCS8 } from 'jose';
import type { Env } from '../../config/env';
import { ApnsEnvironment } from './push-provider';

/** Apple's two hosts. A token issued in one is rejected by the other with `400 BadDeviceToken`. */
const HOSTS: Record<ApnsEnvironment, string> = {
  PRODUCTION: 'https://api.push.apple.com',
  SANDBOX: 'https://api.sandbox.push.apple.com',
};

/**
 * Apple's provider-token rules, and they are enforced strictly in both directions:
 * older than an hour → `403 ExpiredProviderToken`; re-signed more often than every 20 minutes →
 * `429 TooManyProviderTokenUpdates`. Signing one per request — the usual mistake — hits the second.
 */
const TOKEN_MAX_AGE_MS = 50 * 60 * 1000;
const TOKEN_MIN_AGE_MS = 21 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 10_000;

/** One APNs request. The transport owns the path and the authorization header; the rest is caller's. */
export interface ApnsRequest {
  deviceToken: string;
  env: ApnsEnvironment;
  headers: Record<string, string>;
  body: string;
}

/** Apple's answer: an HTTP status, plus a `reason` string on everything but 200. */
export interface ApnsResponse {
  status: number;
  reason: string | null;
}

/** Injection token for the APNs transport (the provider is tested against a fake one). */
export const APNS_TRANSPORT = Symbol('APNS_TRANSPORT');

/**
 * The wire half of the APNs integration: HTTP/2 sessions and the provider JWT.
 *
 * Separate from `ApnsPushProvider` so the delivery rules (retries, which failures kill a token) can
 * be unit-tested against a fake transport — none of that logic is reachable through a real socket
 * to Apple.
 *
 * Throws on transport failure. The provider decides what a failure means for the token.
 */
export interface ApnsTransport {
  post(request: ApnsRequest): Promise<ApnsResponse>;
  /** Drops the cached provider JWT so the next request signs a fresh one, if Apple allows it yet. */
  expireToken(): void;
}

/**
 * HTTP/2 APNs transport.
 *
 * `fetch`/`axios` cannot be used here: they speak HTTP/1.1 and APNs refuses the connection. Node's
 * built-in `node:http2` covers it, so no new dependency — and `jose` (already used to verify Apple
 * sign-in) signs the ES256 provider token.
 *
 * Sessions are long-lived and reused per host. Apple expects that; opening one per notification is
 * slow and gets rate-limited.
 */
@Injectable()
export class Http2ApnsTransport implements ApnsTransport, OnModuleDestroy {
  private readonly logger = new Logger(Http2ApnsTransport.name);
  private readonly keyP8: string;
  private readonly keyId: string;
  private readonly teamId: string;
  private readonly sessions = new Map<ApnsEnvironment, http2.ClientHttp2Session>();
  private cachedToken: { jwt: string; signedAt: number } | null = null;
  /** In-flight signing, so a burst of pushes mints one token instead of one each. */
  private signing: Promise<string> | null = null;

  constructor(config: ConfigService<Env, true>) {
    // Stored with literal `\n` like the FCM service-account key; the PEM parser needs real newlines.
    this.keyP8 = (config.get('APNS_KEY_P8', { infer: true }) ?? '').replace(/\\n/g, '\n');
    this.keyId = config.get('APNS_KEY_ID', { infer: true }) ?? '';
    this.teamId = config.get('APNS_TEAM_ID', { infer: true }) ?? '';
  }

  async post(request: ApnsRequest): Promise<ApnsResponse> {
    const jwt = await this.authorization();
    const session = this.session(request.env);

    return new Promise<ApnsResponse>((resolve, reject) => {
      const stream = session.request({
        [http2.constants.HTTP2_HEADER_METHOD]: 'POST',
        [http2.constants.HTTP2_HEADER_PATH]: `/3/device/${request.deviceToken}`,
        authorization: `bearer ${jwt}`,
        ...request.headers,
      });

      let status = 0;
      let body = '';
      let settled = false;
      const settle = (finish: () => void): void => {
        if (!settled) {
          settled = true;
          finish();
        }
      };

      stream.setTimeout(REQUEST_TIMEOUT_MS, () => {
        stream.close(http2.constants.NGHTTP2_CANCEL);
        settle(() => reject(new Error('APNs request timed out')));
      });
      stream.on('response', (headers) => {
        status = Number(headers[http2.constants.HTTP2_HEADER_STATUS] ?? 0);
      });
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        body += chunk;
      });
      stream.on('end', () => settle(() => resolve({ status, reason: parseReason(body) })));
      stream.on('error', (error: Error) => settle(() => reject(error)));
      stream.end(request.body);
    });
  }

  /**
   * A forced expiry (after `403 ExpiredProviderToken`) is honoured only once the cached token is
   * past Apple's 20-minute re-sign floor. Below it the same token is kept: signing again would
   * trade one device's 403 for a `429 TooManyProviderTokenUpdates` that blocks every device.
   */
  expireToken(): void {
    const cached = this.cachedToken;
    if (cached === null || Date.now() - cached.signedAt >= TOKEN_MIN_AGE_MS) {
      this.cachedToken = null;
    }
  }

  /** Closes the sessions on shutdown — otherwise Node keeps the process (and Jest) alive. */
  onModuleDestroy(): void {
    for (const session of this.sessions.values()) {
      session.close();
    }
    this.sessions.clear();
  }

  /** The cached provider JWT, re-signed once it approaches Apple's one-hour limit. */
  private async authorization(): Promise<string> {
    const cached = this.cachedToken;
    if (cached !== null && Date.now() - cached.signedAt < TOKEN_MAX_AGE_MS) {
      return cached.jwt;
    }
    this.signing ??= this.signToken().finally(() => {
      this.signing = null;
    });
    return this.signing;
  }

  private async signToken(): Promise<string> {
    const key = await importPKCS8(this.keyP8, 'ES256');
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.keyId })
      .setIssuer(this.teamId)
      .setIssuedAt()
      .sign(key);
    this.cachedToken = { jwt, signedAt: Date.now() };
    return jwt;
  }

  /** A live session for the host, reconnecting if the previous one was closed by Apple or the network. */
  private session(env: ApnsEnvironment): http2.ClientHttp2Session {
    const existing = this.sessions.get(env);
    if (existing !== undefined && !existing.closed && !existing.destroyed) {
      return existing;
    }
    const session = http2.connect(HOSTS[env]);
    // Without a listener a session-level error is thrown as an uncaught exception and takes the
    // process down — a dropped connection to Apple must never do that.
    session.on('error', (error: Error) => {
      this.logger.warn(`APNs session error (${env}): ${error.message}`);
    });
    session.on('close', () => {
      if (this.sessions.get(env) === session) {
        this.sessions.delete(env);
      }
    });
    this.sessions.set(env, session);
    return session;
  }
}

/** Pulls `{"reason":"BadDeviceToken"}` out of an error body; 200 has no body at all. */
function parseReason(body: string): string | null {
  if (body.length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(body);
    const reason = (parsed as { reason?: unknown }).reason;
    return typeof reason === 'string' ? reason : null;
  } catch {
    return null;
  }
}
