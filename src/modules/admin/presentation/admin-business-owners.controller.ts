import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { AdminBusinessOwnersService } from '../application/admin-business-owners.service';
import {
  AdminBusinessOwnerDto,
  AdminBusinessOwnerPageDto,
  AdminOwnerBusinessDto,
} from './dto/admin-business-owner.dto';
import { AdminOwnerListQueryDto } from './dto/admin-owner-list-query.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';

/**
 * Admin cross-user business-owner reads (Faza 1) — owner-scoping bypassed. Accessible to both ADMIN
 * and MODERATOR, so guarded by AdminJwtGuard only (no `@Roles` restriction). Served under `/v1`.
 */
@ApiTags('Admin — Business owners')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(AdminJwtGuard)
@Controller('admin/business-owners')
export class AdminBusinessOwnersController {
  constructor(private readonly adminBusinessOwnersService: AdminBusinessOwnersService) {}

  @Get()
  @ApiOperation({
    summary: 'List all business owners (filter + pagination)',
    description:
      '`q` matches firstName / lastName / phoneNumber / email (case-insensitive contains). ' +
      '`businessesCount` is how many businesses each owner has.',
  })
  @ApiOkEnvelope(AdminBusinessOwnerPageDto)
  @ApiValidationEnvelope()
  async list(@Query() query: AdminOwnerListQueryDto): Promise<AdminBusinessOwnerPageDto> {
    const filter = query.toFilter();
    const page = await this.adminBusinessOwnersService.list(filter);
    return AdminBusinessOwnerPageDto.fromPage(page, filter.page, filter.size);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one business owner by id (every field except passwordHash)' })
  @ApiParam({ name: 'id', description: 'Business-owner id' })
  @ApiOkEnvelope(AdminBusinessOwnerDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_OWNER_NOT_FOUND,
    'No business owner with this id.',
    'Biznes egasi topilmadi',
  )
  async getById(@Param('id') id: string): Promise<AdminBusinessOwnerDto> {
    const owner = await this.adminBusinessOwnersService.getById(id);
    return AdminBusinessOwnerDto.fromDomain(owner);
  }

  @Get(':id/businesses')
  @ApiOperation({ summary: "List the owner's businesses (all statuses)" })
  @ApiParam({ name: 'id', description: 'Business-owner id' })
  @ApiOkEnvelope([AdminOwnerBusinessDto])
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_OWNER_NOT_FOUND,
    'No business owner with this id.',
    'Biznes egasi topilmadi',
  )
  async listBusinesses(@Param('id') id: string): Promise<AdminOwnerBusinessDto[]> {
    const businesses = await this.adminBusinessOwnersService.listBusinesses(id);
    return businesses.map(AdminOwnerBusinessDto.fromDomain);
  }
}
