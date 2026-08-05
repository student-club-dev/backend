import { Injectable } from '@nestjs/common';
import {
  Report as PrismaReport,
  ReportReason as PrismaReportReason,
  ReportStatus as PrismaReportStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { Report } from '../domain/entities/report.entity';
import { ReportReason } from '../domain/enums/report-reason.enum';
import { ReportStatus } from '../domain/enums/report-status.enum';
import { CreateReportData, ReportsRepository } from '../domain/reports.repository';

/** Prisma implementation of the reports port. Prisma is used ONLY here. */
@Injectable()
export class ReportPrismaRepository implements ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOpenReport(
    reporterId: string,
    targetStudentId: string | null,
    messageId: string | null,
    callId: string | null,
  ): Promise<Report | null> {
    const row = await this.prisma.report.findFirst({
      where: { reporterId, status: PrismaReportStatus.OPEN, targetStudentId, messageId, callId },
    });
    return row === null ? null : toDomain(row);
  }

  async create(data: CreateReportData): Promise<Report> {
    const row = await this.prisma.report.create({
      data: {
        reporterId: data.reporterId,
        targetStudentId: data.targetStudentId,
        messageId: data.messageId,
        callId: data.callId,
        reason: PrismaReportReason[data.reason],
        note: data.note,
        contentSnapshot: data.contentSnapshot,
      },
    });
    return toDomain(row);
  }
}

function toDomain(row: PrismaReport): Report {
  return {
    id: row.id,
    reporterId: row.reporterId,
    targetStudentId: row.targetStudentId,
    messageId: row.messageId,
    callId: row.callId,
    reason: ReportReason[row.reason],
    note: row.note,
    contentSnapshot: row.contentSnapshot,
    status: ReportStatus[row.status],
    createdAt: row.createdAt,
  };
}
