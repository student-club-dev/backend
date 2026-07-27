import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AccountType } from '../enums/account-type.enum';
import { AppException } from '../exceptions/app.exception';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Requires a signed-in STUDENT (STUDENT_FEED.md D5). Runs after JwtAuthGuard, which has already
 * put `user` on the request.
 *
 * A business-owner token is a valid identity for the wrong app — that is an authorisation failure
 * (403), not a missing one (401).
 */
@Injectable()
export class StudentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (request.user === undefined) {
      throw AppException.unauthorized();
    }
    if (request.user.type !== AccountType.STUDENT) {
      throw AppException.forbidden('Bu bo‘lim faqat talabalar uchun');
    }
    return true;
  }
}
