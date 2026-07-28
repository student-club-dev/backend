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
import { DistrictDto } from '../../geo/presentation/dto/district.dto';
import { AdminGeoService } from '../application/admin-geo.service';
import { AdminRole } from '../domain/enums/admin-role.enum';
import { Roles } from './decorators/roles.decorator';
import { AdminCreateDistrictDto } from './dto/admin-create-district.dto';
import { AdminUpdateDistrictDto } from './dto/admin-update-district.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRoleGuard } from './guards/admin-role.guard';

/**
 * Admin CRUD for the district reference data (Faza 4). Config endpoints — ADMIN only
 * (AdminJwtGuard + AdminRoleGuard + `@Roles(AdminRole.ADMIN)` at controller level). The public read
 * (`GET /districts`) is served by the geo module and is unchanged. Served under the `/v1` prefix.
 */
@ApiTags('Admin — Districts')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('Only ADMIN may manage reference data.')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@Roles(AdminRole.ADMIN)
@Controller('admin/districts')
export class AdminDistrictsController {
  constructor(private readonly adminGeoService: AdminGeoService) {}

  @Post()
  @ApiOperation({ summary: 'Create a district (ADMIN only)' })
  @ApiCreatedEnvelope(DistrictDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.REGION_NOT_FOUND,
    'No region with the given `regionId`.',
    'Viloyat topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.DISTRICT_EXISTS,
    'A district with this id already exists.',
    'Bu tuman allaqachon mavjud',
  )
  async create(@Body() dto: AdminCreateDistrictDto): Promise<DistrictDto> {
    const district = await this.adminGeoService.createDistrict(dto.id, dto.toWrite());
    return DistrictDto.fromDomain(district);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a district (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'District key', example: 'CHILONZOR' })
  @ApiOkEnvelope(DistrictDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.DISTRICT_NOT_FOUND,
    'No district with this id (or the target `regionId` does not exist).',
    'Tuman topilmadi',
  )
  async update(@Param('id') id: string, @Body() dto: AdminUpdateDistrictDto): Promise<DistrictDto> {
    const district = await this.adminGeoService.updateDistrict(id, dto.toWrite());
    return DistrictDto.fromDomain(district);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a district (ADMIN only)',
    description: 'Allowed only when no branch references it. `result` is null.',
  })
  @ApiParam({ name: 'id', description: 'District key', example: 'CHILONZOR' })
  @ApiOkEnvelope(undefined, 'Deleted; `result` is null.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.DISTRICT_NOT_FOUND,
    'No district with this id.',
    'Tuman topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.DISTRICT_IN_USE,
    'A branch still references this district.',
    'Bu tuman ishlatilmoqda, uni o‘chirib bo‘lmaydi',
  )
  async delete(@Param('id') id: string): Promise<void> {
    await this.adminGeoService.deleteDistrict(id);
  }
}
