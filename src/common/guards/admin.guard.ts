import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../../config/env';
import { AppException } from '../exceptions/app.exception';

/**
 * PLACEHOLDER admin authentication. Guards the admin-only endpoints by comparing the
 * `X-Admin-Key` request header against the `ADMIN_API_KEY` env secret. Access is denied
 * (403 FORBIDDEN) when `ADMIN_API_KEY` is unset or the header does not match.
 *
 * This is a temporary gate: it will be swapped for real admin auth (a future admin panel)
 * once that exists. Only the authentication mechanism changes — the CRUD handlers behind
 * this guard stay the same.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private static readonly HEADER = 'x-admin-key';

  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[AdminGuard.HEADER];
    const expected = this.config.get('ADMIN_API_KEY', { infer: true });

    if (!expected || typeof provided !== 'string' || provided !== expected) {
      throw AppException.forbidden();
    }
    return true;
  }
}
