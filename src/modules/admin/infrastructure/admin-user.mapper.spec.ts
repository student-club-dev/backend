import {
  BusinessOwnerStatus as PrismaBusinessOwnerStatus,
  BusinessStatus as PrismaBusinessStatus,
  CourseYear as PrismaCourseYear,
  Gender as PrismaGender,
  LastSeenVisibility as PrismaLastSeenVisibility,
  StudentStatus as PrismaStudentStatus,
} from '@prisma/client';
import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
import { CourseYear } from '../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../profiles/domain/enums/gender.enum';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import { AdminUserStatus } from '../domain/enums/admin-user-status.enum';
import { AdminUserMapper } from './admin-user.mapper';

describe('AdminUserMapper', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  describe('toStudent', () => {
    it('maps Prisma enums to domain values and never carries passwordHash', () => {
      const student = AdminUserMapper.toStudent({
        id: 'stu-1',
        email: 'a@b.uz',
        phoneNumber: '+998901234567',
        phoneVerified: true,
        emailVerified: false,
        firstName: 'Ali',
        lastName: 'Valiyev',
        avatarUrl: null,
        username: 'ali',
        gender: PrismaGender.MALE,
        universityId: 'emis-142',
        universityEmail: null,
        birthYear: 2004,
        courseYear: PrismaCourseYear.YEAR_1,
        lastSeenAt: null,
        lastSeenVisibility: PrismaLastSeenVisibility.CONNECTIONS,
        status: PrismaStudentStatus.BANNED,
        bannedAt: now,
        banReason: 'spam',
        createdAt: now,
        updatedAt: now,
      });

      expect(student.gender).toBe(Gender.MALE);
      expect(student.courseYear).toBe(CourseYear.YEAR_1);
      expect(student.lastSeenVisibility).toBe(LastSeenVisibility.CONNECTIONS);
      expect(student.status).toBe(AdminUserStatus.BANNED);
      expect(student.bannedAt).toBe(now);
      expect(student.banReason).toBe('spam');
      expect(Object.keys(student)).not.toContain('passwordHash');
    });
  });

  describe('toStudentSummary', () => {
    it('projects only the summary columns (no passwordHash)', () => {
      const summary = AdminUserMapper.toStudentSummary({
        id: 'stu-1',
        firstName: 'Ali',
        lastName: 'Valiyev',
        username: 'ali',
        avatarUrl: null,
        phoneNumber: '+998901234567',
        email: 'a@b.uz',
        universityId: 'emis-142',
        courseYear: null,
        status: PrismaStudentStatus.ACTIVE,
        bannedAt: null,
        banReason: null,
        createdAt: now,
      });

      expect(summary.courseYear).toBeNull();
      expect(summary.status).toBe(AdminUserStatus.ACTIVE);
      expect(Object.keys(summary)).not.toContain('passwordHash');
    });
  });

  describe('toOwner', () => {
    it('maps businessesCount from _count and never carries passwordHash', () => {
      const owner = AdminUserMapper.toOwner({
        id: 'own-1',
        email: 'owner@b.uz',
        phoneNumber: '+998901112233',
        phoneVerified: true,
        emailVerified: false,
        firstName: 'Bek',
        lastName: 'Karimov',
        avatarUrl: null,
        gender: PrismaGender.FEMALE,
        status: PrismaBusinessOwnerStatus.BANNED,
        bannedAt: now,
        banReason: 'fraud',
        createdAt: now,
        updatedAt: now,
        _count: { businesses: 3 },
      });

      expect(owner.gender).toBe(Gender.FEMALE);
      expect(owner.businessesCount).toBe(3);
      expect(owner.status).toBe(AdminUserStatus.BANNED);
      expect(owner.banReason).toBe('fraud');
      expect(Object.keys(owner)).not.toContain('passwordHash');
    });
  });

  describe('toOwnerSummary', () => {
    it('maps businessesCount from _count', () => {
      const summary = AdminUserMapper.toOwnerSummary({
        id: 'own-1',
        firstName: 'Bek',
        lastName: 'Karimov',
        phoneNumber: '+998901112233',
        email: 'owner@b.uz',
        status: PrismaBusinessOwnerStatus.ACTIVE,
        bannedAt: null,
        banReason: null,
        createdAt: now,
        _count: { businesses: 2 },
      });

      expect(summary.businessesCount).toBe(2);
      expect(summary.status).toBe(AdminUserStatus.ACTIVE);
      expect(Object.keys(summary)).not.toContain('passwordHash');
    });
  });

  describe('toOwnerBusiness', () => {
    it('maps status and listingsCount from _count', () => {
      const business = AdminUserMapper.toOwnerBusiness({
        id: 'biz-1',
        name: 'Cafe',
        type: 'CAFE',
        status: PrismaBusinessStatus.APPROVED,
        createdAt: now,
        _count: { listings: 5 },
      });

      expect(business.status).toBe(BusinessStatus.APPROVED);
      expect(business.listingsCount).toBe(5);
    });
  });
});
