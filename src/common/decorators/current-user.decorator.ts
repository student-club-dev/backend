import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../exceptions/app.exception';
import type { AuthenticatedUser } from '../types/authenticated-user';

/** Injects the authenticated principal set by JwtAuthGuard. Use behind `@UseGuards(JwtAuthGuard)`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (request.user === undefined) {
      throw AppException.unauthorized();
    }
    return request.user;
  },
);
