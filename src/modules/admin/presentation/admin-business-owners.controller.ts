import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
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
import { AdminBusinessOwnersService } from '../application/admin-business-owners.service';
import { AdminBusinessOwnersWriteService } from '../application/admin-business-owners-write.service';
import { AdminRole } from '../domain/enums/admin-role.enum';
import { Roles } from './decorators/roles.decorator';
import { AdminBanUserDto } from './dto/admin-ban-user.dto';
import { AdminDeleteAccountDto } from './dto/admin-delete-account.dto';
import { AdminCreateOwnerDto } from './dto/admin-create-owner.dto';
import {
  AdminBusinessOwnerDto,
  AdminBusinessOwnerPageDto,
  AdminOwnerBusinessDto,
} from './dto/admin-business-owner.dto';
import { AdminOwnerListQueryDto } from './dto/admin-owner-list-query.dto';
import { AdminUpdateOwnerDto } from './dto/admin-update-owner.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRoleGuard } from './guards/admin-role.guard';

/**
 * Admin cross-user business-owner reads (Faza 1) + writes (Faza 3). Reads and PUT (edit) are open to
 * both ADMIN and MODERATOR (AdminJwtGuard, applied at the controller level). POST (create) is
 * ADMIN-only — AdminRoleGuard + `@Roles(AdminRole.ADMIN)` on the handler. Served under `/v1`.
 */
@ApiTags('Admin — Business owners')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@UseGuards(AdminJwtGuard)
@Controller('admin/business-owners')
export class AdminBusinessOwnersController {
  constructor(
    private readonly adminBusinessOwnersService: AdminBusinessOwnersService,
    private readonly adminBusinessOwnersWriteService: AdminBusinessOwnersWriteService,
  ) {}

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

  @Post()
  // AdminJwtGuard is applied at the controller level; AdminRoleGuard restricts this route to ADMIN.
  @UseGuards(AdminRoleGuard)
  @Roles(AdminRole.ADMIN)
  @ApiOperation({
    summary: 'Create a business owner (ADMIN only)',
    description:
      'Admin-set initial password (min 8); at least one of email / phoneNumber is required.',
  })
  @ApiCreatedEnvelope(AdminBusinessOwnerDto)
  @ApiValidationEnvelope()
  @ApiForbiddenEnvelope('Only ADMIN may create users.')
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.ACCOUNT_EXISTS,
    'Email or phoneNumber already taken (`ACCOUNT_EXISTS`).',
    'Bu hisob allaqachon mavjud',
  )
  async create(@Body() body: AdminCreateOwnerDto): Promise<AdminBusinessOwnerDto> {
    const owner = await this.adminBusinessOwnersWriteService.create(body.toInput());
    return AdminBusinessOwnerDto.fromDomain(owner);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Edit a business owner',
    description: 'Partial update; a phone-number change resets `phoneVerified`.',
  })
  @ApiParam({ name: 'id', description: 'Business-owner id' })
  @ApiOkEnvelope(AdminBusinessOwnerDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_OWNER_NOT_FOUND,
    'No business owner with this id.',
    'Biznes egasi topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.ACCOUNT_EXISTS,
    'phoneNumber already taken (`ACCOUNT_EXISTS`).',
    'Bu hisob allaqachon mavjud',
  )
  async update(
    @Param('id') id: string,
    @Body() body: AdminUpdateOwnerDto,
  ): Promise<AdminBusinessOwnerDto> {
    const owner = await this.adminBusinessOwnersWriteService.update(id, body.toInput());
    return AdminBusinessOwnerDto.fromDomain(owner);
  }

  @Post(':id/ban')
  @ApiOperation({
    summary: 'Ban a business owner',
    description:
      'Sets status=BANNED with the given reason and revokes all the owner’s sessions (force ' +
      'logout). Re-banning updates the reason. ADMIN and MODERATOR.',
  })
  @ApiParam({ name: 'id', description: 'Business-owner id' })
  @ApiOkEnvelope(AdminBusinessOwnerDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_OWNER_NOT_FOUND,
    'No business owner with this id.',
    'Biznes egasi topilmadi',
  )
  async ban(
    @Param('id') id: string,
    @Body() body: AdminBanUserDto,
  ): Promise<AdminBusinessOwnerDto> {
    const owner = await this.adminBusinessOwnersWriteService.ban(id, body.reason);
    return AdminBusinessOwnerDto.fromDomain(owner);
  }

  @Post(':id/unban')
  @ApiOperation({
    summary: 'Un-ban a business owner',
    description: 'Sets status=ACTIVE and clears the ban reason. ADMIN and MODERATOR.',
  })
  @ApiParam({ name: 'id', description: 'Business-owner id' })
  @ApiOkEnvelope(AdminBusinessOwnerDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_OWNER_NOT_FOUND,
    'No business owner with this id.',
    'Biznes egasi topilmadi',
  )
  async unban(@Param('id') id: string): Promise<AdminBusinessOwnerDto> {
    const owner = await this.adminBusinessOwnersWriteService.unban(id);
    return AdminBusinessOwnerDto.fromDomain(owner);
  }

  /**
   * ⚠️ ADMIN only, and one-way. `MODERATOR` may ban (reversible) but not close an account.
   */
  @Delete(':id')
  // AdminJwtGuard is applied at the controller level; without AdminRoleGuard here the `@Roles`
  // below would be decoration and a MODERATOR could close accounts.
  @UseGuards(AdminRoleGuard)
  @Roles(AdminRole.ADMIN)
  @ApiOperation({
    summary: 'Close a business owner account',
    description:
      'Sets `status=DELETED`, records the reason, revokes every session, and archives every business they own together with those businesses’ listings — an owner who cannot log in must not leave discounts in the feed that nobody is left to honour.\n\n' +
      '**Not a row delete, and cannot be undone.** The row stays because deleting it would cascade ' +
      'through many tables, two of which are not this account’s to erase: chat messages live inside ' +
      'the *other* party’s conversation, and abuse reports are the record of what this account was ' +
      'accused of. There is no restore endpoint — warn before calling this.\n\n' +
      'A `DELETED` account cannot log in, refresh, or sign in with Google/Apple (403 ' +
      '`ACCOUNT_BANNED`). ADMIN only.',
  })
  @ApiParam({ name: 'id', description: 'business owner id' })
  @ApiOkEnvelope(AdminBusinessOwnerDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_OWNER_NOT_FOUND,
    'No business owner with this id.',
    'Biznes egasi topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.INVALID_STATUS_TRANSITION,
    'The account is already closed.',
    'Bu hisob allaqachon o‘chirilgan',
  )
  async remove(
    @Param('id') id: string,
    @Body() body: AdminDeleteAccountDto,
  ): Promise<AdminBusinessOwnerDto> {
    return AdminBusinessOwnerDto.fromDomain(
      await this.adminBusinessOwnersWriteService.softDelete(id, body?.reason ?? null),
    );
  }
}
