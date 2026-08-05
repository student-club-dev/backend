import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  ApiErrorEnvelope,
  ApiOkEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { OtpService } from '../application/otp.service';
import { OtpRequestResultDto } from './dto/otp-request-result.dto';
import { OtpRequestDto } from './dto/otp-request.dto';

/**
 * The one OTP endpoint that cannot require a token: it is called **before** an account exists.
 *
 * Why it has to exist — `phoneNumber` is unique, so an account created for a number the caller does
 * not own permanently locks out its real owner. The only way to stop that is to prove the number
 * before the row is written, and whoever is proving it has no account to authenticate with yet.
 *
 * Deliberately its own controller rather than a route on `{Student,Business}OtpController`: those
 * are `@UseGuards(JwtAuthGuard)` at the class level and must stay that way. A public route living
 * inside one of them would be one careless edit away from becoming authenticated — or from making
 * the whole class public.
 *
 * ⚠️ Anonymous **and** it spends money: every call sends an SMS. Three limits stand behind it, and
 * they stop different things:
 *
 *  - per-phone cooldown (`OTP_RESEND_COOLDOWN_SECONDS`) — one number, rapid retries;
 *  - per-phone hourly cap (`OTP_MAX_RESEND`) — one number, sustained;
 *  - platform-wide daily cap (`OTP_REGISTRATION_DAILY_CAP`) — **many** numbers, the attack the
 *    per-phone limits cannot see and the one that empties the SMS balance.
 *
 * `@Throttle` is a coarse fourth line and must not be relied on: Express `trust proxy` is off and
 * production sits behind Nginx, so its per-IP tracker sees the proxy's address for every caller.
 *
 * The two classes below differ only in their route and which `OtpService` their module binds —
 * students and business owners are separate tables (D6), so the code and its limits are separate too.
 */

const REQUEST_DESCRIPTION =
  'Call this **before** `register` when signing up with a phone number, then pass the code back as ' +
  '`otpCode`. No token required — there is no account yet.\n\n' +
  'Independent of `POST /otp/request`, which verifies the phone of an account that already exists ' +
  'and needs an access token. A code issued by one is not valid for the other.';

const COOLDOWN_DESCRIPTION =
  'A resend cooldown is active, the hourly limit for this phone was reached ' +
  '(`OTP_COOLDOWN` / `OTP_RESEND_LIMIT`), or the platform-wide daily registration budget is spent ' +
  '(`RATE_LIMITED`).';

@ApiTags('Auth — Student OTP')
@UseGuards(ThrottlerGuard)
@Controller('auth/student/register/otp')
export class StudentRegistrationOtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Ro‘yxatdan o‘tish uchun telefonga kod yuborish',
    description: REQUEST_DESCRIPTION,
  })
  @ApiOkEnvelope(OtpRequestResultDto)
  @ApiErrorEnvelope(
    429,
    ERROR_CODE.OTP_COOLDOWN,
    COOLDOWN_DESCRIPTION,
    'Iltimos, biroz kutib qaytadan urinib ko‘ring',
  )
  @ApiValidationEnvelope('Invalid phone number format.')
  async request(@Body() dto: OtpRequestDto): Promise<OtpRequestResultDto> {
    return OtpRequestResultDto.fromDomain(
      await this.otpService.request(dto.phoneNumber, 'registration'),
    );
  }
}

@ApiTags('Auth — Business OTP')
@UseGuards(ThrottlerGuard)
@Controller('auth/business/register/otp')
export class BusinessRegistrationOtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Ro‘yxatdan o‘tish uchun telefonga kod yuborish',
    description: REQUEST_DESCRIPTION,
  })
  @ApiOkEnvelope(OtpRequestResultDto)
  @ApiErrorEnvelope(
    429,
    ERROR_CODE.OTP_COOLDOWN,
    COOLDOWN_DESCRIPTION,
    'Iltimos, biroz kutib qaytadan urinib ko‘ring',
  )
  @ApiValidationEnvelope('Invalid phone number format.')
  async request(@Body() dto: OtpRequestDto): Promise<OtpRequestResultDto> {
    return OtpRequestResultDto.fromDomain(
      await this.otpService.request(dto.phoneNumber, 'registration'),
    );
  }
}
