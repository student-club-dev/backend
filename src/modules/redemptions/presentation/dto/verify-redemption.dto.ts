import { ApiProperty } from '@nestjs/swagger';
import { DiscountType } from '../../../listings/domain/enums/discount-type.enum';
import { DiscountBrief, InvalidReason, VerifyResult } from '../../application/redemptions.io';
import { RedemptionStudentDto } from './redemption.dto';

/** The discount the cashier applies. */
export class RedemptionDiscountDto {
  @ApiProperty({ enum: DiscountType, enumName: 'DiscountTypeDto' })
  type!: DiscountType;

  @ApiProperty()
  value!: number;

  @ApiProperty({ format: 'int64' })
  finalPrice!: number;

  @ApiProperty({ format: 'int64' })
  originalPrice!: number;

  static fromBrief(discount: DiscountBrief): RedemptionDiscountDto {
    const dto = new RedemptionDiscountDto();
    dto.type = discount.type;
    dto.value = discount.value;
    dto.finalPrice = discount.finalPrice;
    dto.originalPrice = discount.originalPrice;
    return dto;
  }
}

/** `verify` response (matches elon-uz.json). Soft result — `isValid` + the reason on failure. */
export class VerifyRedemptionResponseDto {
  @ApiProperty()
  isValid!: boolean;

  @ApiProperty({
    nullable: true,
    enum: ['INVALID_CODE', 'ALREADY_REDEEMED', 'EXPIRED', 'LIMIT_REACHED'],
  })
  invalidReason!: InvalidReason | null;

  @ApiProperty({ type: RedemptionStudentDto, nullable: true })
  student!: RedemptionStudentDto | null;

  @ApiProperty({ type: RedemptionDiscountDto, nullable: true })
  discount!: RedemptionDiscountDto | null;

  static fromResult(result: VerifyResult): VerifyRedemptionResponseDto {
    const dto = new VerifyRedemptionResponseDto();
    dto.isValid = result.isValid;
    dto.invalidReason = result.invalidReason;
    dto.student = result.student === null ? null : RedemptionStudentDto.fromBrief(result.student);
    dto.discount =
      result.discount === null ? null : RedemptionDiscountDto.fromBrief(result.discount);
    return dto;
  }
}
