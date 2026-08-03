import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type {
  ListingOption,
  ListingOptionGroup,
} from '../../domain/entities/student-listing.entity';

/** One choice inside a group. `priceDelta` may be negative — a discount is a legitimate option. */
export class ListingOptionDto {
  @ApiProperty({ example: '90 daqiqa' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 30000, description: 'Butun so‘m; manfiy ham bo‘lishi mumkin' })
  @IsOptional()
  @IsInt()
  priceDelta?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  toDomain(): ListingOption {
    return {
      name: this.name,
      priceDelta: this.priceDelta ?? 0,
      isAvailable: this.isAvailable ?? true,
    };
  }
}

/** §2.5 — an add-on chooser, mostly used by SERVICE listings. */
export class ListingOptionGroupDto {
  @ApiProperty({ example: 'Dars davomiyligi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ['SINGLE', 'MULTIPLE'] })
  @IsIn(['SINGLE', 'MULTIPLE'])
  selectionType!: 'SINGLE' | 'MULTIPLE';

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiProperty({ type: [ListingOptionDto] })
  @ValidateNested({ each: true })
  @Type(() => ListingOptionDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  options!: ListingOptionDto[];

  toDomain(): ListingOptionGroup {
    return {
      name: this.name,
      selectionType: this.selectionType,
      isRequired: this.isRequired ?? false,
      options: this.options.map((option) => option.toDomain()),
    };
  }
}
