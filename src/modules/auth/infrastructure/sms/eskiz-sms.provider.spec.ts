import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AppException } from '../../../../common/exceptions/app.exception';
import type { Env } from '../../../../config/env';
import { EskizSmsProvider } from './eskiz-sms.provider';

const BASE = 'https://notify.eskiz.uz';

function makeConfig(): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    ESKIZ_EMAIL: 'a@b.com',
    ESKIZ_PASSWORD: 'secret',
    ESKIZ_FROM: '4546',
    ESKIZ_BASE_URL: BASE,
  };
  return { get: (key: string): unknown => values[key] } as unknown as ConfigService<Env, true>;
}

const loginOk = (token: string): unknown => ({
  ok: true,
  status: 200,
  json: async (): Promise<unknown> => ({ data: { token } }),
});
const withStatus = (status: number): unknown => ({
  ok: status >= 200 && status < 300,
  status,
  json: async (): Promise<unknown> => ({}),
});

describe('EskizSmsProvider', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs in for a bearer token, then sends the SMS', async () => {
    fetchMock.mockResolvedValueOnce(loginOk('tkn')).mockResolvedValueOnce(withStatus(200));

    await expect(
      new EskizSmsProvider(makeConfig()).send('+998901234567', 'hi'),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/auth/login`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/api/message/sms/send`);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer tkn');
  });

  it('caches the token across sends (logs in only once)', async () => {
    fetchMock
      .mockResolvedValueOnce(loginOk('tkn'))
      .mockResolvedValueOnce(withStatus(200))
      .mockResolvedValueOnce(withStatus(200));

    const provider = new EskizSmsProvider(makeConfig());
    await provider.send('+998901234567', 'a');
    await provider.send('+998901234567', 'b');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('re-logs in and retries once on a 401', async () => {
    fetchMock
      .mockResolvedValueOnce(loginOk('old'))
      .mockResolvedValueOnce(withStatus(401))
      .mockResolvedValueOnce(loginOk('new'))
      .mockResolvedValueOnce(withStatus(200));

    await expect(
      new EskizSmsProvider(makeConfig()).send('+998901234567', 'hi'),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2][0]).toBe(`${BASE}/api/auth/login`);
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe('Bearer new');
  });

  it('throws AppException when the send ultimately fails', async () => {
    fetchMock.mockResolvedValueOnce(loginOk('tkn')).mockResolvedValueOnce(withStatus(500));

    await expect(
      new EskizSmsProvider(makeConfig()).send('+998901234567', 'hi'),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('throws AppException when login fails', async () => {
    fetchMock.mockResolvedValueOnce(withStatus(401));

    await expect(
      new EskizSmsProvider(makeConfig()).send('+998901234567', 'hi'),
    ).rejects.toBeInstanceOf(AppException);
  });
});
