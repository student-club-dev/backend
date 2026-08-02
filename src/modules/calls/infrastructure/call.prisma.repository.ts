import { Injectable } from '@nestjs/common';
import { Call as PrismaCall, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { LIVE_STATUSES } from '../domain/call-state-machine';
import {
  CallPage,
  CallRepository,
  CreateCallInput,
  FinishCallInput,
} from '../domain/call.repository';
import { Call } from '../domain/entities/call.entity';
import { CallEndReason } from '../domain/enums/call-end-reason.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { toDomainCall } from './call.mapper';

@Injectable()
export class CallPrismaRepository implements CallRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCallInput): Promise<Call> {
    const row = await this.prisma.call.create({
      data: {
        id: input.id,
        conversationId: input.conversationId,
        callerId: input.callerId,
        calleeId: input.calleeId,
        media: input.media,
        status: CallStatus.RINGING,
      },
    });
    return toDomainCall(row);
  }

  async findById(callId: string): Promise<Call | null> {
    const row = await this.prisma.call.findUnique({ where: { id: callId } });
    return row === null ? null : toDomainCall(row);
  }

  async markActive(callId: string): Promise<boolean> {
    const { count } = await this.prisma.call.updateMany({
      where: { id: callId, status: CallStatus.CONNECTING },
      data: { status: CallStatus.ACTIVE, answeredAt: new Date() },
    });
    return count === 1;
  }

  /**
   * Conditional by design, but only for idempotency: `status IN LIVE_STATUSES` makes a repeated or
   * reconciliation-driven terminal write a no-op — the row is already terminal, so `count` is 0 and
   * this returns `null` — which is what makes a retried `call:end` safe at the database layer. It is
   * NOT transition-specific: RINGING, CONNECTING and ACTIVE all match, so on its own this would let
   * a stale `finish(callId, { status: MISSED })` overwrite a call that has since gone ACTIVE. The
   * accept-versus-ring-timeout race is actually resolved upstream, by the caller winning
   * `CallStateRepository.compareAndSetStatus` (scoped `from` set) in Redis before this is ever
   * called — do not skip that CAS on the assumption this guard covers it.
   */
  async finish(callId: string, input: FinishCallInput): Promise<Call | null> {
    const endedAt = new Date();
    const { count } = await this.prisma.call.updateMany({
      where: { id: callId, status: { in: [...LIVE_STATUSES] } },
      data: {
        status: input.status,
        endReason: input.endReason,
        endedBy: input.endedBy,
        endedAt,
      },
    });
    if (count === 0) {
      return null;
    }
    return this.findById(callId);
  }

  /**
   * `WHERE caller_id = $1 OR callee_id = $1 ORDER BY started_at DESC` makes Postgres BitmapOr the
   * two indexes and then sort — the `started_at` half of each composite index goes unused. Two
   * ordered index scans merged with UNION ALL keep the plan on the indexes; the outer sort then
   * runs over at most 2×(page·size) rows instead of the whole history.
   */
  async listForStudent(studentId: string, page: number, size: number): Promise<CallPage> {
    const take = page * size;
    const skip = (page - 1) * size;
    const [rows, total] = await Promise.all([
      this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT * FROM (
          (SELECT * FROM "calls" WHERE "caller_id" = ${studentId} ORDER BY "started_at" DESC LIMIT ${take})
          UNION ALL
          (SELECT * FROM "calls" WHERE "callee_id" = ${studentId} ORDER BY "started_at" DESC LIMIT ${take})
        ) AS merged
        ORDER BY "started_at" DESC
        LIMIT ${size} OFFSET ${skip}
      `),
      this.prisma.call.count({
        where: { OR: [{ callerId: studentId }, { calleeId: studentId }] },
      }),
    ]);
    return { items: rows.map((row) => toDomainCall(fromSnakeCase(row))), total };
  }

  async hasCompletedCallBetween(a: string, b: string): Promise<boolean> {
    const found = await this.prisma.call.findFirst({
      where: {
        status: CallStatus.ENDED,
        // Defence in depth: `status: ENDED` alone is not proof the pair ever actually spoke — a
        // call ended before it was ever answered (e.g. the caller hangs up their own still-RINGING
        // invite) also reaches ENDED, and this result drives whether TURN is force-relayed for the
        // pair's next call. A never-answered call is not a call this pair has had.
        answeredAt: { not: null },
        OR: [
          { callerId: a, calleeId: b },
          { callerId: b, calleeId: a },
        ],
      },
      select: { id: true },
    });
    return found !== null;
  }

  async expireStale(startedBefore: Date): Promise<number> {
    const { count } = await this.prisma.call.updateMany({
      where: { status: { in: [...LIVE_STATUSES] }, startedAt: { lt: startedBefore } },
      data: { status: CallStatus.FAILED, endReason: CallEndReason.FAILED, endedAt: new Date() },
    });
    return count;
  }
}

/** `$queryRaw` returns the physical column names; the mapper expects the Prisma field names. */
function fromSnakeCase(row: Record<string, unknown>): PrismaCall {
  return {
    id: row.id as PrismaCall['id'],
    conversationId: row.conversation_id as PrismaCall['conversationId'],
    callerId: row.caller_id as PrismaCall['callerId'],
    calleeId: row.callee_id as PrismaCall['calleeId'],
    media: row.media as PrismaCall['media'],
    status: row.status as PrismaCall['status'],
    startedAt: row.started_at as PrismaCall['startedAt'],
    answeredAt: row.answered_at as PrismaCall['answeredAt'],
    endedAt: row.ended_at as PrismaCall['endedAt'],
    endReason: row.end_reason as PrismaCall['endReason'],
    endedBy: row.ended_by as PrismaCall['endedBy'],
    updatedAt: row.updated_at as PrismaCall['updatedAt'],
  };
}
