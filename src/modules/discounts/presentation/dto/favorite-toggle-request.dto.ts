import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

/** `POST /v1/discounts/favorites/toggle` body (STUDENT_FEED.md §9). */
export class FavoriteToggleRequestDto {
  @ApiProperty({ example: 'lst_01H8X7Qv2K', description: 'Listing to save or unsave' })
  @IsString()
  @IsNotEmpty()
  listingId!: string;

  @ApiProperty({
    example: true,
    description:
      'The wanted state, not a flip: `true` saves, `false` unsaves. Sending the same value twice is a no-op.',
  })
  @IsBoolean()
  saved!: boolean;
}
