import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { AdminDashboardService } from '../application/admin-dashboard.service';
import { AdminDashboardStatsDto } from './dto/admin-dashboard-stats.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';

/**
 * Admin dashboard summary (Faza 1) — totals, per-status breakdowns and the pending moderation
 * queues. Accessible to both ADMIN and MODERATOR, so guarded by AdminJwtGuard only (no `@Roles`
 * restriction). Served under `/v1`.
 */
@ApiTags('Admin — Dashboard')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(AdminJwtGuard)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Dashboard stats (totals + status breakdowns + pending queues)',
    description:
      'Every status breakdown carries all enum keys (0 default). Ban counts (students / owners) ' +
      'arrive in Faza 3.',
  })
  @ApiOkEnvelope(AdminDashboardStatsDto)
  async stats(): Promise<AdminDashboardStatsDto> {
    const stats = await this.adminDashboardService.stats();
    return AdminDashboardStatsDto.fromDomain(stats);
  }
}
