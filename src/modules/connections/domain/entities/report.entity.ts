import { ReportReason } from '../enums/report-reason.enum';
import { ReportStatus } from '../enums/report-status.enum';

/** An abuse report against a student or a message (C12). */
export interface Report {
  id: string;
  reporterId: string;
  targetStudentId: string | null;
  messageId: string | null;
  reason: ReportReason;
  note: string | null;
  contentSnapshot: string | null;
  status: ReportStatus;
  createdAt: Date;
}
