import { ApiProperty } from '@nestjs/swagger';
import { BusinessStatus } from '../../../business/domain/enums/business-status.enum';
import { ListingStatus } from '../../../listings/domain/enums/listing-status.enum';
import { AdminDashboardStats } from '../../domain/entities/admin-dashboard-stats.entity';

/** A `{ total, banned }` count block (students, business owners). */
export class AdminDashboardTotalDto {
  @ApiProperty({ format: 'int32', example: 42 })
  total!: number;

  @ApiProperty({ format: 'int32', example: 3, description: 'Accounts with status=BANNED.' })
  banned!: number;
}

/** Business totals plus the per-status breakdown (every BusinessStatus key present, 0 default). */
export class AdminDashboardBusinessesDto {
  @ApiProperty({ format: 'int32', example: 12 })
  total!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'integer', format: 'int32' },
    description: 'Count per BusinessStatus — every key present (0 default).',
    example: { DRAFT: 1, PENDING_REVIEW: 2, APPROVED: 8, REJECTED: 1, BLOCKED: 0, ARCHIVED: 0 },
  })
  byStatus!: Record<BusinessStatus, number>;
}

/** Listing totals plus the per-status breakdown (every ListingStatus key present, 0 default). */
export class AdminDashboardListingsDto {
  @ApiProperty({ format: 'int32', example: 34 })
  total!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'integer', format: 'int32' },
    description: 'Count per ListingStatus — every key present (0 default).',
  })
  byStatus!: Record<ListingStatus, number>;
}

/** Redemption totals with the two states the dashboard highlights. */
export class AdminDashboardRedemptionsDto {
  @ApiProperty({ format: 'int32', example: 120 })
  total!: number;

  @ApiProperty({ format: 'int32', example: 100 })
  confirmed!: number;

  @ApiProperty({ format: 'int32', example: 15 })
  pending!: number;
}

/** The pending moderation queues. */
export class AdminDashboardModerationDto {
  @ApiProperty({ format: 'int32', example: 2 })
  pendingBusinesses!: number;

  @ApiProperty({ format: 'int32', example: 4 })
  pendingListings!: number;

  @ApiProperty({ format: 'int32', example: 6 })
  openReports!: number;
}

/** The admin dashboard summary (`GET /v1/admin/dashboard/stats`). */
export class AdminDashboardStatsDto {
  @ApiProperty({ type: AdminDashboardTotalDto })
  students!: AdminDashboardTotalDto;

  @ApiProperty({ type: AdminDashboardTotalDto })
  businessOwners!: AdminDashboardTotalDto;

  @ApiProperty({ type: AdminDashboardBusinessesDto })
  businesses!: AdminDashboardBusinessesDto;

  @ApiProperty({ type: AdminDashboardListingsDto })
  listings!: AdminDashboardListingsDto;

  @ApiProperty({ type: AdminDashboardRedemptionsDto })
  redemptions!: AdminDashboardRedemptionsDto;

  @ApiProperty({ type: AdminDashboardModerationDto })
  moderation!: AdminDashboardModerationDto;

  static fromDomain(stats: AdminDashboardStats): AdminDashboardStatsDto {
    const dto = new AdminDashboardStatsDto();
    dto.students = { total: stats.students.total, banned: stats.students.banned };
    dto.businessOwners = {
      total: stats.businessOwners.total,
      banned: stats.businessOwners.banned,
    };
    dto.businesses = { total: stats.businesses.total, byStatus: stats.businesses.byStatus };
    dto.listings = { total: stats.listings.total, byStatus: stats.listings.byStatus };
    dto.redemptions = {
      total: stats.redemptions.total,
      confirmed: stats.redemptions.confirmed,
      pending: stats.redemptions.pending,
    };
    dto.moderation = {
      pendingBusinesses: stats.moderation.pendingBusinesses,
      pendingListings: stats.moderation.pendingListings,
      openReports: stats.moderation.openReports,
    };
    return dto;
  }
}
