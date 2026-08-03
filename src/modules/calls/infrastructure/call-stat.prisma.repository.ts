import { Injectable } from '@nestjs/common';
import type { CallStat as PrismaCallStat } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CallStatRepository, RecordCallStatInput } from '../domain/call-stat.repository';
import { CallStat } from '../domain/entities/call-stat.entity';
import { IceCandidateType } from '../domain/enums/ice-candidate-type.enum';

/** Prisma row → domain object. `BigInt` byte counts become `number`; both stay well under 2^53. */
function toDomainCallStat(row: PrismaCallStat): CallStat {
  return {
    callId: row.callId,
    studentId: row.studentId,
    rttMs: row.rttMs,
    packetsLost: row.packetsLost,
    packetsReceived: row.packetsReceived,
    jitterMs: row.jitterMs,
    bytesSent: row.bytesSent === null ? null : Number(row.bytesSent),
    bytesReceived: row.bytesReceived === null ? null : Number(row.bytesReceived),
    candidateType: row.candidateType as IceCandidateType,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class CallStatPrismaRepository implements CallStatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordCallStatInput): Promise<CallStat> {
    const { callId, studentId, bytesSent, bytesReceived, ...rest } = input;
    // The value written on create and on update is identical, so the two branches cannot drift.
    const values = {
      ...rest,
      bytesSent: bytesSent === null ? null : BigInt(bytesSent),
      bytesReceived: bytesReceived === null ? null : BigInt(bytesReceived),
    };
    const row = await this.prisma.callStat.upsert({
      where: { callId_studentId: { callId, studentId } },
      create: { callId, studentId, ...values },
      update: values,
    });
    return toDomainCallStat(row);
  }
}
