import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { OTP_DELIVERY_CHANNEL, OtpDeliveryChannel } from './domain/otp/otp-delivery-channel';
import { DevDeliveryChannel } from './infrastructure/otp/dev-delivery.channel';
import { SmsDeliveryChannel } from './infrastructure/otp/sms-delivery.channel';
import { TelegramGatewayChannel } from './infrastructure/otp/telegram-gateway.channel';
import { createOtpDeliveryChannel } from './infrastructure/otp/otp-delivery.factory';
import { SmsProviderModule } from './sms-provider.module';

/**
 * Binds OTP_DELIVERY_CHANNEL to the concrete channel chosen by OTP_CHANNEL (dev | telegram | sms).
 * Imports SmsProviderModule so SmsDeliveryChannel can reuse the existing SMS_PROVIDER.
 */
@Module({
  imports: [SmsProviderModule],
  providers: [
    DevDeliveryChannel,
    TelegramGatewayChannel,
    SmsDeliveryChannel,
    {
      provide: OTP_DELIVERY_CHANNEL,
      inject: [ConfigService, DevDeliveryChannel, TelegramGatewayChannel, SmsDeliveryChannel],
      useFactory: (
        config: ConfigService<Env, true>,
        dev: DevDeliveryChannel,
        telegram: TelegramGatewayChannel,
        sms: SmsDeliveryChannel,
      ): OtpDeliveryChannel =>
        createOtpDeliveryChannel(
          config.get('OTP_CHANNEL', { infer: true }),
          config.get('NODE_ENV', { infer: true }),
          dev,
          telegram,
          sms,
        ),
    },
  ],
  exports: [OTP_DELIVERY_CHANNEL],
})
export class OtpDeliveryModule {}
