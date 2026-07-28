import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify } from '@node-rs/argon2';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { Env } from '../../../config/env';
import { AdminRole } from '../domain/enums/admin-role.enum';
import { AdminAuthService } from './admin-auth.service';

jest.mock('@node-rs/argon2', () => ({
  verify: jest.fn(),
}));

const verifyMock = verify as unknown as jest.Mock;

const ENV: Partial<Record<keyof Env, string>> = {
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_ACCESS_TTL: '15m',
  ADMIN_EMAIL: 'admin@elon.uz',
  ADMIN_PASSWORD_HASH: 'admin-argon2-hash',
  MODERATOR_EMAIL: 'mod@elon.uz',
  MODERATOR_PASSWORD_HASH: 'moderator-argon2-hash',
};

function makeConfig(
  overrides: Partial<Record<keyof Env, string | undefined>> = {},
): ConfigService<Env, true> {
  const values = { ...ENV, ...overrides };
  return {
    get: jest.fn((key: keyof Env) => values[key]),
  } as unknown as ConfigService<Env, true>;
}

function makeJwt(): JwtService {
  return {
    signAsync: jest.fn().mockResolvedValue('admin-access-token'),
  } as unknown as JwtService;
}

function makeService(config: ConfigService<Env, true> = makeConfig(), jwt: JwtService = makeJwt()) {
  return { service: new AdminAuthService(jwt, config), jwt, config };
}

beforeEach(() => {
  verifyMock.mockReset().mockResolvedValue(true);
});

describe('AdminAuthService', () => {
  describe('login', () => {
    it('valid ADMIN credentials → signs a token with role ADMIN', async () => {
      const { service, jwt } = makeService();

      const result = await service.login('admin@elon.uz', 'password123');

      expect(result).toEqual({ accessToken: 'admin-access-token' });
      expect(verifyMock).toHaveBeenCalledWith('admin-argon2-hash', 'password123');
      expect(jwt.signAsync).toHaveBeenCalledWith(
        { sub: 'admin@elon.uz', type: 'admin', role: AdminRole.ADMIN },
        { secret: 'test-access-secret', expiresIn: '15m' },
      );
    });

    it('valid MODERATOR credentials → signs a token with role MODERATOR', async () => {
      const { service, jwt } = makeService();

      const result = await service.login('mod@elon.uz', 'password123');

      expect(result).toEqual({ accessToken: 'admin-access-token' });
      expect(verifyMock).toHaveBeenCalledWith('moderator-argon2-hash', 'password123');
      expect(jwt.signAsync).toHaveBeenCalledWith(
        { sub: 'mod@elon.uz', type: 'admin', role: AdminRole.MODERATOR },
        { secret: 'test-access-secret', expiresIn: '15m' },
      );
    });

    it('wrong password → 401 ADMIN_INVALID_CREDENTIALS, no token signed', async () => {
      const { service, jwt } = makeService();
      verifyMock.mockResolvedValue(false);

      await expect(service.login('admin@elon.uz', 'wrong')).rejects.toMatchObject({
        code: ERROR_CODE.ADMIN_INVALID_CREDENTIALS,
        status: 401,
      });
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('unknown email → 401 ADMIN_INVALID_CREDENTIALS, argon2 never called (no enumeration)', async () => {
      const { service, jwt } = makeService();

      await expect(service.login('stranger@elon.uz', 'password123')).rejects.toMatchObject({
        code: ERROR_CODE.ADMIN_INVALID_CREDENTIALS,
        status: 401,
      });
      expect(verifyMock).not.toHaveBeenCalled();
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('admin email configured without a hash → treated as unconfigured (401)', async () => {
      const { service } = makeService(makeConfig({ ADMIN_PASSWORD_HASH: undefined }));

      await expect(service.login('admin@elon.uz', 'password123')).rejects.toMatchObject({
        code: ERROR_CODE.ADMIN_INVALID_CREDENTIALS,
        status: 401,
      });
      expect(verifyMock).not.toHaveBeenCalled();
    });

    it('moderator creds unset → moderator email is not a valid login (401)', async () => {
      const { service } = makeService(
        makeConfig({ MODERATOR_EMAIL: undefined, MODERATOR_PASSWORD_HASH: undefined }),
      );

      await expect(service.login('mod@elon.uz', 'password123')).rejects.toMatchObject({
        code: ERROR_CODE.ADMIN_INVALID_CREDENTIALS,
        status: 401,
      });
      expect(verifyMock).not.toHaveBeenCalled();
    });
  });

  describe('me', () => {
    it('returns the principal identity', () => {
      const { service } = makeService();

      expect(service.me({ email: 'admin@elon.uz', role: AdminRole.ADMIN })).toEqual({
        email: 'admin@elon.uz',
        role: AdminRole.ADMIN,
      });
    });
  });
});
