import { ApiProperty } from '@nestjs/swagger';
import { Call, durationMsOf, partyOf } from '../../domain/entities/call.entity';
import { CallEndReason } from '../../domain/enums/call-end-reason.enum';
import { CallMedia } from '../../domain/enums/call-media.enum';
import { CallParty } from '../../domain/enums/call-party.enum';
import { CallStatus } from '../../domain/enums/call-status.enum';

/** Which way the call went, from the reader's side. */
export type CallDirection = 'INCOMING' | 'OUTGOING';

/** One row of the call history. */
export class CallDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  conversationId!: string;

  @ApiProperty({ description: 'The other party — never the reader.' })
  peerId!: string;

  @ApiProperty({
    enum: ['INCOMING', 'OUTGOING'],
    enumName: 'CallDirectionDto',
    description: 'Relative to the authenticated student, not to the row.',
  })
  direction!: CallDirection;

  @ApiProperty({ enum: CallMedia, enumName: 'CallMediaDto' })
  media!: CallMedia;

  @ApiProperty({ enum: CallStatus, enumName: 'CallStatusDto' })
  status!: CallStatus;

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  answeredAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endedAt!: string | null;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    description: 'Milliseconds of actual conversation; 0 when the call was never answered.',
  })
  durationMs!: number;

  @ApiProperty({ enum: CallEndReason, enumName: 'CallEndReasonDto', nullable: true })
  endReason!: CallEndReason | null;

  @ApiProperty({ enum: CallParty, enumName: 'CallPartyDto', nullable: true })
  endedBy!: CallParty | null;

  static fromDomain(call: Call, viewerId: string): CallDto {
    const dto = new CallDto();
    dto.id = call.id;
    dto.conversationId = call.conversationId;
    // `partyOf` returns null only for a non-participant, and the repository filters those out in
    // SQL — treat an unexpected null as INCOMING rather than leaking the reader's own id as `peerId`.
    const party = partyOf(call, viewerId);
    dto.direction = party === CallParty.CALLER ? 'OUTGOING' : 'INCOMING';
    dto.peerId = party === CallParty.CALLER ? call.calleeId : call.callerId;
    dto.media = call.media;
    dto.status = call.status;
    dto.startedAt = call.startedAt.toISOString();
    dto.answeredAt = call.answeredAt?.toISOString() ?? null;
    dto.endedAt = call.endedAt?.toISOString() ?? null;
    dto.durationMs = durationMsOf(call);
    dto.endReason = call.endReason;
    dto.endedBy = call.endedBy;
    return dto;
  }
}

/** `GET /v1/calls` — the project pagination envelope (`items/page/size/total/hasNext`). */
export class CallListDto {
  @ApiProperty({ type: [CallDto] })
  items!: CallDto[];

  @ApiProperty({ type: 'integer', format: 'int32' })
  page!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  size!: number;

  @ApiProperty({ type: 'integer', format: 'int32' })
  total!: number;

  @ApiProperty()
  hasNext!: boolean;
}
