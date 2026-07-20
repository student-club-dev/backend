import {
  CourseYear as PrismaCourseYear,
  Gender as PrismaGender,
  Prisma,
  type BusinessOwner,
  type Student,
} from '@prisma/client';
import { Profile, ProfilePatch } from '../domain/entities/profile.entity';
import { CourseYear } from '../domain/enums/course-year.enum';
import { Gender } from '../domain/enums/gender.enum';
import { ProfileRole } from '../domain/enums/profile-role.enum';

// The Prisma enums carry different values from the wire (Gender matches, CourseYear does not:
// YEAR_1 <-> "1"), so both directions are mapped explicitly.
const GENDER_TO_DOMAIN: Record<PrismaGender, Gender> = {
  MALE: Gender.MALE,
  FEMALE: Gender.FEMALE,
};

const GENDER_TO_PRISMA: Record<Gender, PrismaGender> = {
  [Gender.MALE]: PrismaGender.MALE,
  [Gender.FEMALE]: PrismaGender.FEMALE,
};

const COURSE_YEAR_TO_DOMAIN: Record<PrismaCourseYear, CourseYear> = {
  YEAR_1: CourseYear.YEAR_1,
  YEAR_2: CourseYear.YEAR_2,
  YEAR_3: CourseYear.YEAR_3,
  YEAR_4: CourseYear.YEAR_4,
  MASTER: CourseYear.MASTER,
};

const COURSE_YEAR_TO_PRISMA: Record<CourseYear, PrismaCourseYear> = {
  [CourseYear.YEAR_1]: PrismaCourseYear.YEAR_1,
  [CourseYear.YEAR_2]: PrismaCourseYear.YEAR_2,
  [CourseYear.YEAR_3]: PrismaCourseYear.YEAR_3,
  [CourseYear.YEAR_4]: PrismaCourseYear.YEAR_4,
  [CourseYear.MASTER]: PrismaCourseYear.MASTER,
};

/** Maps a Student Prisma row to the profile domain type (role = STUDENT, all fields populated). */
export function toStudentProfile(row: Student): Profile {
  return {
    id: row.id,
    role: ProfileRole.STUDENT,
    firstName: row.firstName,
    lastName: row.lastName,
    phoneNumber: row.phoneNumber,
    avatarUrl: row.avatarUrl,
    gender: row.gender === null ? null : GENDER_TO_DOMAIN[row.gender],
    universityId: row.universityId,
    universityEmail: row.universityEmail,
    birthYear: row.birthYear,
    courseYear: row.courseYear === null ? null : COURSE_YEAR_TO_DOMAIN[row.courseYear],
  };
}

/**
 * Maps a BusinessOwner Prisma row to the profile domain type (role = BUSINESS). Student-only
 * fields are `null` — the `business_owners` table does not have them.
 */
export function toBusinessProfile(row: BusinessOwner): Profile {
  return {
    id: row.id,
    role: ProfileRole.BUSINESS,
    firstName: row.firstName,
    lastName: row.lastName,
    phoneNumber: row.phoneNumber,
    avatarUrl: row.avatarUrl,
    gender: null,
    universityId: null,
    universityEmail: null,
    birthYear: null,
    courseYear: null,
  };
}

/** Builds the Prisma update payload for a Student from a domain patch (only present keys). */
export function toStudentUpdateData(patch: ProfilePatch): Prisma.StudentUpdateInput {
  const data: Prisma.StudentUpdateInput = { ...toSharedUpdateData(patch) };
  if (patch.gender !== undefined) {
    data.gender = GENDER_TO_PRISMA[patch.gender];
  }
  if (patch.universityId !== undefined) {
    data.universityId = patch.universityId;
  }
  if (patch.universityEmail !== undefined) {
    data.universityEmail = patch.universityEmail;
  }
  if (patch.birthYear !== undefined) {
    data.birthYear = patch.birthYear;
  }
  if (patch.courseYear !== undefined) {
    data.courseYear = COURSE_YEAR_TO_PRISMA[patch.courseYear];
  }
  return data;
}

/** Builds the Prisma update payload for a BusinessOwner (shared identity fields only). */
export function toBusinessUpdateData(patch: ProfilePatch): Prisma.BusinessOwnerUpdateInput {
  return toSharedUpdateData(patch);
}

/** Identity fields common to both tables. */
function toSharedUpdateData(patch: ProfilePatch): {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  avatarUrl?: string;
  phoneVerified?: boolean;
} {
  const data: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    avatarUrl?: string;
    phoneVerified?: boolean;
  } = {};
  if (patch.firstName !== undefined) {
    data.firstName = patch.firstName;
  }
  if (patch.lastName !== undefined) {
    data.lastName = patch.lastName;
  }
  if (patch.phoneNumber !== undefined) {
    data.phoneNumber = patch.phoneNumber;
  }
  if (patch.avatarUrl !== undefined) {
    data.avatarUrl = patch.avatarUrl;
  }
  if (patch.phoneVerified !== undefined) {
    data.phoneVerified = patch.phoneVerified;
  }
  return data;
}
