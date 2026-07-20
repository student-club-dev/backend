import { Logger } from '@nestjs/common';
import { DevSmsProvider } from './dev-sms.provider';

describe('DevSmsProvider', () => {
  it('logs the message (including the code) and resolves without any external call', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(new DevSmsProvider().send('+998901234567', 'Kod: 111111')).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = logSpy.mock.calls[0][0] as string;
    expect(logged).toContain('+998901234567');
    expect(logged).toContain('111111');
    expect(fetchSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    fetchSpy.mockRestore();
  });
});
