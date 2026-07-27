import { ApiProperty } from '@nestjs/swagger';
import { ListingStatsResult } from '../../application/listings.io';

/** ListingStatsDto — owner analytics for one listing (matches elon-uz.json). Money is whole soums. */
export class ListingStatsDto {
  @ApiProperty({ example: 'lst_01H8XZ' })
  listingId!: string;

  @ApiProperty({ format: 'int32', description: 'Detail views' })
  viewsCount!: number;

  @ApiProperty({ format: 'int32', description: 'Students who saved this listing' })
  favoritesCount!: number;

  @ApiProperty({ format: 'int32', description: 'Confirmed redemptions' })
  redemptionsCount!: number;

  @ApiProperty({ format: 'double', description: 'redemptionsCount / viewsCount (0 when no views)' })
  conversionRate!: number;

  @ApiProperty({ format: 'int64', description: 'Total value of confirmed redemptions, in so‘m' })
  totalRevenue!: number;

  static fromResult(result: ListingStatsResult): ListingStatsDto {
    const dto = new ListingStatsDto();
    dto.listingId = result.listingId;
    dto.viewsCount = result.viewsCount;
    dto.favoritesCount = result.favoritesCount;
    dto.redemptionsCount = result.redemptionsCount;
    dto.conversionRate = result.conversionRate;
    dto.totalRevenue = result.totalRevenue;
    return dto;
  }
}
