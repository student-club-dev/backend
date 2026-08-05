import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { Report } from '../domain/entities/report.entity';
import { ReportReason } from '../domain/enums/report-reason.enum';
import { ReportStatus } from '../domain/enums/report-status.enum';
import {
  MessageDirectoryRepository,
  ReportableMessage,
} from '../domain/message-directory.repository';
import { ReportsRepository } from '../domain/reports.repository';
import { StudentDirectoryRepository } from '../domain/student-directory.repository';
import { ReportInput, ReportsService } from './reports.service';

const me: AuthenticatedUser = { id: 'me', type: AccountType.STUDENT };

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: 'r1',
    reporterId: 'me',
    targetStudentId: 'other',
    messageId: null,
    callId: null,
    reason: ReportReason.SPAM,
    note: null,
    contentSnapshot: null,
    status: ReportStatus.OPEN,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

function makeReports(overrides: Partial<ReportsRepository> = {}): ReportsRepository {
  return {
    findOpenReport: jest.fn().mockResolvedValue(null),
    create: jest.fn(async () => report()),
    ...overrides,
  };
}

function makeDirectory(exists = true): StudentDirectoryRepository {
  return {
    exists: jest.fn().mockResolvedValue(exists),
    findSummary: jest.fn(),
    findSummaries: jest.fn(),
    list: jest.fn(),
  };
}

function makeMessages(
  found: ReportableMessage | null = { id: 'm1', body: 'yomon gap' },
): MessageDirectoryRepository {
  return { findReportable: jest.fn().mockResolvedValue(found) };
}

function makeService(
  reports: ReportsRepository = makeReports(),
  directory: StudentDirectoryRepository = makeDirectory(),
  messages: MessageDirectoryRepository = makeMessages(),
): ReportsService {
  return new ReportsService(reports, directory, messages, calls as never);
}

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    targetStudentId: 'other',
    messageId: null,
    callId: null,
    reason: ReportReason.SPAM,
    note: null,
    ...overrides,
  };
}

const calls = { wasParticipant: jest.fn().mockResolvedValue(true) };

describe('ReportsService', () => {
  it('throws 422 REPORT_TARGET_INVALID when neither target is set', async () => {
    await expect(
      makeService().report(me, input({ targetStudentId: null, messageId: null })),
    ).rejects.toMatchObject({ code: ERROR_CODE.REPORT_TARGET_INVALID, status: 422 });
  });

  it('throws 422 REPORT_TARGET_INVALID when both targets are set', async () => {
    await expect(
      makeService().report(me, input({ targetStudentId: 'other', messageId: 'm1' })),
    ).rejects.toMatchObject({ code: ERROR_CODE.REPORT_TARGET_INVALID, status: 422 });
  });

  it('throws 422 when reporting yourself', async () => {
    await expect(makeService().report(me, input({ targetStudentId: 'me' }))).rejects.toMatchObject({
      code: ERROR_CODE.REPORT_TARGET_INVALID,
      status: 422,
    });
  });

  it('throws 404 STUDENT_NOT_FOUND for an unknown target student', async () => {
    const service = makeService(makeReports(), makeDirectory(false));
    await expect(service.report(me, input())).rejects.toMatchObject({
      code: ERROR_CODE.STUDENT_NOT_FOUND,
      status: 404,
    });
  });

  it('coalesces a duplicate open report (does not create a second)', async () => {
    const existing = report({ id: 'existing' });
    const reports = makeReports({ findOpenReport: jest.fn().mockResolvedValue(existing) });
    const result = await makeService(reports).report(me, input());
    expect(result).toBe(existing);
    expect(reports.create).not.toHaveBeenCalled();
  });

  it('creates an OPEN report against a student', async () => {
    const reports = makeReports();
    await makeService(reports).report(me, input({ reason: ReportReason.SCAM, note: 'firibgar' }));
    expect(reports.create).toHaveBeenCalledWith({
      reporterId: 'me',
      targetStudentId: 'other',
      messageId: null,
      callId: null,
      reason: ReportReason.SCAM,
      note: 'firibgar',
      contentSnapshot: null,
    });
  });

  it('creates a report against a message (no student target)', async () => {
    const reports = makeReports();
    await makeService(reports).report(me, input({ targetStudentId: null, messageId: 'm1' }));
    expect(reports.create).toHaveBeenCalledWith(
      expect.objectContaining({ targetStudentId: null, messageId: 'm1' }),
    );
  });

  // §17.4 — an unknown id, or one from someone else's conversation, used to be accepted, filling
  // the moderation queue with rows nobody could open.
  describe('message reports (§17.4)', () => {
    it('throws 422 MESSAGE_NOT_FOUND when the reporter cannot see the message', async () => {
      const reports = makeReports();
      const service = makeService(reports, makeDirectory(), makeMessages(null));

      await expect(
        service.report(me, input({ targetStudentId: null, messageId: 'msg_x' })),
      ).rejects.toMatchObject({ code: ERROR_CODE.MESSAGE_NOT_FOUND, status: 422 });

      expect(reports.create).not.toHaveBeenCalled();
    });

    it('looks the message up as the reporter, not globally', async () => {
      const messages = makeMessages();
      await makeService(makeReports(), makeDirectory(), messages).report(
        me,
        input({ targetStudentId: null, messageId: 'm1' }),
      );
      expect(messages.findReportable).toHaveBeenCalledWith('m1', 'me');
    });

    it('snapshots the reported body so moderation can read it later', async () => {
      const reports = makeReports();
      await makeService(reports, makeDirectory(), makeMessages()).report(
        me,
        input({ targetStudentId: null, messageId: 'm1' }),
      );
      expect(reports.create).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'm1', contentSnapshot: 'yomon gap' }),
      );
    });

    it('does not look up a message when the target is a student', async () => {
      const messages = makeMessages();
      await makeService(makeReports(), makeDirectory(), messages).report(me, input());
      expect(messages.findReportable).not.toHaveBeenCalled();
    });
  });
});
