import { ApiProperty } from '@nestjs/swagger';
import { Report } from '../../domain/entities/report.entity';
import { ReportReason } from '../../domain/enums/report-reason.enum';
import { ReportStatus } from '../../domain/enums/report-status.enum';

/** A submitted report as echoed back to the reporter. */
export class ReportDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ReportReason, enumName: 'ReportReasonDto' })
  reason!: ReportReason;

  @ApiProperty({ enum: ReportStatus, enumName: 'ReportStatusDto' })
  status!: ReportStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static fromDomain(report: Report): ReportDto {
    const dto = new ReportDto();
    dto.id = report.id;
    dto.reason = report.reason;
    dto.status = report.status;
    dto.createdAt = report.createdAt.toISOString();
    return dto;
  }
}
