import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../common/guards/student.guard';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { SocialGraphModule } from '../../infrastructure/social-graph/social-graph.module';
import { CallEndedBus } from './application/call-ended.bus';
import { CallRateLimiter } from './application/call-rate-limiter';
import { CallsService } from './application/calls.service';
import { CallsGateway } from './calls.gateway';
import { CALL_REPOSITORY } from './domain/call.repository';
import { CALL_STATE_REPOSITORY } from './domain/call-state.repository';
import { CALL_TIMERS } from './domain/call-timers.repository';
import { CONVERSATION_DIRECTORY } from './domain/conversation-directory.repository';
import { CALL_STUDENT_DIRECTORY } from './domain/student-directory.repository';
import { CallPrismaRepository } from './infrastructure/call.prisma.repository';
import { CallStateRedisRepository } from './infrastructure/call-state.redis.repository';
import { CallTimersQueue } from './infrastructure/call-timers.queue';
import { ConversationDirectoryPrismaRepository } from './infrastructure/conversation-directory.prisma.repository';
import { StudentDirectoryPrismaRepository } from './infrastructure/student-directory.prisma.repository';
import { CallsController } from './presentation/calls.controller';

/**
 * Joins BullMQ's timer worker to the service that acts on a fired timer.
 *
 * A factory, deliberately **not** an `onModuleInit` hook: Nest instantiates every provider before it
 * runs a single init hook, so registering here is guaranteed to happen before
 * `CallTimersQueue.onModuleInit` starts the worker. From a hook it would instead depend on the order
 * of the `providers` array below — reorder it and an overdue job (the app was down across a timer's
 * whole window) fires with no handler, logs an error, and the call is left to the reconciliation
 * cron: 45 seconds of ringing becomes up to 4 hours. The queue cannot import the service itself
 * (cycle), so this is where the two meet.
 */
const CALL_TIMER_HANDLER = Symbol('CALL_TIMER_HANDLER');

/**
 * 1:1 audio/video calling (Phase 1). Signalling over Socket.IO (`/calls`), live state in Redis,
 * history in Postgres, delayed jobs in BullMQ.
 *
 * ⚠️ Imports `SocialGraphModule` — **never** `ChatModule`. Chat imports this module to subscribe to
 * `CallEndedBus`, so the dependency runs one way only: `ChatModule → CallsModule → SocialGraphModule`.
 * The connection check moved to `src/infrastructure/social-graph/` for exactly this reason. If a
 * `forwardRef` ever looks necessary here, something is wired backwards.
 */
@Module({
  imports: [PrismaModule, SocialGraphModule, JwtModule.register({})],
  controllers: [CallsController],
  providers: [
    CallsGateway,
    CallsService,
    CallRateLimiter,
    CallEndedBus,
    CallTimersQueue,
    JwtAuthGuard,
    StudentGuard,
    { provide: CALL_REPOSITORY, useClass: CallPrismaRepository },
    { provide: CALL_STATE_REPOSITORY, useClass: CallStateRedisRepository },
    { provide: CALL_TIMERS, useExisting: CallTimersQueue },
    { provide: CONVERSATION_DIRECTORY, useClass: ConversationDirectoryPrismaRepository },
    { provide: CALL_STUDENT_DIRECTORY, useClass: StudentDirectoryPrismaRepository },
    {
      provide: CALL_TIMER_HANDLER,
      inject: [CallTimersQueue, CallsService],
      useFactory: (timers: CallTimersQueue, calls: CallsService): true => {
        timers.register(async (kind, callId, studentId) => {
          await calls.onTimer(kind, callId, studentId);
        });
        return true;
      },
    },
  ],
  // `CallEndedBus` for ChatModule (the CALL message chat writes when a call ends) and
  // `CALL_REPOSITORY` for CronModule's reconciliation sweep. `CallsService` stays exported per the
  // plan; nothing outside this module injects it today.
  exports: [CallsService, CallEndedBus, CALL_REPOSITORY],
})
export class CallsModule {}
