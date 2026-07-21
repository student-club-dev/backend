import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { BranchInput } from '../../application/branches.io';
import { BranchTradeCenterFieldInputDto } from './branch-trade-center-field-input.dto';
import { DeliveryZoneDto } from './delivery-zone.dto';
import { LocationDto } from './location.dto';
import { WorkingHoursDto } from './working-hours.dto';

/** BranchRequestDto — used for create and update (matches elon-uz.json). PUT full-replace semantics. */
export class BranchRequestDto {
  @ApiProperty({ example: 'Chilonzor filiali' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ type: LocationDto })
  @IsObject()
  @ValidateNested()
  @Type(() => LocationDto)
  location!: LocationDto;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ type: [WorkingHoursDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHoursDto)
  workingHours!: WorkingHoursDto[];

  @ApiPropertyOptional({ type: DeliveryZoneDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryZoneDto)
  deliveryZone?: DeliveryZoneDto;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    example: 'tc_abusaxiy',
    description: 'Trade center this branch sits in. Omit when it is not in a trade center.',
  })
  @IsOptional()
  @IsString()
  tradeCenterId?: string;

  @ApiPropertyOptional({
    type: [BranchTradeCenterFieldInputDto],
    description: 'Values for the trade center fields. Ignored when `tradeCenterId` is omitted.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BranchTradeCenterFieldInputDto)
  tradeCenterFields?: BranchTradeCenterFieldInputDto[];

  toInput(): BranchInput {
    return {
      name: this.name,
      phone: this.phone ?? null,
      location: this.location.toDomain(),
      workingHours: this.workingHours.map((hours) => hours.toDomain()),
      deliveryZone: this.deliveryZone ? this.deliveryZone.toDomain() : null,
      isActive: this.isActive ?? true,
      tradeCenterId: this.tradeCenterId ?? null,
      tradeCenterFields: (this.tradeCenterFields ?? []).map((field) => field.toDomain()),
    };
  }
}
