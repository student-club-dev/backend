import { ExecutionContext } from '@nestjs/common';
import { AccountType } from '../enums/account-type.enum';
import { AppException } from '../exceptions/app.exception';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { StudentGuard } from './student.guard';

function contextWith(user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('StudentGuard', () => {
  it('lets a student through', () => {
    const guard = new StudentGuard();

    expect(guard.canActivate(contextWith({ id: 's1', type: AccountType.STUDENT }))).toBe(true);
  });

  it('rejects a business-owner token with 403 — a valid identity for the wrong app', () => {
    const guard = new StudentGuard();

    expect(() => guard.canActivate(contextWith({ id: 'b1', type: AccountType.BUSINESS }))).toThrow(
      expect.objectContaining({ status: 403 }) as unknown as Error,
    );
  });

  it('rejects an unauthenticated request with 401', () => {
    const guard = new StudentGuard();

    try {
      guard.canActivate(contextWith(undefined));
      fail('expected the guard to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).status).toBe(401);
    }
  });
});
