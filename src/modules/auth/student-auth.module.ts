import { Module } from '@nestjs/common';
import { AccountType } from '../../common/enums/account-type.enum';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { AuthService } from './application/auth.service';
import { ACCOUNT_REPOSITORY, ACCOUNT_TYPE } from './domain/account.repository';
import { REFRESH_TOKEN_REPOSITORY } from './domain/refresh-token.repository';
import { StudentAccountPrismaRepository } from './infrastructure/student-account.prisma.repository';
import { StudentRefreshTokenPrismaRepository } from './infrastructure/student-refresh-token.prisma.repository';
import { StudentAuthController } from './presentation/student-auth.controller';
import { TokenModule } from './token.module';

/** Wires the shared AuthService to the `students` repositories (D6). */
@Module({
  imports: [PrismaModule, TokenModule],
  controllers: [StudentAuthController],
  providers: [
    AuthService,
    { provide: ACCOUNT_TYPE, useValue: AccountType.STUDENT },
    { provide: ACCOUNT_REPOSITORY, useClass: StudentAccountPrismaRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: StudentRefreshTokenPrismaRepository },
  ],
})
export class StudentAuthModule {}
