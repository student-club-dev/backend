import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { WorkingHours } from '../../domain/entities/branch.entity';
import { DayOfWeek } from '../../domain/enums/day-of-week.enum';

/**
 * WorkingHoursDto — one day's opening hours (matches elon-uz.json). When `close` < `open` the
 * venue stays open overnight (e.g. 20:00-04:00).
 */
export class WorkingHoursDto {
  @ApiProperty({ enum: DayOfWeek, enumName: 'DayOfWeekDto' })
  @IsEnum(DayOfWeek)
  day!: DayOfWeek;

  @ApiPropertyOptional({ nullable: true, example: '09:00' })
  @IsOptional()
  @IsString()
  open?: string;

  @ApiPropertyOptional({ nullable: true, example: '23:00' })
  @IsOptional()
  @IsString()
  close?: string;

  @ApiProperty()
  @IsBoolean()
  isClosed!: boolean;

  toDomain(): WorkingHours {
    return {
      day: this.day,
      open: this.open ?? null,
      close: this.close ?? null,
      isClosed: this.isClosed,
    };
  }

  static fromDomain(hours: WorkingHours): WorkingHoursDto {
    const dto = new WorkingHoursDto();
    dto.day = hours.day;
    dto.open = hours.open ?? undefined;
    dto.close = hours.close ?? undefined;
    dto.isClosed = hours.isClosed;
    return dto;
  }
}
