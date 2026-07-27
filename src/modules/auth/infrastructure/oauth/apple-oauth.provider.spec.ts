import { ConfigService } from '@nestjs/config';
import { AuthProvider } from '../../../../common/enums/auth-provider.enum';
import { ERROR_CODE } from '../../../../common/errors/error-code';
import type { Env } from '../../../../config/env';
import { AppleOAuthProvider } from './apple-oauth.provider';

// `mock`-prefixed so the hoisted jest.mock factory may reference it.
const mockJwtVerify = jest.fn();

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'mock-jwks'),
  jwtVerify: (...args: unknown[]) => mockJwtVerify(...args),
}));

function makeConfig(clientIds: string | undefined): ConfigService<Env, true> {
  return { get: jest.fn().mockReturnValue(clientIds) } as unknown as ConfigService<Env, true>;
}

beforeEach(() => {
  mockJwtVerify.mockReset();
});

describe('AppleOAuthProvider', () => {
  it('verifies the token (issuer + audience) and maps the payload to an identity', async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'apple-sub-1', email: 'oauth@icloud.com', email_verified: 'true' },
    });
    const provider = new AppleOAuthProvider(makeConfig('uz.elonuz.student'));

    const identity = await provider.verify('valid-token');

    expect(mockJwtVerify).toHaveBeenCalledWith('valid-token', 'mock-jwks', {
      issuer: 'https://appleid.apple.com',
      audience: ['uz.elonuz.student'],
    });
    expect(identity).toEqual({
      provider: AuthProvider.APPLE,
      providerAccountId: 'apple-sub-1',
      email: 'oauth@icloud.com',
      emailVerified: true,
      firstName: null,
      lastName: null,
      avatarUrl: null,
    });
  });

  it('treats a boolean email_verified of true as verified', async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: 's', email_verified: true } });
    const provider = new AppleOAuthProvider(makeConfig('id-a'));

    expect((await provider.verify('tok')).emailVerified).toBe(true);
  });

  it('accepts any configured client id — parses the comma-separated list into the audience', async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: 's' } });
    const provider = new AppleOAuthProvider(makeConfig('id-a, id-b , id-c'));

    await provider.verify('tok');

    expect(mockJwtVerify).toHaveBeenCalledWith('tok', 'mock-jwks', {
      issuer: 'https://appleid.apple.com',
      audience: ['id-a', 'id-b', 'id-c'],
    });
  });

  it('throws INVALID_OAUTH_TOKEN (401) when verification fails', async () => {
    mockJwtVerify.mockRejectedValue(new Error('signature verification failed'));
    const provider = new AppleOAuthProvider(makeConfig('id-a'));

    await expect(provider.verify('bad-token')).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_OAUTH_TOKEN,
      status: 401,
    });
  });

  it('throws INVALID_OAUTH_TOKEN (401) when the payload has no subject', async () => {
    mockJwtVerify.mockResolvedValue({ payload: { email: 'x@y.com' } });
    const provider = new AppleOAuthProvider(makeConfig('id-a'));

    await expect(provider.verify('tok')).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_OAUTH_TOKEN,
      status: 401,
    });
  });

  it('throws a 500 config error when no client ids are configured', async () => {
    const provider = new AppleOAuthProvider(makeConfig(undefined));

    await expect(provider.verify('tok')).rejects.toMatchObject({
      code: ERROR_CODE.INTERNAL_ERROR,
      status: 500,
    });
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });
});
