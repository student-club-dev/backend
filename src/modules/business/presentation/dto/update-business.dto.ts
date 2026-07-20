import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { UpdateBusinessInput } from '../../application/business.io';
import { BusinessContactsDto } from './business-contacts.dto';

/**
 * UpdateBusinessRequestDto — a partial update (matches elon-uz.json). Every field is optional;
 * an absent field is left unchanged. `type` is NOT part of the spec DTO — it is accepted here only
 * to reject an attempt to change it: a value that differs from the current type returns 422
 * BUSINESS_TYPE_IMMUTABLE (the business type is immutable).
 */
export class UpdateBusinessDto {
  @ApiPropertyOptional({
    description: 'Immutable — a differing value returns BUSINESS_TYPE_IMMUTABLE',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @ApiPropertyOptional({ nullable: true, description: 'E.164', example: '+998901234567' })
  @IsOptional()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'phone E.164 formatida bo‘lishi kerak' })
  phone?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional({ nullable: true })
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

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isOnlineOnly?: boolean;

  toInput(): UpdateBusinessInput {
    return {
      type: this.type ?? undefined,
      name: this.name ?? undefined,
      phone: this.phone ?? undefined,
      legalName: this.legalName ?? undefined,
      inn: this.inn ?? undefined,
      description: this.description ?? undefined,
      logoUrl: this.logoUrl ?? undefined,
      coverUrl: this.coverUrl ?? undefined,
      contacts: this.contacts ? this.contacts.toDomain() : undefined,
      isOnlineOnly: this.isOnlineOnly ?? undefined,
    };
  }
}
