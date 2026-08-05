import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { ChatDirectoryModule } from '../../infrastructure/chat-directory/chat-directory.module';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { PresenceModule } from '../../infrastructure/presence/presence.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConnectionsService } from './application/connections.service';
import { ReportsService } from './application/reports.service';
import { CONNECTIONS_REPOSITORY } from './domain/connections.repository';
import { CALL_DIRECTORY } from './domain/call-directory.repository';
import { MESSAGE_DIRECTORY } from './domain/message-directory.repository';
import { REPORTS_REPOSITORY } from './domain/reports.repository';
import { STUDENT_DIRECTORY } from './domain/student-directory.repository';
import { ConnectionPrismaRepository } from './infrastructure/connection.prisma.repository';
import { CallDirectoryPrismaRepository } from './infrastructure/call-directory.prisma.repository';
import { MessageDirectoryPrismaRepository } from './infrastructure/message-directory.prisma.repository';
import { ReportPrismaRepository } from './infrastructure/report.prisma.repository';
import { StudentDirectoryPrismaRepository } from './infrastructure/student-directory.prisma.repository';
import { BlocksController } from './presentation/blocks.controller';
import { ConnectionsController } from './presentation/connections.controller';
import { ReportsController } from './presentation/reports.controller';
import { StudentSearchController } from './presentation/student-search.controller';

/**
 * LinkedIn-style connections, blocks and abuse reports — the gate for student chat (Plan 2).
 * Students-only (JwtAuthGuard + StudentGuard). Repository ports are bound to their Prisma impls.
 */
@Module({
  imports: [
    PrismaModule,
    PresenceModule,
    // A request and its acceptance both raise a notification (push catalogue §3.1 №4/№5), and the
    // acceptance needs the pair's conversation id to point at.
    NotificationsModule,
    ChatDirectoryModule,
    JwtModule.register({}),
  ],
  controllers: [
    StudentSearchController,
    ConnectionsController,
    BlocksController,
    ReportsController,
  ],
  providers: [
    ConnectionsService,
    ReportsService,
    JwtAuthGuard,
    StudentGuard,
    { provide: CONNECTIONS_REPOSITORY, useClass: ConnectionPrismaRepository },
    { provide: REPORTS_REPOSITORY, useClass: ReportPrismaRepository },
    { provide: STUDENT_DIRECTORY, useClass: StudentDirectoryPrismaRepository },
    { provide: MESSAGE_DIRECTORY, useClass: MessageDirectoryPrismaRepository },
    { provide: CALL_DIRECTORY, useClass: CallDirectoryPrismaRepository },
  ],
  // Stories groups its feed by author and needs the full summary for each one.
  exports: [STUDENT_DIRECTORY],
})
export class ConnectionsModule {}
