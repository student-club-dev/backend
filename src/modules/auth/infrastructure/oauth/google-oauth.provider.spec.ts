import { ConfigService } from '@nestjs/config';
import { AuthProvider } from '../../../../common/enums/auth-provider.enum';
import { ERROR_CODE } from '../../../../common/errors/error-code';
import type { Env } from '../../../../config/env';
import { GoogleOAuthProvider } from './google-oauth.provider';

// `mock`-prefixed so the jest.mock factory (hoisted) may reference it.
const mockVerifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

function makeConfig(clientId: string | undefined): ConfigService<Env, true> {
  return { get: jest.fn().mockReturnValue(clientId) } as unknown as ConfigService<Env, true>;
}

beforeEach(() => {
  mockVerifyIdToken.mockReset();
});

describe('GoogleOAuthProvider', () => {
  it('verifies the token (signature + audience) and maps the payload to an identity', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-1',
        email: 'oauth@b.com',
        email_verified: true,
        given_name: 'Ali',
        family_name: 'Valiev',
        picture: 'https://img/avatar.png',
      }),
    });
    const provider = new GoogleOAuthProvider(makeConfig('client-id-123'));

    const identity = await provider.verify('valid-token');

    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: 'valid-token',
      audience: 'client-id-123',
    });
    expect(identity).toEqual({
      provider: AuthProvider.GOOGLE,
      providerAccountId: 'google-sub-1',
      email: 'oauth@b.com',
      emailVerified: true,
      firstName: 'Ali',
      lastName: 'Valiev',
      avatarUrl: 'https://img/avatar.png',
    });
  });

  it('throws INVALID_OAUTH_TOKEN (401) when verification fails', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token signature'));
    const provider = new GoogleOAuthProvider(makeConfig('client-id-123'));

    await expect(provider.verify('bad-token')).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_OAUTH_TOKEN,
      status: 401,
    });
  });

  it('throws INVALID_OAUTH_TOKEN (401) when the payload has no subject', async () => {
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'x@y.com' }) });
    const provider = new GoogleOAuthProvider(makeConfig('client-id-123'));

    await expect(provider.verify('tok')).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_OAUTH_TOKEN,
      status: 401,
    });
  });

  it('throws a 500 config error when GOOGLE_CLIENT_ID is unset', async () => {
    const provider = new GoogleOAuthProvider(makeConfig(undefined));

    await expect(provider.verify('tok')).rejects.toMatchObject({
      code: ERROR_CODE.INTERNAL_ERROR,
      status: 500,
    });
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });
});
