import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { ProfileService } from './application/profile.service';
import {
  BUSINESS_PROFILE_REPOSITORY,
  STUDENT_PROFILE_REPOSITORY,
} from './domain/profile.repository';
import { BusinessOwnerProfilePrismaRepository } from './infrastructure/business-owner-profile.prisma.repository';
import { StudentProfilePrismaRepository } from './infrastructure/student-profile.prisma.repository';
import { ProfileController } from './presentation/profile.controller';

/**
 * Single profile endpoint for both account types (D6). Binds both per-type repositories; the
 * service picks one by the token's account type. JwtModule is registered for JwtAuthGuard —
 * the guard verifies the access token with an explicit secret from config.
 */
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [ProfileController],
  providers: [
    ProfileService,
    JwtAuthGuard,
    { provide: STUDENT_PROFILE_REPOSITORY, useClass: StudentProfilePrismaRepository },
    { provide: BUSINESS_PROFILE_REPOSITORY, useClass: BusinessOwnerProfilePrismaRepository },
  ],
})
export class ProfileModule {}
