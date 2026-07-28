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
import { AdminCategoriesService } from '../application/admin-categories.service';
import { AdminRole } from '../domain/enums/admin-role.enum';
import { Roles } from './decorators/roles.decorator';
import { AdminCategoryDto } from './dto/admin-category.dto';
import { AdminCreateCategoryDto } from './dto/admin-create-category.dto';
import { AdminUpdateCategoryDto } from './dto/admin-update-category.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRoleGuard } from './guards/admin-role.guard';

/**
 * Admin CRUD for the catalog categories (Faza 4). Config endpoints — ADMIN only (AdminJwtGuard +
 * AdminRoleGuard + `@Roles(AdminRole.ADMIN)` at controller level). The public read (`GET /catalog/*`)
 * is served by the catalog module and is unchanged. Served under the `/v1` prefix.
 */
@ApiTags('Admin — Categories')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('Only ADMIN may manage the catalog.')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@Roles(AdminRole.ADMIN)
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly adminCategoriesService: AdminCategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a category (ADMIN only)' })
  @ApiCreatedEnvelope(AdminCategoryDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_TYPE_NOT_FOUND,
    'No business type with the given `businessType`.',
    'Biznes turi topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.CATEGORY_EXISTS,
    'A category with this business type + gender + key already exists.',
    'Bu kategoriya allaqachon mavjud',
  )
  async create(@Body() dto: AdminCreateCategoryDto): Promise<AdminCategoryDto> {
    const category = await this.adminCategoriesService.create(dto.toWrite());
    return AdminCategoryDto.fromDomain(category);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a category (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Category id', example: 'ckv...' })
  @ApiOkEnvelope(AdminCategoryDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.CATEGORY_NOT_FOUND,
    'No category with this id.',
    'Kategoriya topilmadi',
  )
  async update(
    @Param('id') id: string,
    @Body() dto: AdminUpdateCategoryDto,
  ): Promise<AdminCategoryDto> {
    const category = await this.adminCategoriesService.update(id, dto.toUpdate());
    return AdminCategoryDto.fromDomain(category);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a category (ADMIN only)',
    description: 'Allowed only when no listing references it. `result` is null.',
  })
  @ApiParam({ name: 'id', description: 'Category id', example: 'ckv...' })
  @ApiOkEnvelope(undefined, 'Deleted; `result` is null.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.CATEGORY_NOT_FOUND,
    'No category with this id.',
    'Kategoriya topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.CATEGORY_IN_USE,
    'A listing still references this category.',
    'Bu kategoriya ishlatilmoqda, uni o‘chirib bo‘lmaydi',
  )
  async delete(@Param('id') id: string): Promise<void> {
    await this.adminCategoriesService.delete(id);
  }
}
