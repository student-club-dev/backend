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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { BusinessService } from '../application/business.service';
import { BusinessDto } from './dto/business.dto';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { BusinessAccountGuard } from './guards/business-account.guard';

/**
 * Owner-side business CRUD. JWT-guarded and restricted to BUSINESS accounts (a student token → 403).
 * New businesses start as DRAFT; DELETE archives (soft-delete). Served under the `/v1` prefix.
 */
@ApiTags('Business')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccountGuard)
@Controller('business')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a business',
    description:
      'Created with status = DRAFT and owned by the caller. `type` must exist in the catalog and is immutable afterwards. Requires a verified phone (D1).',
  })
  @ApiCreatedResponse({ type: BusinessDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBusinessDto,
  ): Promise<BusinessDto> {
    const business = await this.businessService.create(user, dto.toInput());
    return BusinessDto.fromDomain(business);
  }

  @Get('my')
  @ApiOperation({ summary: "List the caller's businesses (archived excluded)" })
  @ApiOkResponse({ type: [BusinessDto] })
  async getMy(@CurrentUser() user: AuthenticatedUser): Promise<BusinessDto[]> {
    const businesses = await this.businessService.getMyBusinesses(user);
    return businesses.map(BusinessDto.fromDomain);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single business (owner only)' })
  @ApiParam({ name: 'id', description: 'Business id' })
  @ApiOkResponse({ type: BusinessDto })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<BusinessDto> {
    const business = await this.businessService.getById(user, id);
    return BusinessDto.fromDomain(business);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update a business (owner only)',
    description: '`type` is immutable — a differing value returns BUSINESS_TYPE_IMMUTABLE.',
  })
  @ApiParam({ name: 'id', description: 'Business id' })
  @ApiOkResponse({ type: BusinessDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBusinessDto,
  ): Promise<BusinessDto> {
    const business = await this.businessService.update(user, id, dto.toInput());
    return BusinessDto.fromDomain(business);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Archive a business (owner only)',
    description:
      'Soft-delete: the business and all its listings become ARCHIVED. `result` is null.',
  })
  @ApiParam({ name: 'id', description: 'Business id' })
  @ApiOkResponse({ description: 'Archived; `result` is null.' })
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.businessService.archive(user, id);
  }
}
