import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AccountType } from '../../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../../common/errors/error-code';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { Env } from '../../../../config/env';
import type { AdminJwtPayload, AuthenticatedAdmin } from '../../domain/admin-principal';

/**
 * Verifies the Bearer admin access token (same JWT_ACCESS_SECRET / mechanism as JwtAuthGuard),
 * requires `type === 'admin'`, and attaches `{ id: email, type, role }` to `req.user`. Missing /
 * invalid / non-admin token → 401 UNAUTHORIZED; expired → 401 TOKEN_EXPIRED (matches the app guard).
 */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedAdmin }>();
    const token = this.extractBearerToken(request.headers.authorization);
    if (token === null) {
      throw AppException.unauthorized();
    }

    let payload: AdminJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<AdminJwtPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch (error) {
      // Expired access token → TOKEN_EXPIRED so the client re-authenticates instead of hard-failing.
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw AppException.unauthorized(
          'Sessiya tugagan, qaytadan urinib ko‘ring',
          ERROR_CODE.TOKEN_EXPIRED,
        );
      }
      throw AppException.unauthorized();
    }

    // A valid non-admin token (e.g. a student/business token) is not admin credentials here.
    if (payload.type !== AccountType.ADMIN) {
      throw AppException.unauthorized();
    }

    request.user = { id: payload.sub, type: AccountType.ADMIN, role: payload.role };
    return true;
  }

  private extractBearerToken(header: string | undefined): string | null {
    if (header === undefined) {
      return null;
    }
    const [scheme, value] = header.split(' ');
    return scheme === 'Bearer' && value ? value : null;
  }
}
