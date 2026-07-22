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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ApiCreatedEnvelope,
  ApiErrorEnvelope,
  ApiForbiddenEnvelope,
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
  ApiUnauthorizedEnvelope,
  ApiValidationEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { BusinessAccountGuard } from '../../business/presentation/guards/business-account.guard';
import { BranchesService } from '../application/branches.service';
import { BranchDto } from './dto/branch.dto';
import { BranchRequestDto } from './dto/branch-request.dto';

/** Shared 422 description for branch create/update — location and trade-center gates. */
const BRANCH_VALIDATION_DESCRIPTION =
  'Invalid body, coordinate outside Uzbekistan (`LOCATION_OUT_OF_BOUNDS`), district not in the ' +
  'selected region (`DISTRICT_REGION_MISMATCH`), point more than 10 km from the district centre ' +
  '(`LOCATION_DISTRICT_MISMATCH`), unknown or inactive trade center (`TRADE_CENTER_NOT_FOUND`), or ' +
  'invalid trade-center fields (`TRADE_CENTER_FIELD_INVALID`).';

/**
 * Owner-side branch CRUD, nested under a business. JWT-guarded and restricted to BUSINESS accounts
 * (a student token → 403); every operation requires the caller to own the business. DELETE is a
 * hard delete. Served under the `/v1` prefix.
 */
@ApiTags('Branches')
@ApiBearerAuth()
@ApiUnauthorizedEnvelope()
@ApiForbiddenEnvelope(
  'The caller is not a BUSINESS account, or the business belongs to another owner.',
)
@UseGuards(JwtAuthGuard, BusinessAccountGuard)
@ApiParam({ name: 'businessId', description: 'Business id' })
@Controller('business/:businessId/branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @ApiOperation({ summary: 'List a business branches (owner only)' })
  @ApiOkEnvelope([BranchDto])
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_NOT_FOUND,
    'No business with this id.',
    'Biznes topilmadi',
  )
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
  ): Promise<BranchDto[]> {
    const branches = await this.branchesService.list(user, businessId);
    return branches.map(BranchDto.fromDomain);
  }

  @Post()
  @ApiOperation({ summary: 'Create a branch (owner only)' })
  @ApiCreatedEnvelope(BranchDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_NOT_FOUND,
    'No business with this id.',
    'Biznes topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.DUPLICATE_BRANCH_LOCATION,
    'Another branch of this business already sits within 100 m of this location.',
    '100 m radiusda shu biznesning filiali bor',
  )
  @ApiValidationEnvelope(BRANCH_VALIDATION_DESCRIPTION)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Body() dto: BranchRequestDto,
  ): Promise<BranchDto> {
    const branch = await this.branchesService.create(user, businessId, dto.toInput());
    return BranchDto.fromDomain(branch);
  }

  @Put(':branchId')
  @ApiOperation({ summary: 'Update a branch (owner only)' })
  @ApiParam({ name: 'branchId', description: 'Branch id' })
  @ApiOkEnvelope(BranchDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.BRANCH_NOT_FOUND,
    'No branch with this id, or the owning business does not exist (`BUSINESS_NOT_FOUND`).',
    'Filial topilmadi',
  )
  @ApiErrorEnvelope(
    409,
    ERROR_CODE.DUPLICATE_BRANCH_LOCATION,
    'Another branch of this business already sits within 100 m of this location.',
    '100 m radiusda shu biznesning filiali bor',
  )
  @ApiValidationEnvelope(BRANCH_VALIDATION_DESCRIPTION)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('branchId') branchId: string,
    @Body() dto: BranchRequestDto,
  ): Promise<BranchDto> {
    const branch = await this.branchesService.update(user, businessId, branchId, dto.toInput());
    return BranchDto.fromDomain(branch);
  }

  @Delete(':branchId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a branch (owner only)',
    description: 'Hard delete — the branch has no status column. `result` is null.',
  })
  @ApiParam({ name: 'branchId', description: 'Branch id' })
  @ApiOkEnvelope(undefined, 'Deleted; `result` is null.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.BRANCH_NOT_FOUND,
    'No branch with this id, or the owning business does not exist (`BUSINESS_NOT_FOUND`).',
    'Filial topilmadi',
  )
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('branchId') branchId: string,
  ): Promise<void> {
    await this.branchesService.delete(user, businessId, branchId);
  }
}
