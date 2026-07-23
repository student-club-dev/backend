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
    });
    expect(env.PUBLIC_MEDIA_BASE_URL).toBe('https://api.studentclub.uz/uploads');
  });

  it('allows the localhost default outside production', () => {
    const env = validateEnv({ NODE_ENV: 'development' });
    expect(env.PUBLIC_MEDIA_BASE_URL).toBe('http://localhost:3000/uploads');
  });
});
