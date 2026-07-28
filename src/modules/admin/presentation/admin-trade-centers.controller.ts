import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
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
import { TradeCenterFieldDto } from '../../trade-centers/presentation/dto/trade-center-field.dto';
import { AdminTradeCentersService } from '../application/admin-trade-centers.service';
import { AdminRole } from '../domain/enums/admin-role.enum';
import { Roles } from './decorators/roles.decorator';
import { AdminCreateTradeCenterFieldDto } from './dto/admin-create-trade-center-field.dto';
import { AdminCreateTradeCenterDto } from './dto/admin-create-trade-center.dto';
import { AdminTradeCenterDto } from './dto/admin-trade-center.dto';
import { AdminUpdateTradeCenterFieldDto } from './dto/admin-update-trade-center-field.dto';
import { AdminUpdateTradeCenterDto } from './dto/admin-update-trade-center.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRoleGuard } from './guards/admin-role.guard';

/**
 * Admin CRUD for trade centers (savdo markazlari) and their dynamic fields (Faza 4). Config
 * endpoints — ADMIN only (AdminJwtGuard + AdminRoleGuard + `@Roles(AdminRole.ADMIN)` at controller
 * level). Lists/returns centers of any status (unlike the public ACTIVE-only read). Served under `/v1`.
 */
@ApiTags('Admin — Trade Centers')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope('Only ADMIN may manage reference data.')
@UseGuards(AdminJwtGuard, AdminRoleGuard)
@Roles(AdminRole.ADMIN)
@Controller('admin/trade-centers')
export class AdminTradeCentersController {
  constructor(private readonly adminTradeCentersService: AdminTradeCentersService) {}

  @Get()
  @ApiOperation({
    summary: 'List all trade centers (ADMIN only)',
    description: 'Every center (incl. INACTIVE), ordered by sortOrder then name, with its fields.',
  })
  @ApiOkEnvelope([AdminTradeCenterDto])
  async list(): Promise<AdminTradeCenterDto[]> {
    const centers = await this.adminTradeCentersService.list();
    return centers.map(AdminTradeCenterDto.fromDomain);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a trade center with its fields (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Trade center id', example: 'tc_abusaxiy' })
  @ApiOkEnvelope(AdminTradeCenterDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.TRADE_CENTER_NOT_FOUND,
    'No trade center with this id.',
    'Savdo markazi topilmadi',
  )
  async get(@Param('id') id: string): Promise<AdminTradeCenterDto> {
    const center = await this.adminTradeCentersService.get(id);
    return AdminTradeCenterDto.fromDomain(center);
  }

  @Post()
  @ApiOperation({ summary: 'Create a trade center (ADMIN only)' })
  @ApiCreatedEnvelope(AdminTradeCenterDto)
  @ApiValidationEnvelope()
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.TRADE_CENTER_SLUG_EXISTS,
    'A trade center with this slug already exists.',
    'Bu slug allaqachon band',
  )
  async create(@Body() dto: AdminCreateTradeCenterDto): Promise<AdminTradeCenterDto> {
    const center = await this.adminTradeCentersService.create(dto.toWrite());
    return AdminTradeCenterDto.fromDomain(center);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a trade center (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Trade center id', example: 'tc_abusaxiy' })
  @ApiOkEnvelope(AdminTradeCenterDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.TRADE_CENTER_NOT_FOUND,
    'No trade center with this id.',
    'Savdo markazi topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.TRADE_CENTER_SLUG_EXISTS,
    'Another trade center already uses this slug.',
    'Bu slug allaqachon band',
  )
  async update(
    @Param('id') id: string,
    @Body() dto: AdminUpdateTradeCenterDto,
  ): Promise<AdminTradeCenterDto> {
    const center = await this.adminTradeCentersService.update(id, dto.toWrite());
    return AdminTradeCenterDto.fromDomain(center);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a trade center (ADMIN only)',
    description: 'Allowed only when no branch references it. `result` is null.',
  })
  @ApiParam({ name: 'id', description: 'Trade center id', example: 'tc_abusaxiy' })
  @ApiOkEnvelope(undefined, 'Deleted; `result` is null.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.TRADE_CENTER_NOT_FOUND,
    'No trade center with this id.',
    'Savdo markazi topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.TRADE_CENTER_IN_USE,
    'A branch still references this trade center.',
    'Bu savdo markazi ishlatilmoqda, uni o‘chirib bo‘lmaydi',
  )
  async delete(@Param('id') id: string): Promise<void> {
    await this.adminTradeCentersService.delete(id);
  }

  @Post(':id/fields')
  @ApiOperation({ summary: 'Add a field to a trade center (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Trade center id', example: 'tc_abusaxiy' })
  @ApiCreatedEnvelope(TradeCenterFieldDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.TRADE_CENTER_NOT_FOUND,
    'No trade center with this id.',
    'Savdo markazi topilmadi',
  )
  async createField(
    @Param('id') id: string,
    @Body() dto: AdminCreateTradeCenterFieldDto,
  ): Promise<TradeCenterFieldDto> {
    const field = await this.adminTradeCentersService.createField(id, dto.toWrite());
    return TradeCenterFieldDto.fromDomain(field);
  }

  @Put(':id/fields/:fieldId')
  @ApiOperation({ summary: 'Update a trade-center field (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'Trade center id', example: 'tc_abusaxiy' })
  @ApiParam({ name: 'fieldId', description: 'Field id', example: 'f_qator' })
  @ApiOkEnvelope(TradeCenterFieldDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.TRADE_CENTER_FIELD_NOT_FOUND,
    'No field with this id under the given trade center.',
    'Maydon topilmadi',
  )
  async updateField(
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: AdminUpdateTradeCenterFieldDto,
  ): Promise<TradeCenterFieldDto> {
    const field = await this.adminTradeCentersService.updateField(id, fieldId, dto.toWrite());
    return TradeCenterFieldDto.fromDomain(field);
  }

  @Delete(':id/fields/:fieldId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a trade-center field (ADMIN only)',
    description: 'Allowed only when no branch has a value for it. `result` is null.',
  })
  @ApiParam({ name: 'id', description: 'Trade center id', example: 'tc_abusaxiy' })
  @ApiParam({ name: 'fieldId', description: 'Field id', example: 'f_qator' })
  @ApiOkEnvelope(undefined, 'Deleted; `result` is null.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.TRADE_CENTER_FIELD_NOT_FOUND,
    'No field with this id under the given trade center.',
    'Maydon topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.TRADE_CENTER_FIELD_IN_USE,
    'A branch still has a value for this field.',
    'Bu maydon ishlatilmoqda, uni o‘chirib bo‘lmaydi',
  )
  async deleteField(@Param('id') id: string, @Param('fieldId') fieldId: string): Promise<void> {
    await this.adminTradeCentersService.deleteField(id, fieldId);
  }
}
