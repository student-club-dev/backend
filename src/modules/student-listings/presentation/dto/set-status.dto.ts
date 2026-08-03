import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ListingStatus } from '../../../listings/domain/enums/listing-status.enum';

/** The three statuses an owner may set directly (§7.1). Everything else is lifecycle-driven. */
const OWNER_SETTABLE = [
  ListingStatus.ACTIVE,
  ListingStatus.PAUSED,
  ListingStatus.ARCHIVED,
] as const;

export class SetListingStatusDto {
  @ApiProperty({ enum: OWNER_SETTABLE })
  @IsIn(OWNER_SETTABLE)
  status!: ListingStatus;
}
