import { Module } from '@nestjs/common';
import { AccountType } from '../../common/enums/account-type.enum';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { AuthService } from './application/auth.service';
import { ACCOUNT_REPOSITORY, ACCOUNT_TYPE } from './domain/account.repository';
import { OAUTH_ACCOUNT_REPOSITORY } from './domain/oauth-account.repository';
import { REFRESH_TOKEN_REPOSITORY } from './domain/refresh-token.repository';
import { StudentAccountPrismaRepository } from './infrastructure/student-account.prisma.repository';
import { StudentOAuthAccountPrismaRepository } from './infrastructure/student-oauth-account.prisma.repository';
import { StudentRefreshTokenPrismaRepository } from './infrastructure/student-refresh-token.prisma.repository';
import { OAuthProviderModule } from './oauth-provider.module';
import { StudentAuthController } from './presentation/student-auth.controller';
import { TokenModule } from './token.module';

/** Wires the shared AuthService to the `students` repositories (D6). */
@Module({
  imports: [PrismaModule, TokenModule, OAuthProviderModule],
  controllers: [StudentAuthController],
  providers: [
    AuthService,
    { provide: ACCOUNT_TYPE, useValue: AccountType.STUDENT },
    { provide: ACCOUNT_REPOSITORY, useClass: StudentAccountPrismaRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: StudentRefreshTokenPrismaRepository },
    { provide: OAUTH_ACCOUNT_REPOSITORY, useClass: StudentOAuthAccountPrismaRepository },
  ],
})
export class StudentAuthModule {}
