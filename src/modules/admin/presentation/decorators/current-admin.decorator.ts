import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { AuthenticatedAdmin } from '../../domain/admin-principal';

/** Injects the admin principal set by AdminJwtGuard. Use behind `@UseGuards(AdminJwtGuard)`. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAdmin => {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedAdmin }>();
    if (request.user === undefined) {
      throw AppException.unauthorized();
    }
    return request.user;
  },
);
