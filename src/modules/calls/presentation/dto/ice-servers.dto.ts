import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One entry of `RTCConfiguration.iceServers`, exactly as WebRTC expects it. */
export class IceServerDto {
  @ApiProperty({ type: [String], example: ['turn:turn.elonuz.uz:3478?transport=udp'] })
  urls!: string[];

  @ApiPropertyOptional({
    description:
      '`<expiryUnixSeconds>:<studentId>` — absent on the STUN entry, which needs no auth.',
  })
  username?: string;

  @ApiPropertyOptional({ description: 'base64(HMAC-SHA1(TURN_STATIC_SECRET, username)).' })
  credential?: string;
}

/** `GET /v1/calls/ice-servers` — a short-lived TURN account plus the STUN server. */
export class IceServersDto {
  @ApiProperty({ type: [IceServerDto] })
  iceServers!: IceServerDto[];

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    description:
      'How long the credential stays valid. Fetch a new one before placing a call once it has ' +
      'expired — the credential is not tied to a call and is not refreshed by one.',
  })
  ttlSeconds!: number;
}
