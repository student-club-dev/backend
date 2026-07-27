import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { ConfirmInput } from '../../application/redemptions.io';

/** Body of `POST /listings/{listingId}/redeem/verify`. */
export class VerifyRedemptionRequestDto {
  @ApiProperty({ description: 'The code the student presented (QR content or spoken)' })
  @IsString()
  @IsNotEmpty()
  code!: string;
}

/** Body of `POST /listings/{listingId}/redeem/confirm`. */
export class ConfirmRedemptionRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiPropertyOptional({ description: 'The branch where it was redeemed' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ format: 'int64', description: 'Whole soums applied at the till' })
  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;

  toInput(): ConfirmInput {
    return {
      code: this.code,
      branchId: this.branchId ?? null,
      amount: this.amount ?? null,
    };
  }
}
