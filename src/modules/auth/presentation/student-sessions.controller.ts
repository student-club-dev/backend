import { Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuthService } from '../application/auth.service';
import { SessionDto } from './dto/session.dto';

/** Device-session management for the student app (D3). `AuthService` is bound to the `students` tables. */
@ApiTags('Auth — Student Sessions')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(JwtAuthGuard)
@Controller('auth/student/sessions')
export class StudentSessionsController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  @ApiOperation({ summary: 'List the account’s active device sessions' })
  @ApiOkEnvelope([SessionDto])
  async list(@CurrentUser() user: AuthenticatedUser): Promise<SessionDto[]> {
    const sessions = await this.authService.listSessions(user.id);
    return sessions.map(SessionDto.fromDomain);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke a single device session (must be the caller’s own)' })
  @ApiOkEnvelope(undefined, 'Session revoked; `result` is null.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.SESSION_NOT_FOUND,
    'No session with this id belonging to the caller.',
    'Sessiya topilmadi',
  )
  async revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.authService.revokeSession(user.id, id);
  }

  @Post('logout-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke all of the account’s device sessions' })
  @ApiOkEnvelope(undefined, 'All sessions revoked; `result` is null.')
  async logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logoutAll(user.id);
  }
}
