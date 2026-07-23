import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { Profile } from '../domain/entities/profile.entity';
import { ProfileRepository } from '../domain/profile.repository';
import { CourseYear } from '../domain/enums/course-year.enum';
import { Gender } from '../domain/enums/gender.enum';
import { ProfileRole } from '../domain/enums/profile-role.enum';
import { ProfileService } from './profile.service';

function studentProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'stu-1',
    role: ProfileRole.STUDENT,
    firstName: 'Ali',
    lastName: 'Valiyev',
    phoneNumber: '+998900000000',
    avatarUrl: null,
    gender: Gender.MALE,
    universityId: 'TATU',
    universityEmail: 'ali@tatu.uz',
    birthYear: 2004,
    courseYear: CourseYear.YEAR_2,
    ...overrides,
  };
}

function businessProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'biz-1',
    role: ProfileRole.BUSINESS,
    firstName: 'Bek',
    lastName: 'Karimov',
    phoneNumber: '+998911111111',
    avatarUrl: null,
    gender: null,
    universityId: null,
    universityEmail: null,
    birthYear: null,
    courseYear: null,
    ...overrides,
  };
}

function makeRepository(overrides: Partial<ProfileRepository> = {}): ProfileRepository {
  return {
    findById: jest.fn().mockResolvedValue(null),
    findByPhone: jest.fn().mockResolvedValue(null),
    update: jest.fn(async (_id: string, patch) => ({ ...studentProfile(), ...patch })),
    ...overrides,
  };
}

const studentUser: AuthenticatedUser = { id: 'stu-1', type: AccountType.STUDENT };
const businessUser: AuthenticatedUser = { id: 'biz-1', type: AccountType.BUSINESS };

describe('ProfileService', () => {
  describe('getMyProfile', () => {
    it('returns the student profile from the students repository', async () => {
      const students = makeRepository({
        findById: jest.fn().mockResolvedValue(studentProfile()),
      });
      const business = makeRepository();
      const service = new ProfileService(students, business);

      const result = await service.getMyProfile(studentUser);

      expect(result.role).toBe(ProfileRole.STUDENT);
      expect(students.findById).toHaveBeenCalledWith('stu-1');
      expect(business.findById).not.toHaveBeenCalled();
    });

    it('dispatches to the business repository for a business account', async () => {
      const students = makeRepository();
      const business = makeRepository({
        findById: jest.fn().mockResolvedValue(businessProfile()),
      });
      const service = new ProfileService(students, business);

      const result = await service.getMyProfile(businessUser);

      expect(result.role).toBe(ProfileRole.BUSINESS);
      expect(business.findById).toHaveBeenCalledWith('biz-1');
      expect(students.findById).not.toHaveBeenCalled();
    });

    it('throws PROFILE_NOT_FOUND (404) when the profile is missing', async () => {
      const service = new ProfileService(makeRepository(), makeRepository());

      await expect(service.getMyProfile(studentUser)).rejects.toMatchObject({
        code: ERROR_CODE.PROFILE_NOT_FOUND,
        status: 404,
      });
    });
  });

  describe('updateMyProfile', () => {
    it('applies only the provided fields', async () => {
      const students = makeRepository({
        findById: jest.fn().mockResolvedValue(studentProfile()),
      });
      const service = new ProfileService(students, makeRepository());

      await service.updateMyProfile(studentUser, { firstName: 'Jasur' });

      expect(students.update).toHaveBeenCalledWith('stu-1', { firstName: 'Jasur' });
    });

    it('resets phoneVerified when the phone number changes', async () => {
      const students = makeRepository({
        findById: jest.fn().mockResolvedValue(studentProfile({ phoneNumber: '+998900000000' })),
      });
      const service = new ProfileService(students, makeRepository());

      await service.updateMyProfile(studentUser, { phoneNumber: '+998900000001' });

      expect(students.update).toHaveBeenCalledWith('stu-1', {
        phoneNumber: '+998900000001',
        phoneVerified: false,
      });
    });

    it('does not touch the phone when the number is unchanged', async () => {
      const students = makeRepository({
        findById: jest.fn().mockResolvedValue(studentProfile({ phoneNumber: '+998900000000' })),
      });
      const service = new ProfileService(students, makeRepository());

      await service.updateMyProfile(studentUser, {
        phoneNumber: '+998900000000',
        firstName: 'Jasur',
      });

      expect(students.update).toHaveBeenCalledWith('stu-1', { firstName: 'Jasur' });
      expect(students.findByPhone).not.toHaveBeenCalled();
    });

    it('applies gender but ignores university/course fields for a business owner', async () => {
      const business = makeRepository({
        findById: jest.fn().mockResolvedValue(businessProfile()),
      });
      const service = new ProfileService(makeRepository(), business);

      await service.updateMyProfile(businessUser, {
        firstName: 'Bek',
        gender: Gender.MALE,
        universityId: 'TATU',
        birthYear: 1990,
        courseYear: CourseYear.MASTER,
      });

      expect(business.update).toHaveBeenCalledWith('biz-1', {
        firstName: 'Bek',
        gender: Gender.MALE,
      });
    });

    it('applies student-only fields for a student', async () => {
      const students = makeRepository({
        findById: jest.fn().mockResolvedValue(studentProfile()),
      });
      const service = new ProfileService(students, makeRepository());

      await service.updateMyProfile(studentUser, {
        gender: Gender.FEMALE,
        courseYear: CourseYear.MASTER,
      });

      expect(students.update).toHaveBeenCalledWith('stu-1', {
        gender: Gender.FEMALE,
        courseYear: CourseYear.MASTER,
      });
    });

    it('throws ACCOUNT_EXISTS (409) when the new phone belongs to another account', async () => {
      const students = makeRepository({
        findById: jest.fn().mockResolvedValue(studentProfile({ phoneNumber: '+998900000000' })),
        findByPhone: jest
          .fn()
          .mockResolvedValue(studentProfile({ id: 'other', phoneNumber: '+998900000001' })),
      });
      const service = new ProfileService(students, makeRepository());

      await expect(
        service.updateMyProfile(studentUser, { phoneNumber: '+998900000001' }),
      ).rejects.toMatchObject({ code: ERROR_CODE.ACCOUNT_EXISTS, status: 409 });
      expect(students.update).not.toHaveBeenCalled();
    });

    it('allows the update when findByPhone returns the same account', async () => {
      const current = studentProfile({ id: 'stu-1', phoneNumber: '+998900000000' });
      const students = makeRepository({
        findById: jest.fn().mockResolvedValue(current),
        findByPhone: jest.fn().mockResolvedValue(current),
      });
      const service = new ProfileService(students, makeRepository());

      await expect(
        service.updateMyProfile(studentUser, { phoneNumber: '+998900000001' }),
      ).resolves.toBeDefined();
      expect(students.update).toHaveBeenCalledTimes(1);
    });

    it('throws PROFILE_NOT_FOUND (404) when the account is missing', async () => {
      const service = new ProfileService(makeRepository(), makeRepository());

      await expect(service.updateMyProfile(studentUser, { firstName: 'X' })).rejects.toBeInstanceOf(
        AppException,
      );
    });
  });
});
