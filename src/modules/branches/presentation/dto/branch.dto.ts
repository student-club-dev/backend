import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Branch } from '../../domain/entities/branch.entity';
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

  @ApiPropertyOptional({ nullable: true })
  phone!: string | null;

  @ApiProperty({ type: [WorkingHoursDto] })
  workingHours!: WorkingHoursDto[];

  @ApiPropertyOptional({ type: DeliveryZoneDto, nullable: true })
  deliveryZone!: DeliveryZoneDto | null;

  @ApiProperty()
  isActive!: boolean;

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
    return dto;
  }
}
