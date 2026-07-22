import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { AuthService } from '../application/auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResetPasswordResultDto } from './dto/reset-password-result.dto';
import { SetPasswordDto } from './dto/set-password.dto';

/** Password set (D9) & reset via SMS (D5) for the student app. Bound to the `students` tables. */
@ApiTags('Auth — Student Password')
@Controller('auth/student/password')
export class StudentPasswordController {
  constructor(private readonly authService: AuthService) {}

  @Post('set')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Set or change the account password (authenticated)' })
  @ApiOkEnvelope(undefined, 'Password set/changed; `result` is null.')
  @ApiUnauthorizedEnvelope()
  @ApiValidationEnvelope()
  async set(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetPasswordDto): Promise<void> {
    await this.authService.setPassword(user.id, dto.currentPassword ?? null, dto.newPassword);
  }

  @Post('forgot')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Request a password-reset OTP via SMS',
    description: 'Always succeeds; `result` is null — never reveals whether the account exists.',
  })
  @ApiOkEnvelope(undefined, 'Always succeeds; `result` is null (anti-enumeration).')
  @ApiErrorEnvelope(
    429,
    ERROR_CODE.OTP_COOLDOWN,
    'A password-reset code was already requested recently (`OTP_COOLDOWN`), or the hourly SMS limit for this phone was reached (`OTP_RESEND_LIMIT`). Only sent when the account exists and its phone is verified — never reveals which.',
    'Iltimos, biroz kutib qaytadan urinib ko‘ring',
  )
  @ApiValidationEnvelope()
  async forgot(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.authService.forgotPassword(dto.phoneNumber);
  }

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset the password with the SMS OTP' })
  @ApiOkEnvelope(ResetPasswordResultDto)
  @ApiErrorEnvelope(
    410,
    ERROR_CODE.OTP_EXPIRED,
    'The code expired or was never requested.',
    'Kod eskirgan yoki topilmadi, qaytadan so‘rang',
  )
  @ApiErrorEnvelope(
    429,
    ERROR_CODE.OTP_TOO_MANY_ATTEMPTS,
    'Too many failed verification attempts for this code.',
    'Urinishlar soni oshib ketdi, yangi kod so‘rang',
  )
  @ApiErrorEnvelope(
    401,
    ERROR_CODE.INVALID_CREDENTIALS,
    'Defensive — the account for this phone number no longer exists.',
    'Login yoki parol xato',
  )
  @ApiValidationEnvelope('Invalid body, or the code does not match (`OTP_INVALID`).')
  async reset(@Body() dto: ResetPasswordDto): Promise<ResetPasswordResultDto> {
    await this.authService.resetPassword(dto.phoneNumber, dto.code, dto.newPassword);
    return ResetPasswordResultDto.done();
  }
}
