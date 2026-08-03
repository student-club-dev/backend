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

  // Regression: `.env.example` ships TURN_HOST=/TURN_STATIC_SECRET= blank, so a server whose .env
  // was copied from it has them defined-but-empty. That took production down with a 502 on
  // 2026-08-02: `.min(1)` rejected the blanks, Nest never booted, and the container crash-looped
  // with nothing listening for nginx to proxy to — even though CALLS_ENABLED was false. Blank must
  // mean "not set", exactly like the key being absent.
  it('boots in production with CALLS_ENABLED=false and blank TURN values', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      TURN_HOST: '',
      TURN_STATIC_SECRET: '',
      ...prodMediaUrl,
    });
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

  /**
   * ICE_PROVIDER decides WHICH credentials the boot guard demands. Requiring both providers' would
   * make it impossible to run on Metered without also standing up coturn — the whole point of the
   * flag — and requiring only coturn's would let a `metered` deployment boot with nothing usable.
   */
  describe('ICE_PROVIDER selects which credentials are required', () => {
    const prodCalls = { NODE_ENV: 'production', CALLS_ENABLED: 'true', ...prodMediaUrl };
    const metered = { METERED_TURN_USERNAME: 'm_user', METERED_TURN_CREDENTIAL: 'm_pass' };

    it('defaults to static, keeping the coturn requirement', () => {
      const env = validateEnv({
        ...prodCalls,
        TURN_HOST: 'turn.studentclub.uz',
        TURN_STATIC_SECRET: 'turn-secret',
      });
      expect(env.ICE_PROVIDER).toBe('static');
    });

    it('fails with ICE_PROVIDER=metered and no Metered credentials', () => {
      expect(() => validateEnv({ ...prodCalls, ICE_PROVIDER: 'metered' })).toThrow(
        /METERED_TURN_USERNAME and METERED_TURN_CREDENTIAL are required/,
      );
    });

    // Same blank-value trap that took production down on 2026-08-02, now on the Metered keys.
    it('fails with ICE_PROVIDER=metered and blank Metered credentials', () => {
      expect(() =>
        validateEnv({
          ...prodCalls,
          ICE_PROVIDER: 'metered',
          METERED_TURN_USERNAME: '',
          METERED_TURN_CREDENTIAL: '',
        }),
      ).toThrow(/METERED_TURN_USERNAME and METERED_TURN_CREDENTIAL are required/);
    });

    // ⚠️ Metered is selected, so coturn's absence must NOT block the boot.
    it('boots with ICE_PROVIDER=metered and no coturn config at all', () => {
      const env = validateEnv({ ...prodCalls, ICE_PROVIDER: 'metered', ...metered });
      expect(env.ICE_PROVIDER).toBe('metered');
      expect(env.TURN_HOST).toBeUndefined();
    });

    // The mirror: coturn is selected, so Metered's absence must not block it either.
    it('boots with ICE_PROVIDER=static and no Metered config at all', () => {
      const env = validateEnv({
        ...prodCalls,
        ICE_PROVIDER: 'static',
        TURN_HOST: 'turn.studentclub.uz',
        TURN_STATIC_SECRET: 'turn-secret',
      });
      expect(env.METERED_TURN_USERNAME).toBeUndefined();
    });

    it('fails with ICE_PROVIDER=metered when only coturn is configured', () => {
      expect(() =>
        validateEnv({
          ...prodCalls,
          ICE_PROVIDER: 'metered',
          TURN_HOST: 'turn.studentclub.uz',
          TURN_STATIC_SECRET: 'turn-secret',
        }),
      ).toThrow(/METERED_TURN_USERNAME and METERED_TURN_CREDENTIAL are required/);
    });

    it('rejects an unknown provider name outright', () => {
      expect(() => validateEnv({ ...prodCalls, ICE_PROVIDER: 'twilio', ...metered })).toThrow();
    });
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

/**
 * The moderation queue's master switch. Default OFF is load-bearing: while false a created
 * business is APPROVED at once and a submitted listing publishes straight to ACTIVE, which is the
 * behaviour every existing client depends on.
 */
describe('validateEnv — MODERATION_ENABLED', () => {
  it('defaults to false', () => {
    const env = validateEnv({});
    expect(env.MODERATION_ENABLED).toBe('false');
  });

  it('accepts true', () => {
    const env = validateEnv({ MODERATION_ENABLED: 'true' });
    expect(env.MODERATION_ENABLED).toBe('true');
  });

  it('rejects a non-boolean string', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => validateEnv({ MODERATION_ENABLED: 'yes' })).toThrow();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
