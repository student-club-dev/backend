import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { DiscountInput } from '../../application/listings.io';
import { DiscountType } from '../../domain/enums/discount-type.enum';

/** DiscountRequestDto — the submitted discount (matches elon-uz.json). The server computes finalPrice. */
export class DiscountRequestDto {
  @ApiProperty({ enum: DiscountType, enumName: 'DiscountTypeDto' })
  @IsEnum(DiscountType)
  type!: DiscountType;

  @ApiProperty({
    format: 'int64',
    description: 'PERCENT: 1..90. FIXED_AMOUNT/SPECIAL_PRICE: soums.',
  })
  @IsInt()
  value!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  conditions?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  appliesToOptions?: boolean;

  toInput(): DiscountInput {
    return {
      type: this.type,
      value: this.value,
      conditions: this.conditions ?? null,
      appliesToOptions: this.appliesToOptions ?? false,
    };
  }
}
