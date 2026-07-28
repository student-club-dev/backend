import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { Gender } from '../../../catalog/domain/enums/gender.enum';
import { CategoryWrite } from '../../domain/admin-catalog-write.repository';

/** AdminCreateCategoryDto — admin body to add a category (`id` is generated server-side). */
export class AdminCreateCategoryDto {
  @ApiProperty({ description: 'Business type key (must exist)', example: 'NATIONAL_FOOD' })
  @IsString()
  @Length(1, 64)
  businessType!: string;

  @ApiPropertyOptional({
    enum: Gender,
    enumName: 'GenderDto',
    nullable: true,
    description: 'null = the type’s base list; set only for gender-specific lists.',
  })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({
    description: 'Category key (unique per business type + gender)',
    example: 'PIZZA',
  })
  @IsString()
  @Length(1, 64)
  key!: string;

  @ApiProperty({ example: 'Pitsa' })
  @IsString()
  @Length(1, 120)
  nameUz!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  nameRu?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  iconUrl?: string;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    default: false,
    description: 'True for OTHER — the client then requires customCategoryName.',
  })
  @IsOptional()
  @IsBoolean()
  requiresCustomName?: boolean;

  /** Normalises to the category write payload, coercing absent optional fields to null / defaults. */
  toWrite(): CategoryWrite {
    return {
      businessType: this.businessType,
      gender: this.gender ?? null,
      key: this.key,
      nameUz: this.nameUz,
      nameRu: this.nameRu ?? null,
      iconUrl: this.iconUrl ?? null,
      sortOrder: this.sortOrder ?? 0,
      requiresCustomName: this.requiresCustomName ?? false,
    };
  }
}
