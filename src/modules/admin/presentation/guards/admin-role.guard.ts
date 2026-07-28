import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { AuthenticatedAdmin } from '../../domain/admin-principal';
import { AdminRole } from '../../domain/enums/admin-role.enum';
import { ADMIN_ROLES_KEY } from '../decorators/roles.decorator';

/**
 * RBAC gate for admin routes. Reads the roles required by `@Roles(...)` and checks the admin's role
 * (set by AdminJwtGuard). No `@Roles` / empty list → any authenticated admin passes. Otherwise a
 * role outside the allowed set → 403 FORBIDDEN. Runs AFTER AdminJwtGuard.
 */
@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ADMIN_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required === undefined || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedAdmin }>();
    const user = request.user;
    if (user === undefined || !required.includes(user.role)) {
      throw AppException.forbidden();
    }
    return true;
  }
}
