import { Body, Controller, Delete, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  ApiCreatedEnvelope,
  ApiErrorEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { RegionDto } from '../../geo/presentation/dto/region.dto';
import { AdminGeoService } from '../application/admin-geo.service';
import { AdminRole } from '../domain/enums/admin-role.enum';
import { Roles } from './decorators/roles.decorator';
import { AdminCreateRegionDto } from './dto/admin-create-region.dto';
import { AdminUpdateRegionDto } from './dto/admin-update-region.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRoleGuard } from './guards/admin-role.guard';

/**
 * Admin CRUD for the region reference data (Faza 4). Config endpoints — ADMIN only
 * (AdminJwtGuard + AdminRoleGuard + `@Roles(AdminRole.ADMIN)` at controller level). The public read
 * (`GET /regions`) is served by the geo module and is unchanged. Served under the `/v1` prefix.
 */
@ApiTags('Admin — Regions')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('Only ADMIN may manage reference data.')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@Roles(AdminRole.ADMIN)
@Controller('admin/regions')
export class AdminRegionsController {
  constructor(private readonly adminGeoService: AdminGeoService) {}

  @Post()
  @ApiOperation({ summary: 'Create a region (ADMIN only)' })
  @ApiCreatedEnvelope(RegionDto)
  @ApiValidationEnvelope()
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.REGION_EXISTS,
    'A region with this id already exists.',
    'Bu viloyat allaqachon mavjud',
  )
  async create(@Body() dto: AdminCreateRegionDto): Promise<RegionDto> {
    const region = await this.adminGeoService.createRegion(dto.id, dto.toWrite());
    return RegionDto.fromDomain(region);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a region (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Region key', example: 'TOSHKENT_SHAHRI' })
  @ApiOkEnvelope(RegionDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(ERROR_CODE.REGION_NOT_FOUND, 'No region with this id.', 'Viloyat topilmadi')
  async update(@Param('id') id: string, @Body() dto: AdminUpdateRegionDto): Promise<RegionDto> {
    const region = await this.adminGeoService.updateRegion(id, dto.toWrite());
    return RegionDto.fromDomain(region);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a region (ADMIN only)',
    description: 'Allowed only when no district and no branch reference it. `result` is null.',
  })
  @ApiParam({ name: 'id', description: 'Region key', example: 'TOSHKENT_SHAHRI' })
  @ApiOkEnvelope(undefined, 'Deleted; `result` is null.')
  @ApiNotFoundEnvelope(ERROR_CODE.REGION_NOT_FOUND, 'No region with this id.', 'Viloyat topilmadi')
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.REGION_IN_USE,
    'A district or branch still references this region.',
    'Bu viloyat ishlatilmoqda, uni o‘chirib bo‘lmaydi',
  )
  async delete(@Param('id') id: string): Promise<void> {
    await this.adminGeoService.deleteRegion(id);
  }
}
