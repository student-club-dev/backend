import { Report } from './entities/report.entity';
import { ReportReason } from './enums/report-reason.enum';

/** Injection token for the reports repository port (bound to the Prisma impl). */
export const REPORTS_REPOSITORY = Symbol('REPORTS_REPOSITORY');

/** Fields for a new report. Exactly one of `targetStudentId` / `messageId` is set (service-enforced). */
export interface CreateReportData {
  reporterId: string;
  targetStudentId: string | null;
  messageId: string | null;
  reason: ReportReason;
  note: string | null;
  contentSnapshot: string | null;
}

/** Report data access. Application depends on this interface only; Prisma impl in infrastructure. */
export interface ReportsRepository {
  /** The reporter's existing OPEN report against the same target, or `null` (coalesce, C12). */
  findOpenReport(
    reporterId: string,
    targetStudentId: string | null,
    messageId: string | null,
  ): Promise<Report | null>;

  create(data: CreateReportData): Promise<Report>;
}
