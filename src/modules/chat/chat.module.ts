import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatService } from './application/chat.service';
import { ChatGateway } from './chat.gateway';
import { CHAT_REPOSITORY } from './domain/chat.repository';
import { CONNECTION_CHECK } from './domain/connection-check.repository';
import { PRESENCE_REPOSITORY } from './domain/presence.repository';
import { ChatPrismaRepository } from './infrastructure/chat.prisma.repository';
import { ConnectionCheckPrismaRepository } from './infrastructure/connection-check.prisma.repository';
import { PresenceRedisRepository } from './infrastructure/presence.redis.repository';
import { ConversationsController } from './presentation/conversations.controller';

/**
 * Student↔student chat (Plan 2). 1:1 conversations gated by an accepted connection. REST +
 * Socket.IO gateway; presence in Redis (global). `RedisService` is provided globally by RedisModule.
 */
@Module({
  imports: [PrismaModule, JwtModule.register({}), NotificationsModule],
  controllers: [ConversationsController],
  providers: [
    ChatService,
    ChatGateway,
    JwtAuthGuard,
    StudentGuard,
    { provide: CHAT_REPOSITORY, useClass: ChatPrismaRepository },
    { provide: PRESENCE_REPOSITORY, useClass: PresenceRedisRepository },
    { provide: CONNECTION_CHECK, useClass: ConnectionCheckPrismaRepository },
  ],
})
export class ChatModule {}
