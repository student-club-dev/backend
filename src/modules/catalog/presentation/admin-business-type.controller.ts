import { Body, Controller, Delete, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AdminGuard } from '../../../common/guards/admin.guard';
import {
  ApiCreatedEnvelope,
  ApiErrorEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { BusinessTypeAdminService } from '../application/business-type-admin.service';
import { BusinessTypeInfoDto } from './dto/business-type-info.dto';
import { CreateBusinessTypeDto } from './dto/create-business-type.dto';
import { UpdateBusinessTypeDto } from './dto/update-business-type.dto';

/**
 * Admin CRUD for the business-type catalog data. AdminGuard-protected (X-Admin-Key). The public
 * read (`GET /business/types`) is served by CatalogController and is unchanged.
 */
@ApiTags('Admin — Business Types')
@ApiHeader({ name: 'X-Admin-Key', description: 'Admin API key', required: true })
@ApiForbiddenEnvelope('Missing or invalid `X-Admin-Key` header.')
@UseGuards(AdminGuard)
@Controller('admin/business-types')
export class AdminBusinessTypeController {
  constructor(private readonly businessTypeAdminService: BusinessTypeAdminService) {}

  @Post()
  @ApiOperation({ summary: 'Create a business type' })
  @ApiCreatedEnvelope(BusinessTypeInfoDto)
  @ApiValidationEnvelope()
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.BUSINESS_TYPE_EXISTS,
    'A business type with this key already exists.',
    'Bu biznes turi allaqachon mavjud',
  )
  async create(@Body() dto: CreateBusinessTypeDto): Promise<BusinessTypeInfoDto> {
    const type = await this.businessTypeAdminService.create(dto.type, dto.toWrite());
    return BusinessTypeInfoDto.fromDomain(type);
  }

  @Put(':type')
  @ApiOperation({ summary: 'Update a business type' })
  @ApiParam({ name: 'type', description: 'Business type key', example: 'GAME_CLUB' })
  @ApiOkEnvelope(BusinessTypeInfoDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_TYPE_NOT_FOUND,
    'No business type with this key.',
    'Biznes turi topilmadi',
  )
  @ApiValidationEnvelope()
  async update(
    @Param('type') type: string,
    @Body() dto: UpdateBusinessTypeDto,
  ): Promise<BusinessTypeInfoDto> {
    const updated = await this.businessTypeAdminService.update(type, dto.toWrite());
    return BusinessTypeInfoDto.fromDomain(updated);
  }

  @Delete(':type')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a business type',
    description: 'Allowed only when no business and no category reference it. `result` is null.',
  })
  @ApiParam({ name: 'type', description: 'Business type key', example: 'GAME_CLUB' })
  @ApiOkEnvelope(undefined, 'Deleted; `result` is null.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_TYPE_NOT_FOUND,
    'No business type with this key.',
    'Biznes turi topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.BUSINESS_TYPE_IN_USE,
    'A business or category still references this type.',
    'Bu biznes turi ishlatilmoqda, uni o‘chirib bo‘lmaydi',
  )
  async delete(@Param('type') type: string): Promise<void> {
    await this.businessTypeAdminService.delete(type);
  }
}
