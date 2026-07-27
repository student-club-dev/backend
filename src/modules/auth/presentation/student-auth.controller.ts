import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthProvider } from '../../../common/enums/auth-provider.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  ApiCreatedEnvelope,
  ApiErrorEnvelope,
  ApiOkEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { AuthService } from '../application/auth.service';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { OAuthLoginDto } from './dto/oauth-login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

/** Credential auth for the student app. `AuthService` is bound to the `students` tables. */
@ApiTags('Auth — Student')
@Controller('auth/student')
export class StudentAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a student (email or phone + password)' })
  @ApiCreatedEnvelope(AuthTokensDto)
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.ACCOUNT_EXISTS,
    'An account with this email or phone number already exists.',
    'Bu email yoki telefon bilan hisob allaqachon mavjud',
  )
  @ApiValidationEnvelope()
  async register(@Body() dto: RegisterDto, @Req() request: Request): Promise<AuthTokensDto> {
    const tokens = await this.authService.register(dto.toInput(request.ip ?? null));
    return AuthTokensDto.fromDomain(tokens);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log a student in (email or phone + password)' })
  @ApiOkEnvelope(AuthTokensDto)
  @ApiErrorEnvelope(
    401,
    ERROR_CODE.INVALID_CREDENTIALS,
    'No matching account, or the password is wrong (also returned for an OAuth-only account with no password set — no enumeration).',
    'Login yoki parol xato',
  )
  @ApiValidationEnvelope()
  async login(@Body() dto: LoginDto, @Req() request: Request): Promise<AuthTokensDto> {
    const tokens = await this.authService.login(dto.toInput(request.ip ?? null));
    return AuthTokensDto.fromDomain(tokens);
  }

  @Post('oauth/google')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log a student in with Google (verifies the ID token)' })
  @ApiOkEnvelope(AuthTokensDto)
  @ApiErrorEnvelope(
    401,
    ERROR_CODE.INVALID_OAUTH_TOKEN,
    'The Google ID token failed verification (bad signature, issuer, audience, or expiry).',
    'Google token yaroqsiz',
  )
  @ApiValidationEnvelope()
  async googleOAuth(@Body() dto: OAuthLoginDto, @Req() request: Request): Promise<AuthTokensDto> {
    const tokens = await this.authService.oauthLogin(
      AuthProvider.GOOGLE,
      dto.idToken,
      dto.toDevice(request.ip ?? null),
    );
    return AuthTokensDto.fromDomain(tokens);
  }

  @Post('oauth/apple')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log a student in with Apple (verifies the ID token)' })
  @ApiOkEnvelope(AuthTokensDto)
  @ApiErrorEnvelope(
    401,
    ERROR_CODE.INVALID_OAUTH_TOKEN,
    'The Apple ID token failed verification (bad signature, issuer, audience, or expiry).',
    'Apple token yaroqsiz',
  )
  @ApiValidationEnvelope()
  async appleOAuth(@Body() dto: OAuthLoginDto, @Req() request: Request): Promise<AuthTokensDto> {
    const tokens = await this.authService.oauthLogin(
      AuthProvider.APPLE,
      dto.idToken,
      dto.toDevice(request.ip ?? null),
    );
    return AuthTokensDto.fromDomain(tokens);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a student refresh token' })
  @ApiOkEnvelope(AuthTokensDto)
  @ApiErrorEnvelope(
    401,
    ERROR_CODE.INVALID_REFRESH_TOKEN,
    'The refresh token is invalid, expired, or already revoked.',
    'Sessiya yaroqsiz, qaytadan kiring',
  )
  @ApiValidationEnvelope()
  async refresh(@Body() dto: RefreshDto, @Req() request: Request): Promise<AuthTokensDto> {
    const tokens = await this.authService.refresh(dto.toInput(request.ip ?? null));
    return AuthTokensDto.fromDomain(tokens);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke a student refresh token (idempotent)' })
  @ApiOkEnvelope(undefined, 'Refresh token revoked; `result` is null.')
  @ApiValidationEnvelope()
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.authService.logout(dto.toInput());
  }
}
