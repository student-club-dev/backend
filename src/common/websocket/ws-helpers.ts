import type { Socket } from 'socket.io';
import { ERROR_CODE } from '../errors/error-code';
import { AppException } from '../exceptions/app.exception';
import type { AuthenticatedUser } from '../types/authenticated-user';

/** All of a student's devices share this room — 1:1 delivery targets a member's personal room. */
export const personalRoom = (studentId: string): string => `user:${studentId}`;

export const userOf = (client: Socket): AuthenticatedUser | undefined =>
  client.data.user as AuthenticatedUser | undefined;

export function toWsError(error: unknown): { code: string; message: string } {
  if (error instanceof AppException) {
    return { code: error.code, message: error.message };
  }
  return { code: ERROR_CODE.INTERNAL_ERROR, message: 'Xatolik yuz berdi' };
}

export function wsUnauthorized(): { code: string; message: string } {
  return { code: ERROR_CODE.UNAUTHORIZED, message: 'Avtorizatsiyadan o‘tilmagan' };
}

/**
 * The handshake token is verified once, at connect, but a socket can stay open long past that
 * token's lifetime — so every client→server event re-checks the stored `exp`. Failing with the same
 * code REST uses lets the client run its existing refresh path and reconnect with a fresh
 * `auth.token`, instead of showing "Xabar yuborilmadi" forever (§17.3).
 *
 * ⚠️ Calls do NOT apply this to every event — a 4-hour call outlives a 15-minute access token, and
 * refusing `call:end` would leave the microphone streaming. See the three-way policy in
 * `docs/superpowers/specs/2026-08-01-chat-calls-design.md` §6.4.
 */
export function assertTokenFresh(client: Socket): void {
  const exp = client.data.tokenExp as number | undefined;
  if (exp === undefined || exp * 1000 <= Date.now()) {
    throw new AppException(ERROR_CODE.TOKEN_EXPIRED, 401, 'Sessiya muddati tugadi');
  }
}
