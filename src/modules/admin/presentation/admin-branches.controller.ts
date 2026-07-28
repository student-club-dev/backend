import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { BranchRequestDto } from '../../branches/presentation/dto/branch-request.dto';
import { AdminBranchesWriteService } from '../application/admin-branches-write.service';
import { AdminBranchesService } from '../application/admin-branches.service';
import { AdminBranchListQueryDto } from './dto/admin-branch-list-query.dto';
import { AdminBranchDto, AdminBranchPageDto } from './dto/admin-branch.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';

/**
 * Admin cross-business branch reads (Faza 1) — the panel's "see every branch" view, owner-scoping
 * bypassed. Accessible to both ADMIN and MODERATOR, so guarded by AdminJwtGuard only (no `@Roles`
 * restriction). Served under `/v1`.
 */
@ApiTags('Admin — Branches')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(AdminJwtGuard)
@Controller('admin/branches')
export class AdminBranchesController {
  constructor(
    private readonly adminBranchesService: AdminBranchesService,
    private readonly adminBranchesWriteService: AdminBranchesWriteService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all branches (filter + pagination)',
    description:
      '`q` matches name / address (case-insensitive contains). Optional proximity filter: a bbox ' +
      '(`minLat`/`minLng`/`maxLat`/`maxLng`) or a point (`lat`+`lng`, `radiusMeters`).',
  })
  @ApiOkEnvelope(AdminBranchPageDto)
  @ApiValidationEnvelope()
  async list(@Query() query: AdminBranchListQueryDto): Promise<AdminBranchPageDto> {
    const filter = query.toFilter();
    const page = await this.adminBranchesService.list(filter);
    return AdminBranchPageDto.fromPage(page, filter.page, filter.size);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one branch by id (full record + business / region / district names)',
  })
  @ApiParam({ name: 'id', description: 'Branch id' })
  @ApiOkEnvelope(AdminBranchDto)
  @ApiNotFoundEnvelope(ERROR_CODE.BRANCH_NOT_FOUND, 'No branch with this id.', 'Filial topilmadi')
  async getById(@Param('id') id: string): Promise<AdminBranchDto> {
    const branch = await this.adminBranchesService.getById(id);
    return AdminBranchDto.fromDomain(branch);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Edit any branch (ADMIN or MODERATOR)',
    description:
      'Owner-scoping bypassed; full-replace with the same validation gates as the owner update ' +
      '(location bounds, region/district match, trade-center fields, duplicate-location).',
  })
  @ApiParam({ name: 'id', description: 'Branch id' })
  @ApiOkEnvelope(AdminBranchDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(ERROR_CODE.BRANCH_NOT_FOUND, 'No branch with this id.', 'Filial topilmadi')
  async update(@Param('id') id: string, @Body() body: BranchRequestDto): Promise<AdminBranchDto> {
    const branch = await this.adminBranchesWriteService.update(id, body.toInput());
    return AdminBranchDto.fromDomain(branch);
  }
}
