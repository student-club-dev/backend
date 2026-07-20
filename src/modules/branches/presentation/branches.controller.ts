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
import { BusinessAccountGuard } from '../../business/presentation/guards/business-account.guard';
import { BranchesService } from '../application/branches.service';
import { BranchDto } from './dto/branch.dto';
import { BranchRequestDto } from './dto/branch-request.dto';

/**
 * Owner-side branch CRUD, nested under a business. JWT-guarded and restricted to BUSINESS accounts
 * (a student token → 403); every operation requires the caller to own the business. DELETE is a
 * hard delete. Served under the `/v1` prefix.
 */
@ApiTags('Branches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, BusinessAccountGuard)
@ApiParam({ name: 'businessId', description: 'Business id' })
@Controller('business/:businessId/branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @ApiOperation({ summary: 'List a business branches (owner only)' })
  @ApiOkResponse({ type: [BranchDto] })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
  ): Promise<BranchDto[]> {
    const branches = await this.branchesService.list(user, businessId);
    return branches.map(BranchDto.fromDomain);
  }

  @Post()
  @ApiOperation({ summary: 'Create a branch (owner only)' })
  @ApiCreatedResponse({ type: BranchDto })
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
  @ApiOkResponse({ type: BranchDto })
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
  @ApiOkResponse({ description: 'Deleted; `result` is null.' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Param('branchId') branchId: string,
  ): Promise<void> {
    await this.branchesService.delete(user, businessId, branchId);
  }
}
