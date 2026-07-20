import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
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
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Controller('auth/student/otp')
export class StudentOtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('request')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send an OTP to the phone number to verify' })
  @ApiOkResponse({ type: OtpRequestResultDto })
  async request(@Body() dto: OtpRequestDto): Promise<OtpRequestResultDto> {
    const result = await this.otpService.request(dto.phoneNumber);
    return OtpRequestResultDto.fromDomain(result);
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Verify the OTP and mark the account's phone as verified" })
  @ApiOkResponse({ type: OtpVerifyResultDto })
  async verify(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OtpVerifyDto,
  ): Promise<OtpVerifyResultDto> {
    await this.otpService.verify(user.id, dto.phoneNumber, dto.code);
    return OtpVerifyResultDto.verified();
  }
}
