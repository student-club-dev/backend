import { validateEnv } from './env';

/**
 * Guards for PUBLIC_MEDIA_BASE_URL — the value baked into every image URL handed to the mobile
 * clients. A placeholder / localhost value silently ships broken links (regression: the server
 * once ran with `https://<sening-domening>/uploads`), so boot must fail fast on a bad value.
 */
describe('validateEnv — PUBLIC_MEDIA_BASE_URL', () => {
  it('rejects a non-URL placeholder value', () => {
    expect(() =>
      validateEnv({ PUBLIC_MEDIA_BASE_URL: 'https://<sening-domening>/uploads' }),
    ).toThrow(/PUBLIC_MEDIA_BASE_URL/);
  });

  it('rejects a localhost base URL in production', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        PUBLIC_MEDIA_BASE_URL: 'http://localhost:3000/uploads',
      }),
    ).toThrow(/PUBLIC_MEDIA_BASE_URL/);
  });

  it('accepts a real https base URL in production', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      PUBLIC_MEDIA_BASE_URL: 'https://api.studentclub.uz/uploads',
      TURN_HOST: 'turn.studentclub.uz',
      TURN_STATIC_SECRET: 'turn-secret',
    });
    expect(env.PUBLIC_MEDIA_BASE_URL).toBe('https://api.studentclub.uz/uploads');
  });

  it('allows the localhost default outside production', () => {
    const env = validateEnv({ NODE_ENV: 'development' });
    expect(env.PUBLIC_MEDIA_BASE_URL).toBe('http://localhost:3000/uploads');
  });
});

/**
 * CALLS_ENABLED gates the TURN requirement below — the calls code ships ahead of a deployed
 * coturn server and the mobile-client prerequisites it depends on, so production must still boot
 * with CALLS_ENABLED=false (the default) and no TURN configuration at all.
 */
describe('validateEnv — CALLS_ENABLED gates the TURN requirement', () => {
  const prodMediaUrl = { PUBLIC_MEDIA_BASE_URL: 'https://api.studentclub.uz/uploads' };

  it('boots in production with CALLS_ENABLED=false (default) and no TURN config', () => {
    const env = validateEnv({ NODE_ENV: 'production', ...prodMediaUrl });
    expect(env.CALLS_ENABLED).toBe('false');
    expect(env.TURN_HOST).toBeUndefined();
    expect(env.TURN_STATIC_SECRET).toBeUndefined();
  });

  it('fails in production with CALLS_ENABLED=true and no TURN config', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'production', CALLS_ENABLED: 'true', ...prodMediaUrl }),
    ).toThrow(
      /TURN_HOST and TURN_STATIC_SECRET are required in production when CALLS_ENABLED=true/,
    );
  });

  it('fails in production with CALLS_ENABLED=true and blank TURN values', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        CALLS_ENABLED: 'true',
        TURN_HOST: '',
        TURN_STATIC_SECRET: '',
        ...prodMediaUrl,
      }),
    ).toThrow(
      /TURN_HOST and TURN_STATIC_SECRET are required in production when CALLS_ENABLED=true/,
    );
  });

  it('boots in production with CALLS_ENABLED=true and TURN configured', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      CALLS_ENABLED: 'true',
      TURN_HOST: 'turn.studentclub.uz',
      TURN_STATIC_SECRET: 'turn-secret',
      ...prodMediaUrl,
    });
    expect(env.CALLS_ENABLED).toBe('true');
    expect(env.TURN_HOST).toBe('turn.studentclub.uz');
  });

  it('writes the formatted issues to console.error before throwing', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() =>
        validateEnv({ NODE_ENV: 'production', CALLS_ENABLED: 'true', ...prodMediaUrl }),
      ).toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid environment variables'),
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('TURN_HOST'));
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
