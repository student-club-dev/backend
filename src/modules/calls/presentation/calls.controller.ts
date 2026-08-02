import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StudentGuard } from '../../../common/guards/student.guard';
import {
  ApiErrorEnvelope,
  ApiForbiddenEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { Env } from '../../../config/env';
import { CALL_REPOSITORY, CallRepository } from '../domain/call.repository';
import { buildIceCredential, buildIceServers } from '../infrastructure/ice-credentials';
import { CallDto, CallListDto } from './dto/call.dto';
import { CallsQueryDto } from './dto/calls-query.dto';
import { IceServersDto } from './dto/ice-servers.dto';

/**
 * ⚠️ Per student, not per IP. `ThrottlerGuard`'s default tracker is `req.ip`, Express `trust proxy`
 * is not enabled in this repo, and production sits behind Nginx — so the default would count every
 * request against the proxy's address and turn "10 per minute" into a platform-wide cap that 429s
 * everyone once ten calls have been placed. It also would not be the per-token bucket this endpoint
 * needs: the credential it mints is keyed on the student, so the limit must be too.
 *
 * The IP fallback only applies to a request that reached here without a principal, which the
 * controller-level `JwtAuthGuard` (guards run before the throttler's own resolution) already rejects.
 */
export function trackerOf(request: Record<string, unknown>): string {
  const user = request.user as AuthenticatedUser | undefined;
  if (user !== undefined) {
    return user.id;
  }
  return typeof request.ip === 'string' ? request.ip : 'unknown';
}

/**
 * REST surface for calls: the history list and the TURN credential. Signalling itself is entirely
 * WebSocket (`CallsGateway`) — nothing here touches a live call. Students only, served under `/v1`.
 */
@ApiTags('Calls')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('The caller is not a STUDENT account.')
@UseGuards(JwtAuthGuard, StudentGuard)
@Controller('calls')
export class CallsController {
  constructor(
    @Inject(CALL_REPOSITORY) private readonly calls: CallRepository,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * ⚠️ The student id comes from the token, never from a parameter — this endpoint mints a bearer
   * capability for relay bandwidth, and coturn's per-user quota is keyed on the username. Throttled
   * for the same reason: without it one token farms unlimited credentials.
   */
  @Get('ice-servers')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000, getTracker: trackerOf } })
  @ApiOperation({
    summary: 'Vaqtinchalik TURN/STUN hisobi',
    description:
      'A coturn `use-auth-secret` account valid for `ttlSeconds`. Feed `iceServers` straight into ' +
      '`RTCConfiguration`. Not tied to a call: fetch one before dialling and re-fetch once expired.',
  })
  @ApiOkEnvelope(IceServersDto)
  @ApiErrorEnvelope(
    503,
    ERROR_CODE.NOT_IMPLEMENTED,
    'TURN is not configured on this deployment (`TURN_HOST`/`TURN_STATIC_SECRET`). Only possible ' +
      'outside production — the env schema requires both there.',
    'Qo‘ng‘iroq xizmati sozlanmagan',
  )
  iceServers(@CurrentUser() user: AuthenticatedUser): IceServersDto {
    const host = this.config.get('TURN_HOST', { infer: true });
    const secret = this.config.get('TURN_STATIC_SECRET', { infer: true });
    const ttlSeconds = this.config.get('TURN_TTL_SECONDS', { infer: true });
    // Both are optional in the env schema outside production. Answer 503 rather than reach
    // `createHmac(undefined)`, which would be a 500 with a stack trace instead of a clear answer.
    if (host === undefined || secret === undefined) {
      throw new AppException(ERROR_CODE.NOT_IMPLEMENTED, 503, 'Qo‘ng‘iroq xizmati sozlanmagan');
    }
    const credential = buildIceCredential(secret, user.id, ttlSeconds, Date.now());
    return { iceServers: buildIceServers(host, credential), ttlSeconds };
  }

  @Get()
  @ApiOperation({
    summary: 'Qo‘ng‘iroqlar tarixi',
    description:
      'Newest first. Only the caller’s own calls — the `callerId = me OR calleeId = me` filter ' +
      'runs in SQL, so another student’s call is never loaded, let alone paginated over.',
  })
  @ApiOkEnvelope(CallListDto)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CallsQueryDto,
  ): Promise<CallListDto> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const { items, total } = await this.calls.listForStudent(user.id, page, size);
    return {
      items: items.map((call) => CallDto.fromDomain(call, user.id)),
      page,
      size,
      total,
      hasNext: page * size < total,
    };
  }
}
