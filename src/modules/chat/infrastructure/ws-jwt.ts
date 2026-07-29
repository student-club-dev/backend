import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { AccountType } from '../../../common/enums/account-type.enum';
import type { Env } from '../../../config/env';
import type { AuthenticatedUser, JwtPayload } from '../../../common/types/authenticated-user';

/** A verified handshake: who they are, and when their access token stops being valid. */
export interface VerifiedSocket {
  user: AuthenticatedUser;
  /** The token's `exp` claim — unix **seconds**, not milliseconds. */
  expiresAt: number;
}

/**
 * Verifies a socket handshake's access token exactly like JwtAuthGuard (JWT_ACCESS_SECRET) and
 * asserts it is a STUDENT. The token is read from `handshake.auth.token` or the `Authorization`
 * header. Throws on any failure — the gateway disconnects the socket.
 *
 * `exp` is returned as well because this is the only time the token is parsed: a socket can stay
 * open long past its access token's lifetime, and the gateway re-checks the claim per event (§17.3).
 */
export async function verifyStudentSocket(
  client: Socket,
  jwt: JwtService,
  config: ConfigService<Env, true>,
): Promise<VerifiedSocket> {
  const raw =
    (typeof client.handshake.auth?.token === 'string' ? client.handshake.auth.token : null) ??
    extractBearer(client.handshake.headers.authorization);
  if (raw === null) {
    throw new Error('missing token');
  }
  const payload = await jwt.verifyAsync<JwtPayload & { exp: number }>(raw, {
    secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
  });
  if (payload.type !== AccountType.STUDENT) {
    throw new Error('not a student');
  }
  return { user: { id: payload.sub, type: payload.type }, expiresAt: payload.exp };
}

function extractBearer(header: string | undefined): string | null {
  if (header === undefined) {
    return null;
  }
  const [scheme, value] = header.split(' ');
  return scheme === 'Bearer' && value ? value : null;
}
