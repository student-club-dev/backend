import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AccountType } from '../../../../common/enums/account-type.enum';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../../common/types/authenticated-user';

/**
 * Restricts the business endpoints to BUSINESS accounts. Runs after JwtAuthGuard (which sets
 * `req.user`); a student token is rejected with 403 FORBIDDEN.
 */
@Injectable()
export class BusinessAccountGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (request.user === undefined || request.user.type !== AccountType.BUSINESS) {
      throw AppException.forbidden();
    }
    return true;
  }
}
