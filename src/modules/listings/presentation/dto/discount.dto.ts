import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListingDiscount } from '../../domain/entities/listing.entity';
import { DiscountType } from '../../domain/enums/discount-type.enum';

/** DiscountDto — a listing's discount with the server-computed `finalPrice` (matches elon-uz.json). */
export class DiscountDto {
  @ApiProperty({ enum: DiscountType, enumName: 'DiscountTypeDto' })
  type!: DiscountType;

  @ApiProperty({ format: 'int64', example: 20 })
  value!: number;

  @ApiProperty({
    format: 'int64',
    description: 'Computed by the SERVER. finalPrice < originalPrice (except for FREE_ITEM).',
    example: 44000,
  })
  finalPrice!: number;

  @ApiPropertyOptional({ nullable: true })
  conditions!: string | null;

  @ApiProperty({ default: false })
  appliesToOptions!: boolean;

  static fromDomain(discount: ListingDiscount): DiscountDto {
    const dto = new DiscountDto();
    dto.type = discount.type;
    dto.value = discount.value;
    dto.finalPrice = discount.finalPrice;
    dto.conditions = discount.conditions;
    dto.appliesToOptions = discount.appliesToOptions;
    return dto;
  }
}
