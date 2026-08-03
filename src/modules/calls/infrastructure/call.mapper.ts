import type { Call as PrismaCall } from '@prisma/client';
import { Call } from '../domain/entities/call.entity';
import { CallEndReason } from '../domain/enums/call-end-reason.enum';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallParty } from '../domain/enums/call-party.enum';
import { CallStatus } from '../domain/enums/call-status.enum';

/** Prisma row → domain object. Keeps the generated client out of application and domain code. */
export function toDomainCall(row: PrismaCall): Call {
  return {
    id: row.id,
    conversationId: row.conversationId,
    callerId: row.callerId,
    calleeId: row.calleeId,
    media: row.media as CallMedia,
    relayOnly: row.relayOnly,
    status: row.status as CallStatus,
    startedAt: row.startedAt,
    answeredAt: row.answeredAt,
    endedAt: row.endedAt,
    endReason: row.endReason === null ? null : (row.endReason as CallEndReason),
    endedBy: row.endedBy === null ? null : (row.endedBy as CallParty),
  };
}
