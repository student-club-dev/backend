import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  EmploymentType,
  PropertyType,
  ServiceFormat,
  ServiceType,
  TaskCategory,
  TaskFormat,
  TenantGender,
  WorkShift,
} from '../../domain/enums/detail.enums';
import { StudentListingKind } from '../../domain/enums/student-listing-kind.enum';
import {
  EMPTY_KIND_FILTER,
  ListingSort,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  type GeoFilter,
  type KindFilter,
  type SearchCriteria,
} from '../../domain/search/search-criteria';
import {
  UZ_LAT_MAX,
  UZ_LAT_MIN,
  UZ_LNG_MAX,
  UZ_LNG_MIN,
} from '../../domain/validation/rules/location.rules';

/**
 * ⚠️ These four classes were called `GeoBoxDto`, `SearchGeoDto`, `SearchFilterDto` and
 * `SearchPageDto`. The discounts module has classes with those exact names, and an OpenAPI document
 * has one flat schema namespace — so `components.schemas.SearchFilterDto` was whichever module
 * happened to register last, and it was the discounts one. `POST /v1/student-listings/search` ended
 * up documented with the business-discount filter (`groupKeys`, `businessIds`, …) and a page object
 * with **no `cursor`**, which is why the app is still using the `GET` form.
 *
 * Nothing about the runtime was ever wrong — only the document generated from it. Unique names are
 * the only thing that makes a shared namespace safe.
 */
export class StudentListingBboxDto {
  @ApiProperty({ type: Number }) @IsNumber() @Min(UZ_LAT_MIN) @Max(UZ_LAT_MAX) minLat!: number;
  @ApiProperty({ type: Number }) @IsNumber() @Min(UZ_LNG_MIN) @Max(UZ_LNG_MAX) minLng!: number;
  @ApiProperty({ type: Number }) @IsNumber() @Min(UZ_LAT_MIN) @Max(UZ_LAT_MAX) maxLat!: number;
  @ApiProperty({ type: Number }) @IsNumber() @Min(UZ_LNG_MIN) @Max(UZ_LNG_MAX) maxLng!: number;
}

/** §7.2.3 — all three narrowing modes; any combination, or none at all. */
export class StudentListingGeoDto {
  @ApiPropertyOptional({ type: Number, example: 41.31 })
  @IsOptional()
  @IsNumber()
  @Min(UZ_LAT_MIN)
  @Max(UZ_LAT_MAX)
  lat?: number;

  @ApiPropertyOptional({ type: Number, example: 69.24 })
  @IsOptional()
  @IsNumber()
  @Min(UZ_LNG_MIN)
  @Max(UZ_LNG_MAX)
  lng?: number;

  @ApiPropertyOptional({ type: 'integer', example: 5000, description: 'Maksimal 200 000 m' })
  @IsOptional()
  @IsInt()
  @Min(1)
  radiusMeters?: number;

