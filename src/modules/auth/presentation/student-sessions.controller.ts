import { Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuthService } from '../application/auth.service';
import { SessionDto } from './dto/session.dto';

/** Device-session management for the student app (D3). `AuthService` is bound to the `students` tables. */
@ApiTags('Auth — Student Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('auth/student/sessions')
export class StudentSessionsController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  @ApiOperation({ summary: 'List the account’s active device sessions' })
  @ApiOkResponse({ type: SessionDto, isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<SessionDto[]> {
    const sessions = await this.authService.listSessions(user.id);
    return sessions.map(SessionDto.fromDomain);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke a single device session (must be the caller’s own)' })
  @ApiOkResponse({ description: 'Session revoked; `result` is null.' })
  async revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.authService.revokeSession(user.id, id);
  }

  @Post('logout-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke all of the account’s device sessions' })
  @ApiOkResponse({ description: 'All sessions revoked; `result` is null.' })
  async logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logoutAll(user.id);
  }
}
