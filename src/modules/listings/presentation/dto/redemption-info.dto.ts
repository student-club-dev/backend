import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { RedemptionInput } from '../../application/listings.io';
import { ListingRedemption } from '../../domain/entities/listing.entity';
import { RedemptionMethod } from '../../domain/enums/redemption-method.enum';
import { RedemptionPeriod } from '../../domain/enums/redemption-period.enum';

/**
 * RedemptionInfoDto — a listing's redemption configuration (matches elon-uz.json). Shared by the
 * request and the response; `usedCount` is server-owned (stripped from input, set on output).
 */
export class RedemptionInfoDto {
  @ApiProperty({ enum: RedemptionMethod, enumName: 'RedemptionMethodDto' })
  @IsEnum(RedemptionMethod)
  method!: RedemptionMethod;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  promoCode?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'For ONLINE_LINK' })
  @IsOptional()
  @IsString()
  url?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'int32', example: 1 })
  @IsOptional()
  @IsInt()
  perUserLimit?: number | null;

  @ApiPropertyOptional({ enum: RedemptionPeriod, enumName: 'RedemptionPeriodDto' })
  @IsOptional()
  @IsEnum(RedemptionPeriod)
  perUserPeriod?: RedemptionPeriod;

  @ApiPropertyOptional({
    nullable: true,
    format: 'int32',
    description: 'null = unlimited. The listing moves to SOLD_OUT once usedCount >= totalLimit.',
  })
  @IsOptional()
  @IsInt()
  totalLimit?: number | null;

  @ApiPropertyOptional({ format: 'int32', description: 'Computed by the server' })
  @Allow()
  usedCount?: number;

  toInput(): RedemptionInput {
    return {
      method: this.method,
      promoCode: this.promoCode ?? null,
      url: this.url ?? null,
      perUserLimit: this.perUserLimit ?? null,
      perUserPeriod: this.perUserPeriod ?? null,
      totalLimit: this.totalLimit ?? null,
    };
  }

  static fromDomain(redemption: ListingRedemption): RedemptionInfoDto {
    const dto = new RedemptionInfoDto();
    dto.method = redemption.method;
    dto.promoCode = redemption.promoCode;
    dto.url = redemption.url;
    dto.perUserLimit = redemption.perUserLimit;
    dto.perUserPeriod = redemption.perUserPeriod ?? undefined;
    dto.totalLimit = redemption.totalLimit;
    dto.usedCount = redemption.usedCount;
    return dto;
  }
}
