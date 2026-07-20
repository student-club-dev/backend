import { Module } from '@nestjs/common';
import { BusinessAuthModule } from './business-auth.module';
import { StudentAuthModule } from './student-auth.module';
import { TokenModule } from './token.module';

/** Aggregates the shared token core and the two per-type credential-auth modules (D6). */
@Module({
  imports: [TokenModule, StudentAuthModule, BusinessAuthModule],
})
export class AuthModule {}
