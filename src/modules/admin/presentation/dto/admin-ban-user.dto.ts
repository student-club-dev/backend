import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body for the admin ban endpoints (students & business owners, Faza 3). `reason` is required and
 * non-empty; it is stored on the account and surfaced back in the admin reads (`banReason`).
 */
export class AdminBanUserDto {
  @ApiProperty({ example: 'Spam va firibgarlik', description: 'Why the account is being banned.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
