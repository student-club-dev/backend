import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { OptionInput } from '../../application/listings.io';
import { ListingOption } from '../../domain/entities/listing.entity';

/** OptionDto — a single add-on option (matches elon-uz.json). Shared by request and response. */
export class OptionDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  id?: string | null;

  @ApiProperty({ example: '35 sm' })
  @IsString()
  name!: string;

  @ApiProperty({
    format: 'int64',
    description: 'Amount added to the base price (may be negative)',
    example: 12000,
  })
  @IsInt()
  priceDelta!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ nullable: true, format: 'int32' })
  @IsOptional()
  @IsInt()
  sortOrder?: number | null;

  toInput(): OptionInput {
    return {
      name: this.name,
      priceDelta: this.priceDelta,
      isAvailable: this.isAvailable ?? true,
      sortOrder: this.sortOrder ?? null,
    };
  }

  static fromDomain(option: ListingOption): OptionDto {
    const dto = new OptionDto();
    dto.id = option.id;
    dto.name = option.name;
    dto.priceDelta = option.priceDelta;
    dto.isAvailable = option.isAvailable;
    dto.sortOrder = option.sortOrder;
    return dto;
  }
}
