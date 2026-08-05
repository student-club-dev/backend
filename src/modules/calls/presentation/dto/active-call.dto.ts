import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { CallState } from '../../domain/entities/call.entity';
import { CallMedia } from '../../domain/enums/call-media.enum';
import { CallStatus } from '../../domain/enums/call-status.enum';

/** The other party on a live call — enough to draw a ringing screen and nothing more. */
export class CallPeerDto {
  @ApiProperty({ example: 'std_01HX2E4Q7Z' })
  id!: string;

  @ApiProperty({ example: 'Aziz Karimov' })
  fullName!: string;

  @ApiProperty({ type: String, nullable: true, example: 'aziz' })
  username!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'https://cdn.studentclub.uz/a.webp' })
  avatarUrl!: string | null;
}

/** The live call itself (calls spec §5.6). */
export class ActiveCallDto {
  @ApiProperty({ example: 'cal_01J7Z8Q3M2' })
  callId!: string;

  @ApiProperty({ example: 'cnv_01HX2E4Q7Z' })
  conversationId!: string;

  @ApiProperty({ enum: CallStatus, enumName: 'CallStatusDto' })
  state!: CallStatus;

  @ApiProperty({ enum: CallMedia, enumName: 'CallMediaDto' })
  media!: CallMedia;

  @ApiProperty({
    type: Boolean,
    description: 'True when the caller is the other party — i.e. this is a call to answer.',
  })
  incoming!: boolean;

  @ApiProperty({
    allOf: [{ $ref: getSchemaPath(CallPeerDto) }],
    nullable: true,
    description: 'The other participant. Null only if their account has since disappeared.',
  })
  peer!: CallPeerDto | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'When ringing stops, ISO-8601. Already in the past means the call is over — treat it exactly ' +
      'like `call: null`.',
  })
  expiresAt!: string;
}

/**
 * `GET /v1/calls/active` payload.
 *
 * A wrapper around a nullable `call` rather than a bare nullable body, so "no active call" is a
 * `200` with `call: null` instead of a `404` the client would have to distinguish from a routing
 * error. `null` is the *expected* answer here, not a failure — it is what a phone woken by a stale
 * VoIP push gets, and acting on it is how it stops ringing.
 */
export class ActiveCallResponseDto {
  // `allOf` + `nullable`, never `$ref` + `nullable`: in OpenAPI 3.0 a sibling of `$ref` is ignored,
  // so the plain form would generate a non-null type and the client would crash on exactly the
  // answer this endpoint exists to give.
  @ApiProperty({
    allOf: [{ $ref: getSchemaPath(ActiveCallDto) }],
    nullable: true,
    description: 'Null when there is no live call — close the CallKit session immediately.',
  })
  call!: ActiveCallDto | null;

  static fromState(
    state: CallState,
    viewerId: string,
    peer: CallPeerDto | null,
    expiresAt: Date,
  ): ActiveCallResponseDto {
    const dto = new ActiveCallDto();
    dto.callId = state.callId;
    dto.conversationId = state.conversationId;
    dto.state = state.status;
    dto.media = state.media;
    dto.incoming = state.calleeId === viewerId;
    dto.peer = peer;
    dto.expiresAt = expiresAt.toISOString();
    return { call: dto } satisfies ActiveCallResponseDto;
  }

  static empty(): ActiveCallResponseDto {
    return { call: null };
  }
}