  @ApiPropertyOptional({ type: [String], example: ['TOSHKENT_SHAHRI'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  regionIds?: string[];

  @ApiPropertyOptional({ type: [String], example: ['CHILONZOR', 'UCHTEPA'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  districtIds?: string[];

  @ApiPropertyOptional({ type: StudentListingBboxDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StudentListingBboxDto)
  bbox?: StudentListingBboxDto;

  toDomain(): GeoFilter {
    return {
      lat: this.lat ?? null,
      lng: this.lng ?? null,
      radiusMeters: this.radiusMeters ?? null,
      regionIds: this.regionIds ?? [],
      districtIds: this.districtIds ?? [],
      bbox: this.bbox ?? null,
    };
  }
}

/**
 * §7.2.1 — one flat filter block covering every kind.
 *
 * A parameter belonging to another kind is accepted and ignored rather than rejected: the app
 * keeps stale values when the user switches tabs, and §7.2.5 is explicit that this must not error.
 */
export class StudentListingFilterDto {
  // RENTAL
  @ApiPropertyOptional({ enum: TenantGender })
  @IsOptional()
  @IsEnum(TenantGender)
  gender?: TenantGender;

  @ApiPropertyOptional({ enum: PropertyType })
  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(1)
  minRooms?: number;

  @ApiPropertyOptional({ type: Boolean, description: 'neededTenants > 0' })
  @IsOptional()
  @IsBoolean()
  onlyAvailable?: boolean;

  // SERVICE
  @ApiPropertyOptional({ enum: ServiceType })
  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @ApiPropertyOptional({ enum: ServiceFormat })
  @IsOptional()
  @IsEnum(ServiceFormat)
  serviceFormat?: ServiceFormat;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  onlyFreeTrial?: boolean;

  // JOB
  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employment?: EmploymentType;

  @ApiPropertyOptional({ type: String, example: 'COURIER' })
  @IsOptional()
  @IsString()
  jobCategoryKey?: string;

  @ApiPropertyOptional({ enum: WorkShift })
  @IsOptional()
  @IsEnum(WorkShift)
  shift?: WorkShift;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  noExperienceOnly?: boolean;

  // TASK
  @ApiPropertyOptional({ enum: TaskCategory })
  @IsOptional()
  @IsEnum(TaskCategory)
  taskCategory?: TaskCategory;

  @ApiPropertyOptional({ type: String, example: 'MATH' })
  @IsOptional()
  @IsString()
  taskTypeKey?: string;

  @ApiPropertyOptional({ enum: TaskFormat })
  @IsOptional()
  @IsEnum(TaskFormat)
  taskFormat?: TaskFormat;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  onlyOpenDeadline?: boolean;

  toDomain(): KindFilter {
    return {
      ...EMPTY_KIND_FILTER,
      gender: this.gender ?? null,
      propertyType: this.propertyType ?? null,
      minRooms: this.minRooms ?? null,
      onlyAvailable: this.onlyAvailable ?? false,
      serviceType: this.serviceType ?? null,
      serviceFormat: this.serviceFormat ?? null,
      onlyFreeTrial: this.onlyFreeTrial ?? false,
      employment: this.employment ?? null,
      jobCategoryKey: this.jobCategoryKey ?? null,
      shift: this.shift ?? null,
      noExperienceOnly: this.noExperienceOnly ?? false,
      taskCategory: this.taskCategory ?? null,
      taskTypeKey: this.taskTypeKey ?? null,
      taskFormat: this.taskFormat ?? null,
      onlyOpenDeadline: this.onlyOpenDeadline ?? false,
    };
  }
}

export class ListingPageRequestDto {
  @ApiPropertyOptional({ type: 'integer', default: PAGE_SIZE_DEFAULT, maximum: PAGE_SIZE_MAX })
  @IsOptional()
  @IsInt()
  @Min(1)
  size?: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description: '1-dan boshlanadi. `cursor` bilan birga kelsa `cursor` ustun turadi (§7.2.2)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  number?: number;
}

/** `POST /v1/student-listings/search` (§7.2.1). */
export class SearchListingsDto {
  @ApiProperty({ enum: StudentListingKind, description: 'MAJBURIY — turlar aralashmaydi' })
  @IsEnum(StudentListingKind)
  kind!: StudentListingKind;

  @ApiPropertyOptional({ type: String, example: 'Chilonzor' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ type: StudentListingGeoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StudentListingGeoDto)
  geo?: StudentListingGeoDto;

  @ApiPropertyOptional({ type: 'integer', format: 'int64' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int64', example: 2000000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ type: StudentListingFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StudentListingFilterDto)
  filter?: StudentListingFilterDto;

  @ApiPropertyOptional({ enum: ListingSort, default: ListingSort.NEWEST })
  @IsOptional()
  @IsEnum(ListingSort)
  sort?: ListingSort;

  @ApiPropertyOptional({ type: ListingPageRequestDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ListingPageRequestDto)
  page?: ListingPageRequestDto;

  toCriteria(viewerId: string): SearchCriteria {
    return {
      kind: this.kind,
      query: this.query ?? null,
      geo: this.geo?.toDomain() ?? null,
      minPrice: this.minPrice ?? null,
      maxPrice: this.maxPrice ?? null,
      filter: this.filter?.toDomain() ?? { ...EMPTY_KIND_FILTER },
      sort: this.sort ?? ListingSort.NEWEST,
      size: this.page?.size ?? PAGE_SIZE_DEFAULT,
      cursor: this.page?.cursor ?? null,
      page: this.page?.number ?? null,
      viewerId,
    };
  }
}

/** Comma-separated query values, e.g. `districtIds=CHILONZOR,UCHTEPA`. */
function csv(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Query strings carry everything as text; `?flag=true` should mean the boolean. */
function bool(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === 'true' || value === true;
}

/**
 * `GET /v1/student-listings?...` (§7.2.5) — the same search through query parameters, for tab
 * switches and deep links. It produces the identical `SearchCriteria`, so the two endpoints share
 * one code path rather than two implementations that can disagree.
 */
export class SearchListingsQueryDto {
  @ApiProperty({ enum: StudentListingKind })
  @IsEnum(StudentListingKind)
  kind!: StudentListingKind;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(UZ_LAT_MIN)
  @Max(UZ_LAT_MAX)
  lat?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(UZ_LNG_MIN)
  @Max(UZ_LNG_MAX)
  lng?: number;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  radiusMeters?: number;

  @ApiPropertyOptional({ type: String, description: 'Vergul bilan: TOSHKENT_SHAHRI,ANDIJON' })
  @IsOptional()
  @IsString()
  regionIds?: string;

  @ApiPropertyOptional({ type: String, description: 'Vergul bilan: CHILONZOR,UCHTEPA' })
  @IsOptional()
  @IsString()
  districtIds?: string;

  @ApiPropertyOptional({ type: 'integer', format: 'int64' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int64' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  // Per-kind filters, flattened.
  @ApiPropertyOptional({ enum: TenantGender })
  @IsOptional()
  @IsEnum(TenantGender)
  gender?: TenantGender;

  @ApiPropertyOptional({ enum: PropertyType })
  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minRooms?: number;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) => bool(value))
  @IsBoolean()
  onlyAvailable?: boolean;

  @ApiPropertyOptional({ enum: ServiceType })
  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @ApiPropertyOptional({ enum: ServiceFormat })
  @IsOptional()
  @IsEnum(ServiceFormat)
  serviceFormat?: ServiceFormat;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) => bool(value))
  @IsBoolean()
  onlyFreeTrial?: boolean;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employment?: EmploymentType;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  jobCategoryKey?: string;

  @ApiPropertyOptional({ enum: WorkShift })
  @IsOptional()
  @IsEnum(WorkShift)
  shift?: WorkShift;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) => bool(value))
  @IsBoolean()
  noExperienceOnly?: boolean;

  @ApiPropertyOptional({ enum: TaskCategory })
  @IsOptional()
  @IsEnum(TaskCategory)
  taskCategory?: TaskCategory;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  taskTypeKey?: string;

  @ApiPropertyOptional({ enum: TaskFormat })
  @IsOptional()
  @IsEnum(TaskFormat)
  taskFormat?: TaskFormat;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) => bool(value))
  @IsBoolean()
  onlyOpenDeadline?: boolean;

  @ApiPropertyOptional({ enum: ListingSort })
  @IsOptional()
  @IsEnum(ListingSort)
  sort?: ListingSort;

  @ApiPropertyOptional({ type: 'integer' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  size?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  toCriteria(viewerId: string): SearchCriteria {
    const hasGeo =
      this.lat !== undefined ||
      this.lng !== undefined ||
      this.radiusMeters !== undefined ||
      this.regionIds !== undefined ||
      this.districtIds !== undefined;

    return {
      kind: this.kind,
      query: this.query ?? null,
      geo: hasGeo
        ? {
            lat: this.lat ?? null,
            lng: this.lng ?? null,
            radiusMeters: this.radiusMeters ?? null,
            regionIds: csv(this.regionIds),
            districtIds: csv(this.districtIds),
            bbox: null,
          }
        : null,
      minPrice: this.minPrice ?? null,
      maxPrice: this.maxPrice ?? null,
      filter: {
        ...EMPTY_KIND_FILTER,
        gender: this.gender ?? null,
        propertyType: this.propertyType ?? null,
        minRooms: this.minRooms ?? null,
        onlyAvailable: this.onlyAvailable ?? false,
        serviceType: this.serviceType ?? null,
        serviceFormat: this.serviceFormat ?? null,
        onlyFreeTrial: this.onlyFreeTrial ?? false,
        employment: this.employment ?? null,
        jobCategoryKey: this.jobCategoryKey ?? null,
        shift: this.shift ?? null,
        noExperienceOnly: this.noExperienceOnly ?? false,
        taskCategory: this.taskCategory ?? null,
        taskTypeKey: this.taskTypeKey ?? null,
        taskFormat: this.taskFormat ?? null,
        onlyOpenDeadline: this.onlyOpenDeadline ?? false,
      },
      sort: this.sort ?? ListingSort.NEWEST,
      size: this.size ?? PAGE_SIZE_DEFAULT,
      cursor: this.cursor ?? null,
      page: this.page ?? null,
      viewerId,
    };
  }
}
