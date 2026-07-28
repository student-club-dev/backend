import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Env } from '../../config/env';
import { ERROR_CODE } from '../errors/error-code';
import { AppException } from '../exceptions/app.exception';
import type { AuthenticatedUser, JwtPayload } from '../types/authenticated-user';

/**
 * Verifies the Bearer access token (JWT_ACCESS_SECRET) and attaches `{ id, type }` to
 * `req.user`. Shared guard — protected modules apply it with `@UseGuards(JwtAuthGuard)`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = this.extractBearerToken(request.headers.authorization);
    if (token === null) {
      throw AppException.unauthorized();
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
      request.user = { id: payload.sub, type: payload.type };
      return true;
    } catch (error) {
      // Expired access token → TOKEN_EXPIRED so the client refreshes instead of logging out.
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw AppException.unauthorized(
          'Sessiya tugagan, qaytadan urinib ko‘ring',
          ERROR_CODE.TOKEN_EXPIRED,
        );
      }
      throw AppException.unauthorized();
    }
  }

  private extractBearerToken(header: string | undefined): string | null {
    if (header === undefined) {
      return null;
    }
    const [scheme, value] = header.split(' ');
    return scheme === 'Bearer' && value ? value : null;
  }
}
