import { ApiProperty } from '@nestjs/swagger';
import {
  BranchTradeCenterDto,
  BranchTradeCenterFieldDto,
} from '../../../branches/presentation/dto/branch-trade-center.dto';
import { DeliveryZoneDto } from '../../../branches/presentation/dto/delivery-zone.dto';
import { LocationDto } from '../../../branches/presentation/dto/location.dto';
import { WorkingHoursDto } from '../../../branches/presentation/dto/working-hours.dto';
import { AdminBranchPage } from '../../domain/admin-branch-read.repository';
import { AdminBranch, AdminBranchSummary } from '../../domain/entities/admin-branch.entity';

/** One branch row in the admin list. */
export class AdminBranchSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  businessName!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  regionId!: string;

  @ApiProperty()
  regionName!: string;

  @ApiProperty()
  districtName!: string;

  @ApiProperty()
  address!: string;

  @ApiProperty({ format: 'double', example: 41.2856 })
  lat!: number;

  @ApiProperty({ format: 'double', example: 69.2034 })
  lng!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Trade center name, or null when not in a center.',
  })
  tradeCenterName!: string | null;

  static fromDomain(branch: AdminBranchSummary): AdminBranchSummaryDto {
    const dto = new AdminBranchSummaryDto();
    dto.id = branch.id;
    dto.businessId = branch.businessId;
    dto.businessName = branch.businessName;
    dto.name = branch.name;
    dto.regionId = branch.regionId;
    dto.regionName = branch.regionName;
    dto.districtName = branch.districtName;
    dto.address = branch.address;
    dto.lat = branch.lat;
    dto.lng = branch.lng;
    dto.isActive = branch.isActive;
    dto.tradeCenterName = branch.tradeCenterName;
    return dto;
  }
}

/** A page of branch summaries — matches the CLAUDE.md pagination envelope. */
export class AdminBranchPageDto {
  @ApiProperty({ type: [AdminBranchSummaryDto] })
  items!: AdminBranchSummaryDto[];

  @ApiProperty({ type: 'integer', format: 'int32', example: 1 })
  page!: number;

  @ApiProperty({ type: 'integer', format: 'int32', example: 20 })
  size!: number;

  @ApiProperty({ type: 'integer', format: 'int64', example: 42 })
  total!: number;

  @ApiProperty({ example: true })
  hasNext!: boolean;

  static fromPage(page: AdminBranchPage, pageNumber: number, size: number): AdminBranchPageDto {
    const dto = new AdminBranchPageDto();
    dto.items = page.items.map(AdminBranchSummaryDto.fromDomain);
    dto.page = pageNumber;
    dto.size = size;
    dto.total = page.total;
    dto.hasNext = pageNumber * size < page.total;
    return dto;
  }
}

/**
 * The full branch record for the admin detail view — every branch field (location, working hours,
 * delivery zone, trade-center fields) plus the joined business name and the location's resolved
 * region / district names. Admin sees any branch across businesses.
 */
export class AdminBranchDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  businessId!: string;

  @ApiProperty()
  businessName!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: LocationDto })
  location!: LocationDto;

  @ApiProperty({ description: "Resolved name of the location's region." })
  regionName!: string;

  @ApiProperty({ description: "Resolved name of the location's district." })
  districtName!: string;

  @ApiProperty({ type: [WorkingHoursDto] })
  workingHours!: WorkingHoursDto[];

  @ApiProperty({ type: DeliveryZoneDto, nullable: true })
  deliveryZone!: DeliveryZoneDto | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: BranchTradeCenterDto, nullable: true })
  tradeCenter!: BranchTradeCenterDto | null;

  @ApiProperty({ type: [BranchTradeCenterFieldDto] })
  tradeCenterFields!: BranchTradeCenterFieldDto[];

  static fromDomain(admin: AdminBranch): AdminBranchDto {
    const branch = admin.branch;
    const dto = new AdminBranchDto();
    dto.id = branch.id;
    dto.businessId = branch.businessId;
    dto.businessName = admin.businessName;
    dto.name = branch.name;
    dto.phone = branch.phone;
    dto.location = LocationDto.fromDomain(branch.location);
    dto.regionName = admin.regionName;
    dto.districtName = admin.districtName;
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
