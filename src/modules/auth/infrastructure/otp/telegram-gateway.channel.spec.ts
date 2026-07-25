import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../../config/env';
import { AppException } from '../../../../common/exceptions/app.exception';
import { TelegramGatewayChannel } from './telegram-gateway.channel';

function makeConfig(over: Record<string, unknown> = {}): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    TELEGRAM_GATEWAY_TOKEN: 'tok',
    TELEGRAM_GATEWAY_BASE_URL: 'https://gw.test',
    OTP_TTL_SECONDS: 300,
    ...over,
  };
  return { get: (k: string) => values[k] } as unknown as ConfigService<Env, true>;
}

describe('TelegramGatewayChannel', () => {
  afterEach(() => jest.restoreAllMocks());

  it('POSTs phone_number, code and ttl to the Gateway and resolves on ok:true', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }));

    await new TelegramGatewayChannel(makeConfig()).deliver('+998901234567', '123456');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gw.test/sendVerificationMessage');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      phone_number: '+998901234567',
      code: '123456',
      ttl: 300,
    });
  });

  it('throws AppException when the Gateway returns ok:false', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'x' }), { status: 400 }));

    await expect(
      new TelegramGatewayChannel(makeConfig()).deliver('+998901234567', '123456'),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('throws when the token is not configured', async () => {
    await expect(
      new TelegramGatewayChannel(makeConfig({ TELEGRAM_GATEWAY_TOKEN: undefined })).deliver(
        '+998901234567',
        '123456',
      ),
    ).rejects.toBeInstanceOf(AppException);
  });
});
