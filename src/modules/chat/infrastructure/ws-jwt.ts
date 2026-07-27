import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { AccountType } from '../../../common/enums/account-type.enum';
import type { Env } from '../../../config/env';
import type { AuthenticatedUser, JwtPayload } from '../../../common/types/authenticated-user';

/**
 * Verifies a socket handshake's access token exactly like JwtAuthGuard (JWT_ACCESS_SECRET) and
 * asserts it is a STUDENT. The token is read from `handshake.auth.token` or the `Authorization`
 * header. Throws on any failure — the gateway disconnects the socket.
 */
export async function verifyStudentSocket(
  client: Socket,
  jwt: JwtService,
  config: ConfigService<Env, true>,
): Promise<AuthenticatedUser> {
  const raw =
    (typeof client.handshake.auth?.token === 'string' ? client.handshake.auth.token : null) ??
    extractBearer(client.handshake.headers.authorization);
  if (raw === null) {
    throw new Error('missing token');
  }
  const payload = await jwt.verifyAsync<JwtPayload>(raw, {
    secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
  });
  if (payload.type !== AccountType.STUDENT) {
    throw new Error('not a student');
  }
  return { id: payload.sub, type: payload.type };
}

function extractBearer(header: string | undefined): string | null {
  if (header === undefined) {
    return null;
  }
  const [scheme, value] = header.split(' ');
  return scheme === 'Bearer' && value ? value : null;
}
