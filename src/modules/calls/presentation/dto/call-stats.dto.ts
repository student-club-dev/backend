import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CallStat } from '../../domain/entities/call-stat.entity';
import { IceCandidateType } from '../../domain/enums/ice-candidate-type.enum';

/** One byte over a terabyte in a single call is not a measurement, it is a bug or an attack. */
const MAX_BYTES = 1_099_511_627_776;

/**
 * `POST /v1/calls/{callId}/stats` — what one participant's client observed, taken from
 * `RTCPeerConnection.getStats()` after the call ended.
 *
 * ⚠️ Deliberately no `studentId`: it comes from the access token. Accepting it here would let any
 * participant write a row attributed to the other side.
 *
 * Read `candidateType` off the **selected** candidate pair — the `RTCIceCandidatePairStats` whose
 * `state` is `succeeded` and which is `nominated` — then resolve `localCandidateId` /
 * `remoteCandidateId` to their candidate entries and report `RELAY` if **either** end is a relay
 * candidate. Reporting "a relay candidate was gathered" instead would mark almost every call as
 * relayed and make the number useless: relay candidates are gathered constantly and mostly unused.
 *
 * Every numeric field is optional — a call that failed before media flowed has no meaningful
 * numbers, and a partial report is more useful than none. The bounds exist to keep a modified
 * client from poisoning the aggregate, not because real calls approach them.
 */
export class RecordCallStatsDto {
  @ApiProperty({
    enum: IceCandidateType,
    description:
      'Type of the SELECTED candidate pair — `RELAY` only when media actually went through TURN.',
  })
  @IsEnum(IceCandidateType)
  candidateType!: IceCandidateType;

  @ApiPropertyOptional({ type: 'integer', format: 'int32', minimum: 0, maximum: 60_000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60_000)
  rttMs?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int32', minimum: 0, maximum: 10_000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  jitterMs?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int32', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  packetsLost?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int32', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  packetsReceived?: number;

  @ApiPropertyOptional({
    type: 'integer',
    format: 'int64',
    minimum: 0,
    description: 'Bytes this participant sent. The TURN bandwidth forecast is built on this.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_BYTES)
  bytesSent?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int64', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_BYTES)
  bytesReceived?: number;
}

/** What was stored, echoed back so a client can confirm its report landed. */
export class CallStatDto {
  @ApiProperty()
  callId!: string;

  @ApiProperty({ enum: IceCandidateType })
  candidateType!: IceCandidateType;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true })
  rttMs!: number | null;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true })
  jitterMs!: number | null;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true })
  packetsLost!: number | null;

  @ApiProperty({ type: 'integer', format: 'int32', nullable: true })
  packetsReceived!: number | null;

  @ApiProperty({ type: 'integer', format: 'int64', nullable: true })
  bytesSent!: number | null;

  @ApiProperty({ type: 'integer', format: 'int64', nullable: true })
  bytesReceived!: number | null;

  @ApiProperty({ format: 'date-time' })
  recordedAt!: string;

  static fromDomain(stat: CallStat): CallStatDto {
    return {
      callId: stat.callId,
      candidateType: stat.candidateType,
      rttMs: stat.rttMs,
      jitterMs: stat.jitterMs,
      packetsLost: stat.packetsLost,
      packetsReceived: stat.packetsReceived,
      bytesSent: stat.bytesSent,
      bytesReceived: stat.bytesReceived,
      recordedAt: stat.createdAt.toISOString(),
    };
  }
}
