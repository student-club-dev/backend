import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Env } from '../../config/env';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { ChatMediaService } from './application/chat-media.service';
import { UploadSessionService } from './application/upload-session.service';
import { MediaReadyBus } from './application/media-ready.bus';
import { VideoTranscoderService } from './application/video-transcoder.service';
import { MEDIA_QUEUE } from './application/chat-media.io';
import { MediaService } from './application/media.service';
import { CHAT_ACCESS } from './domain/chat-access.repository';
import { MEDIA_ASSET_REPOSITORY } from './domain/media-asset.repository';
import { UPLOAD_SESSION_REPOSITORY } from './domain/upload-session.repository';
import { ChatAccessPrismaRepository } from './infrastructure/chat-access.prisma.repository';
import { ChatMediaStorage } from './infrastructure/chat-media.storage';
import { MediaAssetPrismaRepository } from './infrastructure/media-asset.prisma.repository';
import { MediaQueue } from './infrastructure/media.queue';
import { UploadPartStorage } from './infrastructure/upload-part.storage';
import { UploadSessionPrismaRepository } from './infrastructure/upload-session.prisma.repository';
import { ChatMediaController } from './presentation/chat-media.controller';
import { MediaController } from './presentation/media.controller';
import { StorageSpaceGuard } from './presentation/storage-space.guard';
import { UploadSessionController } from './presentation/upload-session.controller';

/**
 * Media: the stateless listing-image upload (§6, public URLs) and chat attachments (private, served
 * through an authorised proxy). Both live here because they share the module's guards and Swagger
 * surface, but they deliberately do not share storage.
 */
@Module({
  imports: [
    StorageModule,
    PrismaModule,
    JwtModule.register({}),
    // Uploads go to disk, not to memory. Parity spec §2 removed the size ceiling, and multer's
    // default `memoryStorage` would turn a 2 GB send into 2 GB of heap. The destination sits inside
    // the media root so that accepting a file is a `rename` rather than a second copy of every byte.
    //
    // This is module-wide, so `MediaController` — which serves listing images and genuinely wants a
    // buffer — opts back into `memoryStorage` on its own route.
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        storage: diskStorage({
          destination: join(config.get('CHAT_MEDIA_DIR', { infer: true }), 'tmp'),
        }),
      }),
    }),
  ],
  controllers: [MediaController, ChatMediaController, UploadSessionController],
  providers: [
    MediaService,
    ChatMediaService,
    UploadSessionService,
    ChatMediaStorage,
    UploadPartStorage,
    MediaReadyBus,
    VideoTranscoderService,
    MediaQueue,
    JwtAuthGuard,
    StudentGuard,
    StorageSpaceGuard,
    { provide: MEDIA_ASSET_REPOSITORY, useClass: MediaAssetPrismaRepository },
    { provide: UPLOAD_SESSION_REPOSITORY, useClass: UploadSessionPrismaRepository },
    { provide: CHAT_ACCESS, useClass: ChatAccessPrismaRepository },
    { provide: MEDIA_QUEUE, useExisting: MediaQueue },
  ],
  exports: [ChatMediaService, UploadSessionService, MEDIA_ASSET_REPOSITORY, MediaReadyBus],
})
export class MediaModule {}
