import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { SMS_PROVIDER, SmsProvider } from './domain/sms/sms-provider';
import { DevSmsProvider } from './infrastructure/sms/dev-sms.provider';
import { EskizSmsProvider } from './infrastructure/sms/eskiz-sms.provider';
import { createSmsProvider } from './infrastructure/sms/sms-provider.factory';

/**
 * Binds the SMS_PROVIDER token to the concrete provider chosen by SMS_PROVIDER (dev | eskiz). Both
 * implementations are constructed; the factory picks one and fails fast if Dev is selected in
 * production. Mirrors the OAuth provider registry — OtpService depends on the interface only.
 */
@Module({
  providers: [
    DevSmsProvider,
    EskizSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, DevSmsProvider, EskizSmsProvider],
      useFactory: (
        config: ConfigService<Env, true>,
        dev: DevSmsProvider,
        eskiz: EskizSmsProvider,
      ): SmsProvider =>
        createSmsProvider(
          config.get('SMS_PROVIDER', { infer: true }),
          config.get('NODE_ENV', { infer: true }),
          dev,
          eskiz,
        ),
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsProviderModule {}
