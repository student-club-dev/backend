import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuthService } from '../application/auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResetPasswordResultDto } from './dto/reset-password-result.dto';
import { SetPasswordDto } from './dto/set-password.dto';

/** Password set (D9) & reset via SMS (D5) for the provider app. Bound to the `business_owners` tables. */
@ApiTags('Auth — Business Password')
@Controller('auth/business/password')
export class BusinessPasswordController {
  constructor(private readonly authService: AuthService) {}

  @Post('set')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Set or change the account password (authenticated)' })
  @ApiOkResponse({ description: 'Password set/changed; `result` is null.' })
  async set(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetPasswordDto): Promise<void> {
    await this.authService.setPassword(user.id, dto.currentPassword ?? null, dto.newPassword);
  }

  @Post('forgot')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Request a password-reset OTP via SMS',
    description: 'Always succeeds; `result` is null — never reveals whether the account exists.',
  })
  @ApiOkResponse({ description: 'Always succeeds; `result` is null (anti-enumeration).' })
  async forgot(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.authService.forgotPassword(dto.phoneNumber);
  }

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset the password with the SMS OTP' })
  @ApiOkResponse({ type: ResetPasswordResultDto })
  async reset(@Body() dto: ResetPasswordDto): Promise<ResetPasswordResultDto> {
    await this.authService.resetPassword(dto.phoneNumber, dto.code, dto.newPassword);
    return ResetPasswordResultDto.done();
  }
}
