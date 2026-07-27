import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Lets anonymous requests through, but still verifies a token when one is sent
 * (STUDENT_FEED.md D5). A student browses the feed before signing up; once signed in, the same
 * endpoints personalise (`isFavorite`, `promoCode`).
 *
 * An INVALID or expired token is still rejected rather than silently downgraded to anonymous —
 * otherwise a stale access token would quietly make a user's favourites disappear instead of
 * triggering the client's refresh-and-retry.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtAuthGuard: JwtAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (request.headers.authorization === undefined) {
      return true;
    }
    return this.jwtAuthGuard.canActivate(context);
  }
}
