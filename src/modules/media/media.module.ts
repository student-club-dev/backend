import { Logger, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { ChatMediaService } from './application/chat-media.service';
import { MEDIA_QUEUE, type MediaQueuePort } from './application/chat-media.io';
import { MediaService } from './application/media.service';
import { CHAT_ACCESS } from './domain/chat-access.repository';
import { MEDIA_ASSET_REPOSITORY } from './domain/media-asset.repository';
import { ChatAccessPrismaRepository } from './infrastructure/chat-access.prisma.repository';
import { ChatMediaStorage } from './infrastructure/chat-media.storage';
import { MediaAssetPrismaRepository } from './infrastructure/media-asset.prisma.repository';
import { ChatMediaController } from './presentation/chat-media.controller';
import { MediaController } from './presentation/media.controller';

/**
 * Placeholder transcode queue. Uploads that need re-encoding are stored and marked `PROCESSING`; the
 * BullMQ worker that drains them lands with the video slice. Until then the asset simply stays in
 * `PROCESSING` rather than silently claiming to be ready.
 */
const pendingQueue: MediaQueuePort = {
  async enqueueTranscode(assetId: string): Promise<void> {
    new Logger('MediaQueue').warn(
      `Transcode requested for ${assetId} but no worker is wired yet — asset stays PROCESSING`,
    );
  },
};

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
    JwtAuthGuard,
    StudentGuard,
    { provide: MEDIA_ASSET_REPOSITORY, useClass: MediaAssetPrismaRepository },
    { provide: CHAT_ACCESS, useClass: ChatAccessPrismaRepository },
    { provide: MEDIA_QUEUE, useValue: pendingQueue },
  ],
  exports: [ChatMediaService, MEDIA_ASSET_REPOSITORY],
})
export class MediaModule {}
