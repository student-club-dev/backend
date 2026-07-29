import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { Report } from '../domain/entities/report.entity';
import { ReportReason } from '../domain/enums/report-reason.enum';
import {
  MESSAGE_DIRECTORY,
  MessageDirectoryRepository,
} from '../domain/message-directory.repository';
import { REPORTS_REPOSITORY, ReportsRepository } from '../domain/reports.repository';
import {
  STUDENT_DIRECTORY,
  StudentDirectoryRepository,
} from '../domain/student-directory.repository';

/** Normalised report payload (from CreateReportDto). Exactly one target is set (service-enforced). */
export interface ReportInput {
  targetStudentId: string | null;
  messageId: string | null;
  reason: ReportReason;
  note: string | null;
}

/**
 * Abuse-report use-case (C12). Exactly one target (a student OR a message). Duplicate open reports
 * by the same reporter against the same target are coalesced. A message target is resolved through
 * the reporter's own conversations and snapshotted, so moderation always has something to open.
 */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(REPORTS_REPOSITORY) private readonly reports: ReportsRepository,
    @Inject(STUDENT_DIRECTORY) private readonly directory: StudentDirectoryRepository,
    @Inject(MESSAGE_DIRECTORY) private readonly messages: MessageDirectoryRepository,
  ) {}

  async report(user: AuthenticatedUser, input: ReportInput): Promise<Report> {
    const { targetStudentId, messageId, reason, note } = input;

    // Exactly one target — reject both-or-neither.
    if ((targetStudentId === null) === (messageId === null)) {
      throw new AppException(
        ERROR_CODE.REPORT_TARGET_INVALID,
        422,
        "Shikoyat uchun foydalanuvchi yoki xabar ko'rsatilishi kerak",
      );
    }

    if (targetStudentId !== null) {
      if (targetStudentId === user.id) {
        throw new AppException(
          ERROR_CODE.REPORT_TARGET_INVALID,
          422,
          "O'zingizni shikoyat qila olmaysiz",
        );
      }
      if (!(await this.directory.exists(targetStudentId))) {
        throw AppException.notFound(ERROR_CODE.STUDENT_NOT_FOUND, 'Foydalanuvchi topilmadi');
      }
    }

    // A report must point at something a moderator can actually open. An unknown id — or one from
    // someone else's conversation — used to be accepted, leaving dangling rows in the queue (§17.4).
    let contentSnapshot: string | null = null;
    if (messageId !== null) {
      const message = await this.messages.findReportable(messageId, user.id);
      if (message === null) {
        throw new AppException(ERROR_CODE.MESSAGE_NOT_FOUND, 422, 'Xabar topilmadi');
      }
      // Snapshot now: the sender may delete the message before a moderator reaches the report.
      contentSnapshot = message.body;
    }

    const existing = await this.reports.findOpenReport(user.id, targetStudentId, messageId);
    if (existing !== null) {
      return existing; // coalesce duplicate open reports (C12)
    }

    return this.reports.create({
      reporterId: user.id,
      targetStudentId,
      messageId,
      reason,
      note,
      contentSnapshot,
    });
  }
}
