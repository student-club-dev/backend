import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportInput } from '../../application/reports.service';
import { ReportReason } from '../../domain/enums/report-reason.enum';

/** Body of `POST /v1/connections/requests`. */
export class SendConnectionRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  addresseeId!: string;
}

/** Body of `POST /v1/blocks`. */
export class BlockDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId!: string;
}

/** Body of `POST /v1/reports` (C12). Exactly one of `targetStudentId` / `messageId` (service-checked). */
export class CreateReportDto {
  @ApiPropertyOptional({ description: 'Report a student (mutually exclusive with messageId)' })
  @IsOptional()
  @IsString()
  targetStudentId?: string;

  @ApiPropertyOptional({
    description: 'Report a message (mutually exclusive with targetStudentId)',
  })
  @IsOptional()
  @IsString()
  messageId?: string;

  @ApiProperty({ enum: ReportReason, enumName: 'ReportReasonDto' })
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  toInput(): ReportInput {
    return {
      targetStudentId: this.targetStudentId ?? null,
      messageId: this.messageId ?? null,
      reason: this.reason,
      note: this.note ?? null,
    };
  }
}
