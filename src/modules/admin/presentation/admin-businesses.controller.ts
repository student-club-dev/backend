import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { AdminBusinessesService } from '../application/admin-businesses.service';
import { AdminBusinessListQueryDto } from './dto/admin-business-list-query.dto';
import { AdminBusinessDto, AdminBusinessPageDto } from './dto/admin-business.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';

/**
 * Admin cross-owner business reads (Faza 1) — the panel's "see every business" view, owner-scoping
 * bypassed (ARCHIVED included). Accessible to both ADMIN and MODERATOR, so guarded by AdminJwtGuard
 * only (no `@Roles` restriction). Served under `/v1`.
 */
@ApiTags('Admin — Businesses')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(AdminJwtGuard)
@Controller('admin/businesses')
export class AdminBusinessesController {
  constructor(private readonly adminBusinessesService: AdminBusinessesService) {}

  @Get()
  @ApiOperation({
    summary: 'List all businesses (filter + pagination)',
    description:
      '`q` matches name / legalName / inn / phone (case-insensitive contains). `status` is ' +
      'repeatable; the admin sees every status (ARCHIVED included).',
  })
  @ApiOkEnvelope(AdminBusinessPageDto)
  @ApiValidationEnvelope()
  async list(@Query() query: AdminBusinessListQueryDto): Promise<AdminBusinessPageDto> {
    const filter = query.toFilter();
    const page = await this.adminBusinessesService.list(filter);
    return AdminBusinessPageDto.fromPage(page, filter.page, filter.size);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one business by id (full record + owner summary + branch count)' })
  @ApiParam({ name: 'id', description: 'Business id' })
  @ApiOkEnvelope(AdminBusinessDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_NOT_FOUND,
    'No business with this id.',
    'Biznes topilmadi',
  )
  async getById(@Param('id') id: string): Promise<AdminBusinessDto> {
    const business = await this.adminBusinessesService.getById(id);
    return AdminBusinessDto.fromDomain(business);
  }
}
