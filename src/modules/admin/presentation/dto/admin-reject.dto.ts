import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/**
 * The verdict recorded when a moderator rejects a business or a listing. Shared by both reject
 * routes.
 *
 * `reason` is free text rather than an enum: DISCOUNTS_BUSINESS_API §6.2 lists codes
 * (`FAKE_DISCOUNT`, `POOR_IMAGE`, `PROHIBITED_CONTENT`, `WRONG_CATEGORY`, `INCOMPLETE_INFO`,
 * `OTHER`) but also says "+ izoh" — an explanatory note. Constraining the column to the codes
 * would drop the note, which is the part the owner can actually act on.
 */
export class AdminRejectDto {
  @ApiProperty({
    example: 'FAKE_DISCOUNT — narx sun’iy oshirilgan',
    minLength: 2,
    maxLength: 500,
    description: 'Rejection reason shown to the owner (spec §6.2)',
  })
  @IsString()
  @Length(2, 500)
  reason!: string;

  toReason(): string {
    return this.reason;
  }
}
