import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccountType } from '../../common/enums/account-type.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { OtpService } from './application/otp.service';
import { ACCOUNT_REPOSITORY, ACCOUNT_TYPE } from './domain/account.repository';
import { StudentAccountPrismaRepository } from './infrastructure/student-account.prisma.repository';
import { StudentOtpController } from './presentation/student-otp.controller';
import { OtpDeliveryModule } from './otp-delivery.module';

/**
 * Wires the shared OtpService to the `students` table (D6). RedisService is global; SMS_PROVIDER comes
 * from OtpDeliveryModule; JwtModule is registered so JwtAuthGuard can verify the access token.
 */
@Module({
  imports: [PrismaModule, OtpDeliveryModule, JwtModule.register({})],
  controllers: [StudentOtpController],
  providers: [
    OtpService,
    JwtAuthGuard,
    { provide: ACCOUNT_TYPE, useValue: AccountType.STUDENT },
    { provide: ACCOUNT_REPOSITORY, useClass: StudentAccountPrismaRepository },
  ],
})
export class StudentOtpModule {}
