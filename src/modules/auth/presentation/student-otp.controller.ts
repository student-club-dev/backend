import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ApiErrorEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { OtpService } from '../application/otp.service';
import { OtpRequestResultDto } from './dto/otp-request-result.dto';
import { OtpRequestDto } from './dto/otp-request.dto';
import { OtpVerifyResultDto } from './dto/otp-verify-result.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';

/**
 * Phone verification for the student app (D1). Guard-protected — the account comes from the access
 * token; `OtpService` is bound to the `students` table. IP-throttled on top of the per-phone limits.
 */
@ApiTags('Auth — Student OTP')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Controller('auth/student/otp')
export class StudentOtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('request')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send an OTP to the phone number to verify' })
  @ApiOkEnvelope(OtpRequestResultDto)
  @ApiErrorEnvelope(
    429,
    ERROR_CODE.OTP_COOLDOWN,
    'A resend cooldown is active, or the hourly SMS limit for this phone was reached (`OTP_COOLDOWN` / `OTP_RESEND_LIMIT`), or the per-IP rate limit was exceeded (`RATE_LIMITED`).',
    'Iltimos, biroz kutib qaytadan urinib ko‘ring',
  )
  @ApiValidationEnvelope('Invalid phone number format.')
  async request(@Body() dto: OtpRequestDto): Promise<OtpRequestResultDto> {
    const result = await this.otpService.request(dto.phoneNumber, 'phone_verify');
    return OtpRequestResultDto.fromDomain(result);
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Verify the OTP and mark the account's phone as verified" })
  @ApiOkEnvelope(OtpVerifyResultDto)
  @ApiErrorEnvelope(
    410,
    ERROR_CODE.OTP_EXPIRED,
    'The code expired or was never requested for this phone.',
    'Kod eskirgan yoki topilmadi, qaytadan so‘rang',
  )
  @ApiErrorEnvelope(
    429,
    ERROR_CODE.OTP_TOO_MANY_ATTEMPTS,
    'Too many failed verification attempts for this code, or the per-IP rate limit was exceeded (`OTP_TOO_MANY_ATTEMPTS` / `RATE_LIMITED`).',
    'Urinishlar soni oshib ketdi, yangi kod so‘rang',
  )
  @ApiValidationEnvelope('Invalid phone number format, or the code does not match (`OTP_INVALID`).')
  async verify(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OtpVerifyDto,
  ): Promise<OtpVerifyResultDto> {
    await this.otpService.verify(user.id, dto.phoneNumber, dto.code);
    return OtpVerifyResultDto.verified();
  }
}
