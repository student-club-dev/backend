import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { CONNECTION_CHECK } from './connection-check.repository';
import { ConnectionCheckPrismaRepository } from './connection-check.prisma.repository';

/**
 * Read-only view of the social graph (accepted connections + blocks), shared by `chat` (gates a
 * conversation) and `calls` (gates an invite). Its own module rather than a `ChatModule` export:
 * chat subscribes to the calls module's CallEndedBus, so chat→calls is already taken and exporting
 * from chat would close the loop.
 */
@Module({
  imports: [PrismaModule],
  providers: [{ provide: CONNECTION_CHECK, useClass: ConnectionCheckPrismaRepository }],
  exports: [CONNECTION_CHECK],
})
export class SocialGraphModule {}
