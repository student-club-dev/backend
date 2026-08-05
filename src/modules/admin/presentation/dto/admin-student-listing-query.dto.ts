import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ListingStatus } from '../../../listings/domain/enums/listing-status.enum';
import { StudentListingKind } from '../../../student-listings/domain/enums/student-listing-kind.enum';
import { ADMIN_LIST_MAX_SIZE } from './admin-user-list-query.dto';

/** Query for `GET /v1/admin/student-listings`. Every field narrows; omitting one means "any". */
export class AdminStudentListingQueryDto {
  @ApiPropertyOptional({
    description: 'Sarlavha yoki tavsif bo‘yicha qidiruv (registrga bog‘liq emas)',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: StudentListingKind })
  @IsOptional()
  @IsEnum(StudentListingKind)
  kind?: StudentListingKind;

  @ApiPropertyOptional({
    enum: ListingStatus,
    isArray: true,
    description:
      'Vergul bilan: `status=ACTIVE,PAUSED`. Berilmasa — **hamma** status, jumladan DRAFT va ' +
      'ARCHIVED (talaba qidiruvidan farqli).',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map((part) => part.trim()) : value,
  )
  @IsArray()
  @IsEnum(ListingStatus, { each: true })
  status?: ListingStatus[];

  @ApiPropertyOptional({ description: 'Faqat shu talabaning e’lonlari' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description:
      'Egasi o‘chirgan e’lonlarni ham ko‘rsatish. Odatiy holda yashiriladi — o‘chirilgan e’lon ' +
      'ustida qiladigan ish qolmaydi.',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional({ type: 'integer', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: 'integer', default: 20, maximum: ADMIN_LIST_MAX_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_LIST_MAX_SIZE)
  size?: number;
}
