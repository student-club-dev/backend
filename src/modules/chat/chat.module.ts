import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { PresenceModule } from '../../infrastructure/presence/presence.module';
import { SocialGraphModule } from '../../infrastructure/social-graph/social-graph.module';
import { CallsModule } from '../calls/calls.module';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatService } from './application/chat.service';
import { ChatGateway } from './chat.gateway';
import { CHAT_REPOSITORY } from './domain/chat.repository';
import { STICKER_DIRECTORY } from './domain/sticker-directory.repository';
import { ChatPrismaRepository } from './infrastructure/chat.prisma.repository';
import { StickerDirectoryPrismaRepository } from './infrastructure/sticker-directory.prisma.repository';
import { ConversationsController } from './presentation/conversations.controller';
import { MessagesController } from './presentation/messages.controller';

/**
 * Student↔student chat (Plan 2). 1:1 conversations gated by an accepted connection. REST +
 * Socket.IO gateway; presence in Redis (global). `RedisService` is provided globally by RedisModule.
 */
@Module({
  imports: [
    PrismaModule,
    PresenceModule,
    SocialGraphModule,
    JwtModule.register({}),
    NotificationsModule,
    MediaModule,
    // For `CallEndedBus` — `ChatGateway` subscribes, `CallsService` publishes, and they must be the
    // same instance (mirrors MediaReadyBus/MediaModule). Importing it here rather than re-providing
    // the bus is what makes that true. One way only: CallsModule must never import ChatModule.
    CallsModule,
  ],
  controllers: [ConversationsController, MessagesController],
  providers: [
    ChatService,
    ChatGateway,
    JwtAuthGuard,
    StudentGuard,
    { provide: CHAT_REPOSITORY, useClass: ChatPrismaRepository },
    { provide: STICKER_DIRECTORY, useClass: StickerDirectoryPrismaRepository },
  ],
  // For CronModule's weekly purge (§B1). Service only — the repository stays private.
  exports: [ChatService],
})
export class ChatModule {}
