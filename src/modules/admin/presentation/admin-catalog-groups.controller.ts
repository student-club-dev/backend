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
import { AdminCatalogGroupsService } from '../application/admin-catalog-groups.service';
import { AdminRole } from '../domain/enums/admin-role.enum';
import { Roles } from './decorators/roles.decorator';
import { AdminCatalogGroupDto } from './dto/admin-catalog-group.dto';
import { AdminCreateCatalogGroupDto } from './dto/admin-create-catalog-group.dto';
import { AdminUpdateCatalogGroupDto } from './dto/admin-update-catalog-group.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRoleGuard } from './guards/admin-role.guard';

/**
 * Admin CRUD for the catalog groups (Faza 4). Config endpoints — ADMIN only (AdminJwtGuard +
 * AdminRoleGuard + `@Roles(AdminRole.ADMIN)` at controller level). The public read (`GET /catalog/*`)
 * is served by the catalog module and is unchanged. Served under the `/v1` prefix.
 */
@ApiTags('Admin — Catalog Groups')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('Only ADMIN may manage the catalog.')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@Roles(AdminRole.ADMIN)
@Controller('admin/catalog/groups')
export class AdminCatalogGroupsController {
  constructor(private readonly adminCatalogGroupsService: AdminCatalogGroupsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a catalog group (ADMIN only)' })
  @ApiCreatedEnvelope(AdminCatalogGroupDto)
  @ApiValidationEnvelope()
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.CATALOG_GROUP_EXISTS,
    'A catalog group with this key already exists.',
    'Bu katalog guruhi allaqachon mavjud',
  )
  async create(@Body() dto: AdminCreateCatalogGroupDto): Promise<AdminCatalogGroupDto> {
    const group = await this.adminCatalogGroupsService.create(dto.key, dto.toWrite());
    return AdminCatalogGroupDto.fromDomain(group);
  }

  @Put(':key')
  @ApiOperation({ summary: 'Update a catalog group (ADMIN only)' })
  @ApiParam({ name: 'key', description: 'Catalog group key', example: 'FOOD' })
  @ApiOkEnvelope(AdminCatalogGroupDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.CATALOG_GROUP_NOT_FOUND,
    'No catalog group with this key.',
    'Katalog guruhi topilmadi',
  )
  async update(
    @Param('key') key: string,
    @Body() dto: AdminUpdateCatalogGroupDto,
  ): Promise<AdminCatalogGroupDto> {
    const group = await this.adminCatalogGroupsService.update(key, dto.toWrite());
    return AdminCatalogGroupDto.fromDomain(group);
  }

  @Delete(':key')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a catalog group (ADMIN only)',
    description: 'Allowed only when no business type references it. `result` is null.',
  })
  @ApiParam({ name: 'key', description: 'Catalog group key', example: 'FOOD' })
  @ApiOkEnvelope(undefined, 'Deleted; `result` is null.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.CATALOG_GROUP_NOT_FOUND,
    'No catalog group with this key.',
    'Katalog guruhi topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.CATALOG_GROUP_IN_USE,
    'A business type still references this group.',
    'Bu katalog guruhi ishlatilmoqda, uni o‘chirib bo‘lmaydi',
  )
  async delete(@Param('key') key: string): Promise<void> {
    await this.adminCatalogGroupsService.delete(key);
  }
}
