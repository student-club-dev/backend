import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { PresenceModule } from '../../infrastructure/presence/presence.module';
import { ConnectionCheckPrismaRepository } from '../chat/infrastructure/connection-check.prisma.repository';
import { ConnectionsModule } from '../connections/connections.module';
import { MediaModule } from '../media/media.module';
import { StoriesService } from './application/stories.service';
import { STORY_AUDIENCE } from './domain/story-audience.repository';
import { STORY_REPOSITORY } from './domain/story.repository';
import { StoryPrismaRepository } from './infrastructure/story.prisma.repository';
import { StoriesController } from './presentation/stories.controller';

/**
 * Stories: 24-hour posts gated by the same connection as chat.
 *
 * `STORY_AUDIENCE` is bound to chat's `ConnectionCheckPrismaRepository` rather than to a second
 * implementation of its own. The two ports ask an identical question of identical tables — "are
 * these two connected, and who is this student connected to" — and two copies of that query is two
 * places for the block rule to drift. The port stays separate so the stories domain still states the
 * question in its own words; only the answer is shared.
 *
 * `ConnectionsModule` is imported for `STUDENT_DIRECTORY`: the feed groups by author and every group
 * carries a full `StudentSummaryDto`.
 */
@Module({
  imports: [PrismaModule, PresenceModule, ConnectionsModule, MediaModule, JwtModule.register({})],
  controllers: [StoriesController],
  providers: [
    StoriesService,
    JwtAuthGuard,
    StudentGuard,
    { provide: STORY_REPOSITORY, useClass: StoryPrismaRepository },
    { provide: STORY_AUDIENCE, useClass: ConnectionCheckPrismaRepository },
  ],
  exports: [StoriesService],
})
export class StoriesModule {}
