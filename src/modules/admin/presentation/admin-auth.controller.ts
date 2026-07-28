import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  ApiErrorEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { AdminAuthService } from '../application/admin-auth.service';
import type { AuthenticatedAdmin } from '../domain/admin-principal';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminAuthTokensDto } from './dto/admin-auth-tokens.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminMeDto } from './dto/admin-me.dto';

/** Env-based admin/moderator auth (Faza 0). No register / forgot-password — creds are fixed in env. */
@ApiTags('Admin — Auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log an admin/moderator in (email + password, verified against env)' })
  @ApiOkEnvelope(AdminAuthTokensDto)
  @ApiErrorEnvelope(
    401,
    ERROR_CODE.ADMIN_INVALID_CREDENTIALS,
    'Unknown admin email or wrong password (same error for both — no enumeration).',
    'Email yoki parol noto‘g‘ri',
  )
  @ApiValidationEnvelope()
  async login(@Body() dto: AdminLoginDto): Promise<AdminAuthTokensDto> {
    const tokens = await this.adminAuthService.login(dto.email, dto.password);
    return AdminAuthTokensDto.fromDomain(tokens);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The authenticated admin’s identity' })
  @ApiOkEnvelope(AdminMeDto)
  @ApiUnauthorizedEnvelope()
  @UseGuards(AdminJwtGuard)
  me(@CurrentAdmin() admin: AuthenticatedAdmin): AdminMeDto {
    const principal = this.adminAuthService.me({ email: admin.id, role: admin.role });
    return AdminMeDto.fromPrincipal(principal);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Log out (stateless)',
    description:
      'Stateless: there is no server-side admin session to revoke. The client discards the access token. `result` is null.',
  })
  @ApiOkEnvelope(undefined, 'Stateless logout; `result` is null.')
  @ApiUnauthorizedEnvelope()
  @UseGuards(AdminJwtGuard)
  logout(): void {
    // Stateless (Faza 0): the access token is short-lived and there is no server-side session
    // store, so logout is a no-op — the client simply discards the token.
  }
}
