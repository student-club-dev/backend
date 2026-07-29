import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { DeliveryZone } from '../../domain/entities/branch.entity';

/**
 * DeliveryZoneDto — optional delivery configuration (matches elon-uz.json). Mainly for GROCERY and
 * CAFE_RESTAURANT.
 */
export class DeliveryZoneDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    type: 'integer',
    format: 'int32',
    nullable: true,
    minimum: 1000,
    maximum: 30000,
    description: 'Required when `enabled` is true (DISCOUNTS_BUSINESS_API §6.6 rule 8).',
  })
  @ValidateIf((o: DeliveryZoneDto) => o.enabled === true)
  @IsInt()
  @Min(1000)
  @Max(30000)
  radiusMeters?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int64', nullable: true })
  @IsOptional()
  @IsInt()
  minOrderAmount?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int64', nullable: true })
  @IsOptional()
  @IsInt()
  deliveryFee?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int64', nullable: true })
  @IsOptional()
  @IsInt()
  freeDeliveryFrom?: number;

  toDomain(): DeliveryZone {
    return {
      enabled: this.enabled,
      radiusMeters: this.radiusMeters ?? null,
      minOrderAmount: this.minOrderAmount ?? null,
      deliveryFee: this.deliveryFee ?? null,
      freeDeliveryFrom: this.freeDeliveryFrom ?? null,
    };
  }

  static fromDomain(zone: DeliveryZone): DeliveryZoneDto {
    const dto = new DeliveryZoneDto();
    dto.enabled = zone.enabled;
    dto.radiusMeters = zone.radiusMeters ?? undefined;
    dto.minOrderAmount = zone.minOrderAmount ?? undefined;
    dto.deliveryFee = zone.deliveryFee ?? undefined;
    dto.freeDeliveryFrom = zone.freeDeliveryFrom ?? undefined;
    return dto;
  }
}
