import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { Env } from '../../../config/env';
import { CallStatsService } from '../application/call-stats.service';
import { CALL_REPOSITORY, CallRepository } from '../domain/call.repository';
import { resolveIceServers } from '../infrastructure/ice-profile';
import { CallDto, CallListDto } from './dto/call.dto';
import { CallStatDto, RecordCallStatsDto } from './dto/call-stats.dto';
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
    private readonly stats: CallStatsService,
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
    'Either the calls feature is switched off (`CALLS_ENABLED=false` — happens in any environment, ' +
      'including production), or, once enabled, TURN is not configured on this deployment ' +
      '(`TURN_HOST`/`TURN_STATIC_SECRET`) — only possible outside production, since the env schema ' +
      'requires both once `CALLS_ENABLED=true`.',
    'Qo‘ng‘iroq xizmati sozlanmagan',
  )
  iceServers(@CurrentUser() user: AuthenticatedUser): IceServersDto {
    const ttlSeconds = this.config.get('TURN_TTL_SECONDS', { infer: true });
    // CALLS_ENABLED is the feature's master switch: while false, this answers 503 regardless of
    // whether TURN happens to be configured. `resolveIceServers` returns null for the second case —
    // the selected provider has no credentials, which the env schema only forbids in production.
    const iceServers =
      this.config.get('CALLS_ENABLED', { infer: true }) !== 'true'
        ? null
        : resolveIceServers(
            {
              provider: this.config.get('ICE_PROVIDER', { infer: true }),
              turnHost: this.config.get('TURN_HOST', { infer: true }),
              turnSecret: this.config.get('TURN_STATIC_SECRET', { infer: true }),
              meteredUsername: this.config.get('METERED_TURN_USERNAME', { infer: true }),
              meteredCredential: this.config.get('METERED_TURN_CREDENTIAL', { infer: true }),
              ttlSeconds,
            },
            user.id,
            Date.now(),
          );
    if (iceServers === null) {
      throw new AppException(ERROR_CODE.NOT_IMPLEMENTED, 503, 'Qo‘ng‘iroq xizmati sozlanmagan');
    }
    return { iceServers, ttlSeconds };
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

  /**
   * Idempotent by design — `200`, not `201`. The row is keyed on `(callId, studentId)` and upserted,
   * so the retry that follows a timed-out request rewrites the same row rather than conflicting.
   *
   * Throttled per student for the same reason `ice-servers` is: `ThrottlerGuard`'s default tracker
   * is `req.ip`, which behind Nginx is one bucket for the whole platform.
   */
  @Post(':callId/stats')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000, getTracker: trackerOf } })
  @ApiOperation({
    summary: 'Tugagan qo‘ng‘iroq sifati',
    description:
      'One participant’s `getStats()` reading, posted once the call is over. Report `candidateType` ' +
      'from the SELECTED candidate pair, not from the candidates that were merely gathered. ' +
      'Re-posting overwrites the previous report for the same call and student.',
  })
  @ApiOkEnvelope(CallStatDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(ERROR_CODE.CALL_NOT_FOUND, 'Qo‘ng‘iroq topilmadi')
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.INVALID_CALL_STATE,
    'The call was never answered, so no media flowed and there is nothing to measure.',
    'Bu qo‘ng‘iroq ulanmagan — o‘lchov uchun ma’lumot yo‘q',
  )
  async recordStats(
    @CurrentUser() user: AuthenticatedUser,
    @Param('callId', new ParseUUIDPipe({ version: '4' })) callId: string,
    @Body() body: RecordCallStatsDto,
  ): Promise<CallStatDto> {
    return CallStatDto.fromDomain(await this.stats.record(user.id, callId, body));
  }
}
