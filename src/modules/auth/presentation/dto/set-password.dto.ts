import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Set or change the account password (D9). `currentPassword` is required only when the account
 * already has a password (a change); an OAuth-only account sets its first password without it.
 */
export class SetPasswordDto {
  @ApiPropertyOptional({
    example: 'oldsecret123',
    description: 'Required only when changing an existing password',
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiProperty({ example: 'newsecret123', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
