import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Branch } from '../../domain/entities/branch.entity';
import { BranchTradeCenterDto, BranchTradeCenterFieldDto } from './branch-trade-center.dto';
import { DeliveryZoneDto } from './delivery-zone.dto';
import { LocationDto } from './location.dto';
import { WorkingHoursDto } from './working-hours.dto';

/** BranchDto — a branch as returned to its owner (matches elon-uz.json). */
export class BranchDto {
  @ApiProperty({ example: 'br_01H8X' })
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty({ example: 'Chilonzor filiali' })
  name!: string;

  @ApiProperty({ type: LocationDto })
  location!: LocationDto;

  @ApiPropertyOptional({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: [WorkingHoursDto] })
  workingHours!: WorkingHoursDto[];

  @ApiPropertyOptional({ type: DeliveryZoneDto, nullable: true })
  deliveryZone!: DeliveryZoneDto | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiPropertyOptional({
    type: BranchTradeCenterDto,
    nullable: true,
    description: 'The trade center this branch sits in, or null.',
  })
  tradeCenter!: BranchTradeCenterDto | null;

  @ApiProperty({
    type: [BranchTradeCenterFieldDto],
    description: 'Trade-center field values (empty when the branch is not in a center).',
  })
  tradeCenterFields!: BranchTradeCenterFieldDto[];

  static fromDomain(branch: Branch): BranchDto {
    const dto = new BranchDto();
    dto.id = branch.id;
    dto.businessId = branch.businessId;
    dto.name = branch.name;
    dto.location = LocationDto.fromDomain(branch.location);
    dto.phone = branch.phone;
    dto.workingHours = branch.workingHours.map(WorkingHoursDto.fromDomain);
    dto.deliveryZone =
      branch.deliveryZone === null ? null : DeliveryZoneDto.fromDomain(branch.deliveryZone);
    dto.isActive = branch.isActive;
    dto.tradeCenter =
      branch.tradeCenter === null ? null : BranchTradeCenterDto.fromDomain(branch.tradeCenter);
    dto.tradeCenterFields = branch.tradeCenterFields.map(BranchTradeCenterFieldDto.fromDomain);
    return dto;
  }
}
