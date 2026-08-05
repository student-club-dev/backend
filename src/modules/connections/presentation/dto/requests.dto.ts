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

/** Body of `POST /v1/reports` (C12). Exactly one of `targetStudentId` / `messageId` / `callId`. */
export class CreateReportDto {
  @ApiPropertyOptional({ description: 'Report a student (mutually exclusive with messageId)' })
  @IsOptional()
  @IsString()
  targetStudentId?: string;

  @ApiPropertyOptional({
    description: 'Report a message (mutually exclusive with the other two)',
  })
  @IsOptional()
  @IsString()
  messageId?: string;

  @ApiPropertyOptional({
    description:
      'Report a call the reporter took part in (calls spec §14). Mutually exclusive with the ' +
      'other two.',
  })
  @IsOptional()
  @IsString()
  callId?: string;

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
      callId: this.callId ?? null,
      reason: this.reason,
      note: this.note ?? null,
    };
  }
}
