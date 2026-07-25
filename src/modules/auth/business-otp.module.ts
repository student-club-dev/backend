import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccountType } from '../../common/enums/account-type.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { OtpService } from './application/otp.service';
import { ACCOUNT_REPOSITORY, ACCOUNT_TYPE } from './domain/account.repository';
import { BusinessOwnerAccountPrismaRepository } from './infrastructure/business-owner-account.prisma.repository';
import { BusinessOtpController } from './presentation/business-otp.controller';
import { OtpDeliveryModule } from './otp-delivery.module';

/**
 * Wires the shared OtpService to the `business_owners` table (D6). RedisService is global; SMS_PROVIDER
 * comes from OtpDeliveryModule; JwtModule is registered so JwtAuthGuard can verify the access token.
 */
@Module({
  imports: [PrismaModule, OtpDeliveryModule, JwtModule.register({})],
  controllers: [BusinessOtpController],
  providers: [
    OtpService,
    JwtAuthGuard,
    { provide: ACCOUNT_TYPE, useValue: AccountType.BUSINESS },
    { provide: ACCOUNT_REPOSITORY, useClass: BusinessOwnerAccountPrismaRepository },
  ],
})
export class BusinessOtpModule {}
