import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccountType } from '../../common/enums/account-type.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { AuthService } from './application/auth.service';
import { OtpService } from './application/otp.service';
import { ACCOUNT_REPOSITORY, ACCOUNT_TYPE } from './domain/account.repository';
import { OAUTH_ACCOUNT_REPOSITORY } from './domain/oauth-account.repository';
import { REFRESH_TOKEN_REPOSITORY } from './domain/refresh-token.repository';
import { BusinessOwnerAccountPrismaRepository } from './infrastructure/business-owner-account.prisma.repository';
import { BusinessOwnerOAuthAccountPrismaRepository } from './infrastructure/business-owner-oauth-account.prisma.repository';
import { BusinessOwnerRefreshTokenPrismaRepository } from './infrastructure/business-owner-refresh-token.prisma.repository';
import { OAuthProviderModule } from './oauth-provider.module';
import { BusinessAuthController } from './presentation/business-auth.controller';
import { BusinessPasswordController } from './presentation/business-password.controller';
import { BusinessSessionsController } from './presentation/business-sessions.controller';
import { OtpDeliveryModule } from './otp-delivery.module';
import { TokenModule } from './token.module';

/**
 * Wires the shared AuthService to the `business_owners` repositories (D6). OtpService (bound to the
 * same table + SMS provider) backs the password-reset flow; JwtModule is registered so JwtAuthGuard
 * can protect the sessions / set-password endpoints.
 */
@Module({
  imports: [
    PrismaModule,
    TokenModule,
    OAuthProviderModule,
    OtpDeliveryModule,
    JwtModule.register({}),
  ],
  controllers: [BusinessAuthController, BusinessSessionsController, BusinessPasswordController],
  providers: [
    AuthService,
    OtpService,
    JwtAuthGuard,
    { provide: ACCOUNT_TYPE, useValue: AccountType.BUSINESS },
    { provide: ACCOUNT_REPOSITORY, useClass: BusinessOwnerAccountPrismaRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: BusinessOwnerRefreshTokenPrismaRepository },
    { provide: OAUTH_ACCOUNT_REPOSITORY, useClass: BusinessOwnerOAuthAccountPrismaRepository },
  ],
})
export class BusinessAuthModule {}
