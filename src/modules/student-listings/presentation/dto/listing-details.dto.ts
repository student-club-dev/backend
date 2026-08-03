import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type {
  JobDetails,
  JobSchedule,
  RentalDetails,
  ServiceDetails,
  StudentListingDetails,
  TaskDetails,
} from '../../domain/entities/student-listing.entity';
import {
  EmploymentType,
  ExperienceLevel,
  PayPeriod,
  PropertyType,
  RentPeriod,
  ServiceFormat,
  ServiceType,
  TaskCategory,
  TaskFormat,
  TenantGender,
  WeekDay,
  WorkShift,
} from '../../domain/enums/detail.enums';
import { StudentListingKind } from '../../domain/enums/student-listing-kind.enum';

/**
 * The kind-specific half of a listing (§4), discriminated on `kind`.
 *
 * Every field except `kind` is optional at this layer. That is deliberate: a DRAFT is saved with
 * whatever the student has typed so far (§6.1), so rejecting a half-filled form here would make
 * drafts impossible. Presence is enforced at publish time by the domain rules instead.
 */

function toDate(value?: string): Date | null {
  return value === undefined ? null : new Date(value);
}

export class TaskDetailsDto {
  @ApiProperty({ enum: [StudentListingKind.TASK] })
  @IsEnum(StudentListingKind)
  kind!: StudentListingKind;

  @ApiPropertyOptional({ enum: TaskCategory })
  @IsOptional()
  @IsEnum(TaskCategory)
  category?: TaskCategory;

  @ApiPropertyOptional({ example: 'MATH' })
  @IsOptional()
  @IsString()
  typeKey?: string;

