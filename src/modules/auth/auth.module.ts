import { Module } from '@nestjs/common';
import { BusinessAuthModule } from './business-auth.module';
import { BusinessOtpModule } from './business-otp.module';
import { StudentAuthModule } from './student-auth.module';
import { StudentOtpModule } from './student-otp.module';
import { TokenModule } from './token.module';

/**
 * Aggregates the shared token core, the two per-type credential-auth modules (D6) and the two
 * per-type OTP / phone-verification modules (D1).
 */
@Module({
  imports: [
    TokenModule,
    StudentAuthModule,
    BusinessAuthModule,
    StudentOtpModule,
    BusinessOtpModule,
  ],
})
export class AuthModule {}
