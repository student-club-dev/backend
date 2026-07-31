import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { MediaModule } from '../media/media.module';
import { ProfilePhotoService } from './application/profile-photo.service';
import { ProfileService } from './application/profile.service';
import { PROFILE_PHOTO_REPOSITORY } from './domain/profile-photo.repository';
import {
  BUSINESS_PROFILE_REPOSITORY,
  STUDENT_PROFILE_REPOSITORY,
} from './domain/profile.repository';
import { BusinessOwnerProfilePrismaRepository } from './infrastructure/business-owner-profile.prisma.repository';
import { ProfilePhotoPrismaRepository } from './infrastructure/profile-photo.prisma.repository';
import { StudentProfilePrismaRepository } from './infrastructure/student-profile.prisma.repository';
import { ProfilePhotosController } from './presentation/profile-photos.controller';
import { ProfileController } from './presentation/profile.controller';

/**
 * Single profile endpoint for both account types (D6). Binds both per-type repositories; the
 * service picks one by the token's account type. JwtModule is registered for JwtAuthGuard —
 * the guard verifies the access token with an explicit secret from config.
 */
@Module({
  // MediaModule for `MEDIA_ASSET_REPOSITORY`: a profile photo is an uploaded asset, and the service
  // has to check it is the caller's own, of the right kind, and finished processing.
  imports: [PrismaModule, MediaModule, JwtModule.register({})],
  controllers: [ProfileController, ProfilePhotosController],
  providers: [
    ProfileService,
    ProfilePhotoService,
    JwtAuthGuard,
    StudentGuard,
    { provide: STUDENT_PROFILE_REPOSITORY, useClass: StudentProfilePrismaRepository },
    { provide: BUSINESS_PROFILE_REPOSITORY, useClass: BusinessOwnerProfilePrismaRepository },
    { provide: PROFILE_PHOTO_REPOSITORY, useClass: ProfilePhotoPrismaRepository },
  ],
  exports: [ProfileService, PROFILE_PHOTO_REPOSITORY],
})
export class ProfileModule {}
