import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { CONVERSATION_DIRECTORY } from './conversation-directory.repository';
import { ConversationDirectoryPrismaRepository } from './conversation-directory.prisma.repository';

/**
 * Resolves a pair of students to their 1:1 conversation, for features that need the id without
 * being part of chat.
 *
 * Shared rather than owned by one module because two now need it and the import direction is
 * already taken in both cases: chat subscribes to calls' `CallEndedBus`, so calls cannot import
 * chat; and a connection acceptance has to name the conversation the two students may now use
 * (push catalogue §3.1 №5). Duplicating the find-or-create — whose whole subtlety is the glare
 * case, two callers inserting the same `direct_key` in the same instant — is exactly the kind of
 * copy that drifts.
 */
@Module({
  imports: [PrismaModule],
  providers: [{ provide: CONVERSATION_DIRECTORY, useClass: ConversationDirectoryPrismaRepository }],
  exports: [CONVERSATION_DIRECTORY],
})
export class ChatDirectoryModule {}
