import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateBusinessInput } from '../../application/business.io';
import { BusinessContactsDto } from './business-contacts.dto';

/** CreateBusinessRequestDto — required: `type`, `name`, `phone` (matches elon-uz.json). */
export class CreateBusinessDto {
  @ApiProperty({
    description: 'Business type key (immutable after creation)',
    example: 'NATIONAL_FOOD',
  })
  @IsString()
  @Length(1, 64)
  type!: string;

  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiProperty({ description: 'E.164', example: '+998901234567' })
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'phone E.164 formatida bo‘lishi kerak' })
  phone!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional({ nullable: true, description: '9 digits', example: '301234567' })
  @IsOptional()
  @IsString()
  inn?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiPropertyOptional({ type: BusinessContactsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessContactsDto)
  contacts?: BusinessContactsDto;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isOnlineOnly?: boolean;

  toInput(): CreateBusinessInput {
    return {
      type: this.type,
      name: this.name,
      phone: this.phone,
      legalName: this.legalName ?? null,
      inn: this.inn ?? null,
      description: this.description ?? null,
      logoUrl: this.logoUrl ?? null,
      coverUrl: this.coverUrl ?? null,
      contacts: this.contacts ? this.contacts.toDomain() : null,
      isOnlineOnly: this.isOnlineOnly ?? false,
    };
  }
}
