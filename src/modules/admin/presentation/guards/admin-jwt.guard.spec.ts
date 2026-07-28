import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AccountType } from '../../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../../common/errors/error-code';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { Env } from '../../../../config/env';
import { AdminRole } from '../../domain/enums/admin-role.enum';
import { AdminJwtGuard } from './admin-jwt.guard';

function makeConfig(): ConfigService<Env, true> {
  return {
    get: jest.fn(() => 'test-access-secret'),
  } as unknown as ConfigService<Env, true>;
}

function contextWith(authorization?: string): { context: ExecutionContext; request: Request } {
  const request = { headers: { authorization } } as unknown as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('AdminJwtGuard', () => {
  it('accepts a valid admin token and attaches the principal to req.user', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'admin@elon.uz',
        type: AccountType.ADMIN,
        role: AdminRole.ADMIN,
      }),
    } as unknown as JwtService;
    const guard = new AdminJwtGuard(jwt, makeConfig());
    const { context, request } = contextWith('Bearer valid-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((request as Request & { user?: unknown }).user).toEqual({
      id: 'admin@elon.uz',
      type: AccountType.ADMIN,
      role: AdminRole.ADMIN,
    });
  });

  it('rejects a missing Authorization header with 401 UNAUTHORIZED', async () => {
    const jwt = { verifyAsync: jest.fn() } as unknown as JwtService;
    const guard = new AdminJwtGuard(jwt, makeConfig());
    const { context } = contextWith(undefined);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ERROR_CODE.UNAUTHORIZED,
      status: 401,
    });
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('maps an expired token to 401 TOKEN_EXPIRED', async () => {
    const expired = Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' });
    const jwt = {
      verifyAsync: jest.fn().mockRejectedValue(expired),
    } as unknown as JwtService;
    const guard = new AdminJwtGuard(jwt, makeConfig());
    const { context } = contextWith('Bearer expired-token');

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ERROR_CODE.TOKEN_EXPIRED,
      status: 401,
    });
  });

  it('rejects a valid non-admin token with 401 UNAUTHORIZED', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'stu-1', type: AccountType.STUDENT }),
    } as unknown as JwtService;
    const guard = new AdminJwtGuard(jwt, makeConfig());
    const { context } = contextWith('Bearer student-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(AppException);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ERROR_CODE.UNAUTHORIZED,
      status: 401,
    });
  });
});
