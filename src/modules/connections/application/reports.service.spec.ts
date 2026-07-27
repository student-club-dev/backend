import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { Report } from '../domain/entities/report.entity';
import { ReportReason } from '../domain/enums/report-reason.enum';
import { ReportStatus } from '../domain/enums/report-status.enum';
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
    search: jest.fn(),
  };
}

function makeService(
  reports: ReportsRepository = makeReports(),
  directory: StudentDirectoryRepository = makeDirectory(),
): ReportsService {
  return new ReportsService(reports, directory);
}

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    targetStudentId: 'other',
    messageId: null,
    reason: ReportReason.SPAM,
    note: null,
    ...overrides,
  };
}

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
});
