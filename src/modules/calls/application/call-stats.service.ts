import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { CALL_STAT_REPOSITORY, CallStatRepository } from '../domain/call-stat.repository';
import { CALL_REPOSITORY, CallRepository } from '../domain/call.repository';
import { CallStat } from '../domain/entities/call-stat.entity';
import { partyOf } from '../domain/entities/call.entity';
import { IceCandidateType } from '../domain/enums/ice-candidate-type.enum';

export interface RecordStatsInput {
  candidateType: IceCandidateType;
  rttMs?: number;
  jitterMs?: number;
  packetsLost?: number;
  packetsReceived?: number;
  bytesSent?: number;
  bytesReceived?: number;
}

/**
 * Accepts the post-call quality report one participant's client produces.
 *
 * Split out of `CallsService` on purpose: nothing here touches Redis, BullMQ or the state machine.
 * It runs strictly after a call is over and cannot affect a live one.
 */
@Injectable()
export class CallStatsService {
  constructor(
    @Inject(CALL_REPOSITORY) private readonly calls: CallRepository,
    @Inject(CALL_STAT_REPOSITORY) private readonly stats: CallStatRepository,
  ) {}

  async record(studentId: string, callId: string, input: RecordStatsInput): Promise<CallStat> {
    const call = await this.calls.findById(callId);
    if (call === null) {
      throw AppException.notFound(ERROR_CODE.CALL_NOT_FOUND, 'Qo‘ng‘iroq topilmadi');
    }
    // 403, not 404 (CLAUDE.md): a non-participant is refused, and is not told whether the call
    // exists. `studentId` is the token subject, so this is also what stops one participant from
    // writing a row attributed to the other.
    if (partyOf(call, studentId) === null) {
      throw AppException.forbidden();
    }
    // A call that was never answered carried no media, so there is no candidate pair to have been
    // selected and nothing to measure. Rejecting it keeps the table meaning "calls that actually
    // connected" — the exact population the relay-share and bandwidth questions are asked about.
    // Without this, a client could file RELAY rows for calls that never cost a byte.
    if (call.answeredAt === null) {
      throw AppException.conflict(
        ERROR_CODE.INVALID_CALL_STATE,
        'Bu qo‘ng‘iroq ulanmagan — o‘lchov uchun ma’lumot yo‘q',
      );
    }
    return this.stats.record({
      callId,
      studentId,
      candidateType: input.candidateType,
      rttMs: input.rttMs ?? null,
      jitterMs: input.jitterMs ?? null,
      packetsLost: input.packetsLost ?? null,
      packetsReceived: input.packetsReceived ?? null,
      bytesSent: input.bytesSent ?? null,
      bytesReceived: input.bytesReceived ?? null,
    });
  }
}
