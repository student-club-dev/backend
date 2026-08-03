import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  ApiErrorEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { UpdateBusinessDto } from '../../business/presentation/dto/update-business.dto';
import { AdminBusinessesWriteService } from '../application/admin-businesses-write.service';
import { AdminBusinessesService } from '../application/admin-businesses.service';
import { AdminBusinessListQueryDto } from './dto/admin-business-list-query.dto';
import { AdminBusinessDto, AdminBusinessPageDto } from './dto/admin-business.dto';
import { AdminRejectDto } from './dto/admin-reject.dto';
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
  constructor(
    private readonly adminBusinessesService: AdminBusinessesService,
    private readonly adminBusinessesWriteService: AdminBusinessesWriteService,
  ) {}

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

  @Put(':id')
  @ApiOperation({
    summary: 'Edit any business (ADMIN or MODERATOR)',
    description:
      'Owner-scoping bypassed; the same validation as the owner update is applied. `type` is ' +
      'immutable — a differing value returns BUSINESS_TYPE_IMMUTABLE.',
  })
  @ApiParam({ name: 'id', description: 'Business id' })
  @ApiOkEnvelope(AdminBusinessDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_NOT_FOUND,
    'No business with this id.',
    'Biznes topilmadi',
  )
  @ApiErrorEnvelope(
    422,
    ERROR_CODE.BUSINESS_TYPE_IMMUTABLE,
    'Attempt to change the immutable business `type`.',
    "Biznes turini o'zgartirib bo'lmaydi",
  )
  async update(
    @Param('id') id: string,
    @Body() body: UpdateBusinessDto,
  ): Promise<AdminBusinessDto> {
    const business = await this.adminBusinessesWriteService.update(id, body.toInput());
    return AdminBusinessDto.fromDomain(business);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve a business under review (ADMIN or MODERATOR)',
    description:
      'PENDING_REVIEW → APPROVED, clearing `rejectionReason`. A decision, not an edit — it cannot ' +
      'change any other field.',
  })
  @ApiParam({ name: 'id', description: 'Business id' })
  @ApiOkEnvelope(AdminBusinessDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_NOT_FOUND,
    'No business with this id.',
    'Biznes topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.INVALID_STATUS_TRANSITION,
    'The business is not PENDING_REVIEW.',
    'Bu biznes ko‘rib chiqilmoqda emas',
  )
  async approve(@Param('id') id: string): Promise<AdminBusinessDto> {
    const business = await this.adminBusinessesWriteService.approve(id);
    return AdminBusinessDto.fromDomain(business);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reject a business under review (ADMIN or MODERATOR)',
    description: 'PENDING_REVIEW → REJECTED, recording `rejectionReason` (spec §6.2).',
  })
  @ApiParam({ name: 'id', description: 'Business id' })
  @ApiOkEnvelope(AdminBusinessDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_NOT_FOUND,
    'No business with this id.',
    'Biznes topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.INVALID_STATUS_TRANSITION,
    'The business is not PENDING_REVIEW.',
    'Bu biznes ko‘rib chiqilmoqda emas',
  )
  async reject(@Param('id') id: string, @Body() body: AdminRejectDto): Promise<AdminBusinessDto> {
    const business = await this.adminBusinessesWriteService.reject(id, body.toReason());
    return AdminBusinessDto.fromDomain(business);
  }
}
