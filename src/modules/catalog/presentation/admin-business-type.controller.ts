import { Body, Controller, Delete, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../../../common/guards/admin.guard';
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
@UseGuards(AdminGuard)
@Controller('admin/business-types')
export class AdminBusinessTypeController {
  constructor(private readonly businessTypeAdminService: BusinessTypeAdminService) {}

  @Post()
  @ApiOperation({ summary: 'Create a business type' })
  @ApiCreatedResponse({ type: BusinessTypeInfoDto })
  async create(@Body() dto: CreateBusinessTypeDto): Promise<BusinessTypeInfoDto> {
    const type = await this.businessTypeAdminService.create(dto.type, dto.toWrite());
    return BusinessTypeInfoDto.fromDomain(type);
  }

  @Put(':type')
  @ApiOperation({ summary: 'Update a business type' })
  @ApiParam({ name: 'type', description: 'Business type key', example: 'GAME_CLUB' })
  @ApiOkResponse({ type: BusinessTypeInfoDto })
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
  @ApiOkResponse({ description: 'Deleted; `result` is null.' })
  async delete(@Param('type') type: string): Promise<void> {
    await this.businessTypeAdminService.delete(type);
  }
}
