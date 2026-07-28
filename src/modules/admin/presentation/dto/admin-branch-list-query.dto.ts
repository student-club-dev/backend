import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { GeoBox } from '../../../../common/geo/geo-box';
import { GeoScope } from '../../../../common/geo/geo-scope';
import {
  AdminBranchGeoFilter,
  AdminBranchListFilter,
} from '../../domain/admin-branch-read.repository';
import { AdminBranchSort } from '../../domain/enums/admin-branch-sort.enum';
import {
  ADMIN_LIST_DEFAULT_PAGE,
  ADMIN_LIST_DEFAULT_SIZE,
  ADMIN_LIST_MAX_SIZE,
  toQueryBoolean,
} from './admin-user-list-query.dto';

const DEFAULT_RADIUS_METERS = 5000;
const MAX_RADIUS_METERS = 50_000;

/**
 * Query for `GET /v1/admin/branches`. `q` matches name / address (case-insensitive contains). The
 * optional proximity filter is either a bounding box (all four of `minLat`/`minLng`/`maxLat`/`maxLng`)
 * or a point + radius (`lat`+`lng`, `radiusMeters` defaulting to 5000); when both are complete the
 * bbox wins. Every parameter is optional; absent `page`/`size` default to 1/20 (max size 100).
 */
export class AdminBranchListQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search over name / address.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Keep only branches of this business.' })
  @IsOptional()
  @IsString()
  businessId?: string;

  @ApiPropertyOptional({ description: 'Keep only branches whose business belongs to this owner.' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Keep only branches in this region.' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ description: 'Keep only branches in this district.' })
  @IsOptional()
  @IsString()
  districtId?: string;

  @ApiPropertyOptional({ description: 'Keep only branches in this trade center.' })
  @IsOptional()
  @IsString()
  tradeCenterId?: string;

  @ApiPropertyOptional({ description: 'Keep only active (or only inactive) branches.' })
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Keep only branches whose delivery zone is enabled.' })
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  hasDelivery?: boolean;

  @ApiPropertyOptional({
    format: 'double',
    description: 'Bbox — south edge. Required with the other three bbox corners.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  minLat?: number;

  @ApiPropertyOptional({ format: 'double', description: 'Bbox — west edge.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  minLng?: number;

  @ApiPropertyOptional({ format: 'double', description: 'Bbox — north edge.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  maxLat?: number;

  @ApiPropertyOptional({ format: 'double', description: 'Bbox — east edge.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  maxLng?: number;

  @ApiPropertyOptional({
    format: 'double',
    description: 'Radius centre latitude. Required with `lng`.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({
    format: 'double',
    description: 'Radius centre longitude. Required with `lat`.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({
    format: 'int32',
    minimum: 1,
    maximum: MAX_RADIUS_METERS,
    default: DEFAULT_RADIUS_METERS,
    description: 'Radius in metres around `lat`/`lng` (default 5000).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RADIUS_METERS)
  radiusMeters?: number;

  @ApiPropertyOptional({
    enum: AdminBranchSort,
    enumName: 'AdminBranchSortDto',
    default: AdminBranchSort.NEWEST,
    description: '`NEWEST` (default) by createdAt, `NAME` alphabetical.',
  })
  @IsOptional()
  @IsEnum(AdminBranchSort)
  sort?: AdminBranchSort;

  @ApiPropertyOptional({ minimum: 1, default: ADMIN_LIST_DEFAULT_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: ADMIN_LIST_MAX_SIZE,
    default: ADMIN_LIST_DEFAULT_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_LIST_MAX_SIZE)
  size?: number;

  toFilter(): AdminBranchListFilter {
    return {
      q: this.q ?? null,
      businessId: this.businessId ?? null,
      ownerId: this.ownerId ?? null,
      regionId: this.regionId ?? null,
      districtId: this.districtId ?? null,
      tradeCenterId: this.tradeCenterId ?? null,
      isActive: this.isActive ?? null,
      hasDelivery: this.hasDelivery ?? null,
      geo: this.toGeo(),
      sort: this.sort ?? AdminBranchSort.NEWEST,
      page: this.page ?? ADMIN_LIST_DEFAULT_PAGE,
      size: this.size ?? ADMIN_LIST_DEFAULT_SIZE,
    };
  }

  /** Bbox (all four corners) takes precedence; otherwise a complete `lat`+`lng` point; else no geo. */
  private toGeo(): AdminBranchGeoFilter | null {
    const box = this.toBox();
    if (box !== null) {
      return { mode: 'BBOX', box };
    }
    const scope = this.toScope();
    if (scope !== null) {
      return { mode: 'RADIUS', scope };
    }
    return null;
  }

  private toBox(): GeoBox | null {
    if (
      this.minLat === undefined ||
      this.minLng === undefined ||
      this.maxLat === undefined ||
      this.maxLng === undefined
    ) {
      return null;
    }
    return { minLat: this.minLat, minLng: this.minLng, maxLat: this.maxLat, maxLng: this.maxLng };
  }

  private toScope(): GeoScope | null {
    if (this.lat === undefined || this.lng === undefined) {
      return null;
    }
    return {
      lat: this.lat,
      lng: this.lng,
      radiusMeters: this.radiusMeters ?? DEFAULT_RADIUS_METERS,
    };
  }
}
