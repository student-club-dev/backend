import { hash } from '@node-rs/argon2';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { ProfileService } from '../../profiles/application/profile.service';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import { AdminStudentWriteRepository } from '../domain/admin-student-write.repository';
import { AdminStudent } from '../domain/entities/admin-student.entity';
import { AdminStudentsService } from './admin-students.service';
import { AdminStudentsWriteService } from './admin-students-write.service';
import { AdminCreateStudentInput } from './admin-user-write.io';

jest.mock('@node-rs/argon2', () => ({ hash: jest.fn() }));
const hashMock = hash as unknown as jest.Mock;

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
  universityId: null,
  universityEmail: null,
  birthYear: null,
  courseYear: null,
  lastSeenAt: null,
  lastSeenVisibility: LastSeenVisibility.CONNECTIONS,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

function makeReads(overrides: Partial<AdminStudentsService> = {}): AdminStudentsService {
  return { getById: jest.fn().mockResolvedValue(STUDENT), ...overrides } as AdminStudentsService;
}

function makeWriteRepo(
  overrides: Partial<AdminStudentWriteRepository> = {},
): AdminStudentWriteRepository {
  return {
    existsByEmail: jest.fn().mockResolvedValue(false),
    existsByPhone: jest.fn().mockResolvedValue(false),
    existsByUsername: jest.fn().mockResolvedValue(false),
    create: jest.fn().mockResolvedValue('stu-1'),
    ...overrides,
  };
}

function makeProfileService(overrides: Partial<ProfileService> = {}): ProfileService {
  return { updateById: jest.fn().mockResolvedValue(undefined), ...overrides } as ProfileService;
}

function baseCreateInput(
  overrides: Partial<AdminCreateStudentInput> = {},
): AdminCreateStudentInput {
  return {
    email: 'new@b.uz',
    phoneNumber: null,
    password: 'secret123',
    firstName: 'Ali',
    lastName: null,
    username: null,
    gender: null,
    universityId: null,
    universityEmail: null,
    birthYear: null,
    courseYear: null,
    avatarUrl: null,
    ...overrides,
  };
}

beforeEach(() => {
  hashMock.mockReset().mockResolvedValue('argon2-hash');
});

describe('AdminStudentsWriteService', () => {
  describe('update', () => {
    it('reuses ProfileService.updateById and returns the re-fetched record (no passwordHash)', async () => {
      const reads = makeReads();
      const profileService = makeProfileService();
      const service = new AdminStudentsWriteService(reads, makeWriteRepo(), profileService);

      const result = await service.update('stu-1', { firstName: 'Jasur' });

      expect(reads.getById).toHaveBeenCalledWith('stu-1');
      expect(profileService.updateById).toHaveBeenCalledWith(AccountType.STUDENT, 'stu-1', {
        firstName: 'Jasur',
      });
      expect(result).toBe(STUDENT);
      expect(Object.keys(result)).not.toContain('passwordHash');
    });

    it('throws 404 STUDENT_NOT_FOUND when the id is unknown (before touching the profile)', async () => {
      const reads = makeReads({
        getById: jest.fn().mockRejectedValue({ code: ERROR_CODE.STUDENT_NOT_FOUND, status: 404 }),
      });
      const profileService = makeProfileService();
      const service = new AdminStudentsWriteService(reads, makeWriteRepo(), profileService);

      await expect(service.update('nope', { firstName: 'X' })).rejects.toMatchObject({
        code: ERROR_CODE.STUDENT_NOT_FOUND,
        status: 404,
      });
      expect(profileService.updateById).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('hashes the password, creates the student, and returns it without passwordHash', async () => {
      const reads = makeReads();
      const repo = makeWriteRepo();
      const service = new AdminStudentsWriteService(reads, repo, makeProfileService());

      const result = await service.create(baseCreateInput({ email: 'new@b.uz' }));

      expect(hashMock).toHaveBeenCalledWith('secret123');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@b.uz', passwordHash: 'argon2-hash' }),
      );
      expect(reads.getById).toHaveBeenCalledWith('stu-1');
      expect(result).toBe(STUDENT);
      expect(Object.keys(result)).not.toContain('passwordHash');
    });

    it('throws 409 ACCOUNT_EXISTS when the email is taken (no hash, no create)', async () => {
      const repo = makeWriteRepo({ existsByEmail: jest.fn().mockResolvedValue(true) });
      const service = new AdminStudentsWriteService(makeReads(), repo, makeProfileService());

      await expect(service.create(baseCreateInput({ email: 'taken@b.uz' }))).rejects.toMatchObject({
        code: ERROR_CODE.ACCOUNT_EXISTS,
        status: 409,
      });
      expect(hashMock).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws 409 ACCOUNT_EXISTS when the phone is taken', async () => {
      const repo = makeWriteRepo({ existsByPhone: jest.fn().mockResolvedValue(true) });
      const service = new AdminStudentsWriteService(makeReads(), repo, makeProfileService());

      await expect(
        service.create(baseCreateInput({ email: null, phoneNumber: '+998901234567' })),
      ).rejects.toMatchObject({ code: ERROR_CODE.ACCOUNT_EXISTS, status: 409 });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws 409 USERNAME_TAKEN when the username is taken', async () => {
      const repo = makeWriteRepo({ existsByUsername: jest.fn().mockResolvedValue(true) });
      const service = new AdminStudentsWriteService(makeReads(), repo, makeProfileService());

      await expect(service.create(baseCreateInput({ username: 'ali' }))).rejects.toMatchObject({
        code: ERROR_CODE.USERNAME_TAKEN,
        status: 409,
      });
      expect(repo.create).not.toHaveBeenCalled();
    });
  });
});
