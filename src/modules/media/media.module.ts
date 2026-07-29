import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { ChatMediaService } from './application/chat-media.service';
import { MediaReadyBus } from './application/media-ready.bus';
import { VideoTranscoderService } from './application/video-transcoder.service';
import { MEDIA_QUEUE } from './application/chat-media.io';
import { MediaService } from './application/media.service';
import { CHAT_ACCESS } from './domain/chat-access.repository';
import { MEDIA_ASSET_REPOSITORY } from './domain/media-asset.repository';
import { ChatAccessPrismaRepository } from './infrastructure/chat-access.prisma.repository';
import { ChatMediaStorage } from './infrastructure/chat-media.storage';
import { MediaAssetPrismaRepository } from './infrastructure/media-asset.prisma.repository';
import { MediaQueue } from './infrastructure/media.queue';
import { ChatMediaController } from './presentation/chat-media.controller';
import { MediaController } from './presentation/media.controller';

/**
 * Media: the stateless listing-image upload (§6, public URLs) and chat attachments (private, served
 * through an authorised proxy). Both live here because they share the module's guards and Swagger
 * surface, but they deliberately do not share storage.
 */
@Module({
  imports: [StorageModule, PrismaModule, JwtModule.register({})],
  controllers: [MediaController, ChatMediaController],
  providers: [
    MediaService,
    ChatMediaService,
    ChatMediaStorage,
    MediaReadyBus,
    VideoTranscoderService,
    MediaQueue,
    JwtAuthGuard,
    StudentGuard,
    { provide: MEDIA_ASSET_REPOSITORY, useClass: MediaAssetPrismaRepository },
    { provide: CHAT_ACCESS, useClass: ChatAccessPrismaRepository },
    { provide: MEDIA_QUEUE, useExisting: MediaQueue },
  ],
  exports: [ChatMediaService, MEDIA_ASSET_REPOSITORY, MediaReadyBus],
})
export class MediaModule {}
