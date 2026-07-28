import { ERROR_CODE } from '../../../common/errors/error-code';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import {
  AdminStudentListFilter,
  AdminStudentReadRepository,
} from '../domain/admin-student-read.repository';
import { AdminStudent } from '../domain/entities/admin-student.entity';
import { AdminUserSort } from '../domain/enums/admin-user-sort.enum';
import { AdminUserStatus } from '../domain/enums/admin-user-status.enum';
import { AdminStudentsService } from './admin-students.service';

function makeRepo(overrides: Partial<AdminStudentReadRepository> = {}): AdminStudentReadRepository {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    ...overrides,
  };
}

function makeFilter(overrides: Partial<AdminStudentListFilter> = {}): AdminStudentListFilter {
  return {
    q: null,
    universityId: null,
    courseYear: null,
    gender: null,
    status: null,
    phoneVerified: null,
    createdFrom: null,
    createdTo: null,
    sort: AdminUserSort.NEWEST,
    page: 1,
    size: 20,
    ...overrides,
  };
}

const STUDENT: AdminStudent = {
  id: 'stu-1',
  email: 'a@b.uz',
  phoneNumber: '+998901234567',
  phoneVerified: true,
  emailVerified: false,
  firstName: 'Ali',
  lastName: 'Valiyev',
  avatarUrl: null,
  username: 'ali',
  gender: null,
  universityId: 'emis-142',
  universityEmail: null,
  birthYear: 2004,
  courseYear: null,
  lastSeenAt: null,
  lastSeenVisibility: LastSeenVisibility.CONNECTIONS,
  status: AdminUserStatus.ACTIVE,
  bannedAt: null,
  banReason: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

describe('AdminStudentsService', () => {
  describe('list', () => {
    it('passes the filter through to the repository unchanged and returns its page', async () => {
      const page = { items: [], total: 0 };
      const repo = makeRepo({ list: jest.fn().mockResolvedValue(page) });
      const service = new AdminStudentsService(repo);
      const filter = makeFilter({ q: 'ali', phoneVerified: true, page: 2, size: 10 });

      const result = await service.list(filter);

      expect(repo.list).toHaveBeenCalledWith(filter);
      expect(result).toBe(page);
    });
  });

  describe('getById', () => {
    it('returns the student when found (no passwordHash in the record)', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(STUDENT) });
      const service = new AdminStudentsService(repo);

      const result = await service.getById('stu-1');

      expect(result).toBe(STUDENT);
      expect(Object.keys(result)).not.toContain('passwordHash');
    });

    it('throws 404 STUDENT_NOT_FOUND when the id is unknown', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const service = new AdminStudentsService(repo);

      await expect(service.getById('nope')).rejects.toMatchObject({
        code: ERROR_CODE.STUDENT_NOT_FOUND,
        status: 404,
      });
    });
  });
});
