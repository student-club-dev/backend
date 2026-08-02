import { plainToInstance } from 'class-transformer';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  validate,
} from 'class-validator';
import { AppException } from '../../../../common/exceptions/app.exception';
import { CallMedia } from '../../domain/enums/call-media.enum';

/** Student ids are cuids. ⚠️ `callId` is NOT — it is a uuid v4 (36 chars), see `@IsUUID` below. */
const STUDENT_ID = { min: 20, max: 32 } as const;
/** An SDP offer with many codecs is a few KB; 64 KB is generous and still bounded. */
const SDP_MAX = 65_536;
const CANDIDATE_MAX = 512;

export class CallIdDto {
  // ⚠️ uuid, not cuid. `Call.id` is generated with `node:crypto.randomUUID()` because the id must
  // exist before the row does (it claims the Redis busy keys first). A `@Length(20, 32)` check —
  // correct for student ids — would reject all 36 characters of every callId the client echoes
  // back, breaking every event after `call:invite`.
  @IsUUID('4')
  callId!: string;
}

export class InviteDto {
  @IsString()
  @Length(STUDENT_ID.min, STUDENT_ID.max)
  calleeId!: string;

  @IsEnum(CallMedia)
  media!: CallMedia;

  @IsString()
  @IsNotEmpty()
  @MaxLength(SDP_MAX)
  sdp!: string;
}

export class AcceptDto extends CallIdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(SDP_MAX)
  sdp!: string;
}

export class DeclineDto extends CallIdDto {
  @IsIn(['DECLINED', 'BUSY'])
  reason!: 'DECLINED' | 'BUSY';
}

class IceCandidateDto {
  @IsString()
  @MaxLength(CANDIDATE_MAX)
  candidate!: string;

  @IsString()
  @MaxLength(32)
  sdpMid!: string;

  @IsInt()
  @Min(0)
  @Max(64)
  sdpMLineIndex!: number;
}

export class IceDto extends CallIdDto {
  @IsObject()
  @ValidateNested()
  @Type(() => IceCandidateDto)
  candidate!: IceCandidateDto;
}

export class RenegotiateDto extends CallIdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(SDP_MAX)
  sdp!: string;
}

export class MediaStateDto extends CallIdDto {
  @IsBoolean()
  audioEnabled!: boolean;

  @IsBoolean()
  videoEnabled!: boolean;
}

/**
 * `call:auth` (design §6.4) — lets a socket hand over a freshly-refreshed access token without
 * reconnecting, so a call that outlives the 15-minute access token does not also outlive the
 * socket's ability to answer/accept. A real JWT is a few hundred bytes; 4 KB is generous headroom.
 */
export class AuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;
}

/**
 * Validate a WebSocket payload explicitly.
 *
 * The global `ValidationPipe` cannot do this: it skips any parameter whose metatype is `Object`,
 * which is every `@MessageBody()` typed as an interface. Without an explicit call, `callId` could
 * arrive as an array and be used as a Redis key, and `sdp` could be a megabyte that the Redis
 * adapter then fans out to every instance.
 */
export async function validateWsPayload<T extends object>(
  cls: new () => T,
  payload: unknown,
): Promise<T> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw AppException.validation({ payload: 'Ma’lumot noto‘g‘ri' });
  }
  const instance = plainToInstance(cls, payload, { enableImplicitConversion: false });
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });
  if (errors.length > 0) {
    const fields: Record<string, string> = {};
    for (const error of errors) {
      fields[error.property] = Object.values(error.constraints ?? {})[0] ?? 'Noto‘g‘ri qiymat';
    }
    throw AppException.validation(fields);
  }
  return instance;
}
