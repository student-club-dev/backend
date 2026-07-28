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
import { AdminAttributeSpecsService } from '../application/admin-attribute-specs.service';
import { AdminRole } from '../domain/enums/admin-role.enum';
import { Roles } from './decorators/roles.decorator';
import { AdminAttributeSpecDto } from './dto/admin-attribute-spec.dto';
import { AdminCreateAttributeSpecDto } from './dto/admin-create-attribute-spec.dto';
import { AdminUpdateAttributeSpecDto } from './dto/admin-update-attribute-spec.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRoleGuard } from './guards/admin-role.guard';

/**
 * Admin CRUD for the catalog attribute specs (Faza 4). Config endpoints — ADMIN only (AdminJwtGuard
 * + AdminRoleGuard + `@Roles(AdminRole.ADMIN)` at controller level). The public read (`GET /catalog/*`)
 * is served by the catalog module and is unchanged. Served under the `/v1` prefix.
 */
@ApiTags('Admin — Attribute Specs')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('Only ADMIN may manage the catalog.')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@Roles(AdminRole.ADMIN)
@Controller('admin/attribute-specs')
export class AdminAttributeSpecsController {
  constructor(private readonly adminAttributeSpecsService: AdminAttributeSpecsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an attribute spec (ADMIN only)' })
  @ApiCreatedEnvelope(AdminAttributeSpecDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_TYPE_NOT_FOUND,
    'No business type with the given `businessType`.',
    'Biznes turi topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.ATTRIBUTE_SPEC_EXISTS,
    'An attribute spec with this business type + category + key already exists.',
    'Bu atribut allaqachon mavjud',
  )
  async create(@Body() dto: AdminCreateAttributeSpecDto): Promise<AdminAttributeSpecDto> {
    const spec = await this.adminAttributeSpecsService.create(dto.toWrite());
    return AdminAttributeSpecDto.fromDomain(spec);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an attribute spec (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Attribute spec id', example: 'ckv...' })
  @ApiOkEnvelope(AdminAttributeSpecDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.ATTRIBUTE_SPEC_NOT_FOUND,
    'No attribute spec with this id.',
    'Atribut topilmadi',
  )
  async update(
    @Param('id') id: string,
    @Body() dto: AdminUpdateAttributeSpecDto,
  ): Promise<AdminAttributeSpecDto> {
    const spec = await this.adminAttributeSpecsService.update(id, dto.toUpdate());
    return AdminAttributeSpecDto.fromDomain(spec);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete an attribute spec (ADMIN only)',
    description: 'No in-use guard — listing attributes are loose JSON. `result` is null.',
  })
  @ApiParam({ name: 'id', description: 'Attribute spec id', example: 'ckv...' })
  @ApiOkEnvelope(undefined, 'Deleted; `result` is null.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.ATTRIBUTE_SPEC_NOT_FOUND,
    'No attribute spec with this id.',
    'Atribut topilmadi',
  )
  async delete(@Param('id') id: string): Promise<void> {
    await this.adminAttributeSpecsService.delete(id);
  }
}