  @ApiPropertyOptional({ description: '`typeKey` = OTHER bo‘lsa majburiy' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customTypeName?: string;

  @ApiPropertyOptional({ example: '2026-08-14T18:00:00Z' })
  @IsOptional()
  @IsISO8601()
  deadline?: string;

  @ApiPropertyOptional({ enum: TaskFormat })
  @IsOptional()
  @IsEnum(TaskFormat)
  format?: TaskFormat;

  @ApiPropertyOptional({ example: '12 ta masala' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  volume?: string;

  toDomain(): TaskDetails {
    return {
      kind: StudentListingKind.TASK,
      category: this.category ?? null,
      typeKey: this.typeKey ?? null,
      customTypeName: this.customTypeName ?? null,
      deadline: toDate(this.deadline),
      format: this.format ?? null,
      volume: this.volume ?? null,
    };
  }
}

export class RentalDetailsDto {
  @ApiProperty({ enum: [StudentListingKind.RENTAL] })
  @IsEnum(StudentListingKind)
  kind!: StudentListingKind;

  @ApiPropertyOptional({ enum: PropertyType })
  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  roomCount?: number;

  @ApiPropertyOptional({ example: 2, description: '0 — uy bo‘sh' })
  @IsOptional()
  @IsInt()
  currentTenants?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  neededTenants?: number;

  @ApiPropertyOptional({ enum: TenantGender })
  @IsOptional()
  @IsEnum(TenantGender)
  gender?: TenantGender;

  @ApiPropertyOptional({ enum: RentPeriod })
  @IsOptional()
  @IsEnum(RentPeriod)
  period?: RentPeriod;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  utilitiesIncluded?: boolean;

  @ApiPropertyOptional({ description: 'null — depozit yo‘q' })
  @IsOptional()
  @IsInt()
  depositMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  floor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  totalFloors?: number;

  @ApiPropertyOptional({ type: [String], example: ['WIFI', 'NEAR_METRO'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  amenities?: string[];

  @ApiPropertyOptional({ description: 'null — hoziroq' })
  @IsOptional()
  @IsISO8601()
  availableFrom?: string;

  toDomain(): RentalDetails {
    return {
      kind: StudentListingKind.RENTAL,
      propertyType: this.propertyType ?? null,
      roomCount: this.roomCount ?? null,
      currentTenants: this.currentTenants ?? null,
      neededTenants: this.neededTenants ?? null,
      gender: this.gender ?? null,
      period: this.period ?? null,
      utilitiesIncluded: this.utilitiesIncluded ?? false,
      depositMonths: this.depositMonths ?? null,
      floor: this.floor ?? null,
      totalFloors: this.totalFloors ?? null,
      amenities: this.amenities ?? [],
      availableFrom: toDate(this.availableFrom),
    };
  }
}

export class ServiceDetailsDto {
  @ApiProperty({ enum: [StudentListingKind.SERVICE] })
  @IsEnum(StudentListingKind)
  kind!: StudentListingKind;

  @ApiPropertyOptional({ enum: ServiceType })
  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Sohaga xos maydonlar (ServiceCatalog kalitlari bo‘yicha)',
  })
  @IsOptional()
  @IsObject()
  fields?: Record<string, string>;

  @ApiPropertyOptional({ enum: ServiceFormat })
  @IsOptional()
  @IsEnum(ServiceFormat)
  format?: ServiceFormat;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  experienceYears?: number;

  @ApiPropertyOptional({ example: '09:00 — 21:00' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  workingHours?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasHomeVisit?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasFreeTrial?: boolean;

  toDomain(): ServiceDetails {
    return {
      kind: StudentListingKind.SERVICE,
      serviceType: this.serviceType ?? null,
      fields: this.fields ?? {},
      format: this.format ?? null,
      experienceYears: this.experienceYears ?? null,
      workingHours: this.workingHours ?? null,
      hasHomeVisit: this.hasHomeVisit ?? false,
      hasFreeTrial: this.hasFreeTrial ?? false,
    };
  }
}

export class JobScheduleDto {
  @ApiPropertyOptional({ enum: WeekDay, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(WeekDay, { each: true })
  days?: WeekDay[];

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  startTime?: string;

  @ApiPropertyOptional({ example: '17:00' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  endTime?: string;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  hoursPerDay?: number;

  toDomain(): JobSchedule {
    return {
      days: this.days ?? [],
      startTime: this.startTime ?? null,
      endTime: this.endTime ?? null,
      hoursPerDay: this.hoursPerDay ?? null,
    };
  }
}

export class JobDetailsDto {
  @ApiProperty({ enum: [StudentListingKind.JOB] })
  @IsEnum(StudentListingKind)
  kind!: StudentListingKind;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employment?: EmploymentType;

  @ApiPropertyOptional({ example: 'COURIER' })
  @IsOptional()
  @IsString()
  categoryKey?: string;

  @ApiPropertyOptional({ example: 'Express Delivery' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @ApiPropertyOptional({ enum: WorkShift })
  @IsOptional()
  @IsEnum(WorkShift)
  shift?: WorkShift;

  @ApiPropertyOptional({ type: JobScheduleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => JobScheduleDto)
  schedule?: JobScheduleDto;

  @ApiPropertyOptional({ enum: PayPeriod })
  @IsOptional()
  @IsEnum(PayPeriod)
  payPeriod?: PayPeriod;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  vacancies?: number;

  @ApiPropertyOptional({ enum: TenantGender, description: 'null — farqi yo‘q' })
  @IsOptional()
  @IsEnum(TenantGender)
  gender?: TenantGender;

  @ApiPropertyOptional({ enum: ExperienceLevel })
  @IsOptional()
  @IsEnum(ExperienceLevel)
  experience?: ExperienceLevel;

  @ApiPropertyOptional({ example: 18 })
  @IsOptional()
  @IsInt()
  ageFrom?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  ageTo?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  requirements?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  benefits?: string[];

  @ApiPropertyOptional({ description: 'DAILY da majburiy, PERMANENT da null' })
  @IsOptional()
  @IsISO8601()
  workDate?: string;

  @ApiPropertyOptional({ example: 'Ish kuni oxirida' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  payoutNote?: string;

  toDomain(): JobDetails {
    return {
      kind: StudentListingKind.JOB,
      employment: this.employment ?? null,
      categoryKey: this.categoryKey ?? null,
      companyName: this.companyName ?? null,
      shift: this.shift ?? null,
      schedule: this.schedule?.toDomain() ?? {
        days: [],
        startTime: null,
        endTime: null,
        hoursPerDay: null,
      },
      payPeriod: this.payPeriod ?? null,
      vacancies: this.vacancies ?? null,
      gender: this.gender ?? null,
      experience: this.experience ?? null,
      ageFrom: this.ageFrom ?? null,
      ageTo: this.ageTo ?? null,
      requirements: this.requirements ?? [],
      benefits: this.benefits ?? [],
      workDate: toDate(this.workDate),
      payoutNote: this.payoutNote ?? null,
    };
  }
}

export type ListingDetailsDto =
  TaskDetailsDto | RentalDetailsDto | ServiceDetailsDto | JobDetailsDto;

/** The subtypes class-transformer picks between, keyed by `details.kind`. */
export const DETAILS_SUBTYPES = [
  { value: TaskDetailsDto, name: StudentListingKind.TASK },
  { value: RentalDetailsDto, name: StudentListingKind.RENTAL },
  { value: ServiceDetailsDto, name: StudentListingKind.SERVICE },
  { value: JobDetailsDto, name: StudentListingKind.JOB },
] as const;

/**
 * Converts whichever subtype arrived into its domain shape.
 *
 * The instanceof ladder is not decoration: class-transformer's discriminator produces a real
 * subclass instance, and this is what turns that back into a typed union the domain understands.
 */
export function detailsToDomain(dto: ListingDetailsDto): StudentListingDetails {
  return dto.toDomain();
}
