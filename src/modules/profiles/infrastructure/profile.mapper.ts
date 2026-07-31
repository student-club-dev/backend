import { Prisma, type BusinessOwner, type Student } from '@prisma/client';
import { Profile, ProfilePatch } from '../domain/entities/profile.entity';
import { ProfileRole } from '../domain/enums/profile-role.enum';
import {
  COURSE_YEAR_TO_DOMAIN,
  COURSE_YEAR_TO_PRISMA,
  GENDER_TO_DOMAIN,
  GENDER_TO_PRISMA,
  LAST_SEEN_VISIBILITY_TO_DOMAIN,
  LAST_SEEN_VISIBILITY_TO_PRISMA,
  PHONE_VISIBILITY_TO_DOMAIN,
  PHONE_VISIBILITY_TO_PRISMA,
} from './profile-enums.mapper';

/** Maps a Student Prisma row to the profile domain type (role = STUDENT, all fields populated). */
export function toStudentProfile(row: Student): Profile {
  return {
    id: row.id,
    role: ProfileRole.STUDENT,
    firstName: row.firstName,
    lastName: row.lastName,
    username: row.username,
    phoneNumber: row.phoneNumber,
    avatarUrl: row.avatarUrl,
    bio: row.bio,
    gender: row.gender === null ? null : GENDER_TO_DOMAIN[row.gender],
    universityId: row.universityId,
    universityEmail: row.universityEmail,
    birthYear: row.birthYear,
    courseYear: row.courseYear === null ? null : COURSE_YEAR_TO_DOMAIN[row.courseYear],
    lastSeenVisibility: LAST_SEEN_VISIBILITY_TO_DOMAIN[row.lastSeenVisibility],
    phoneVisibility: PHONE_VISIBILITY_TO_DOMAIN[row.phoneVisibility],
  };
}

/**
 * Maps a BusinessOwner Prisma row to the profile domain type (role = BUSINESS). Business owners
 * carry `gender`; the university/course fields are `null` — the `business_owners` table has no
 * such columns.
 */
export function toBusinessProfile(row: BusinessOwner): Profile {
  return {
    id: row.id,
    role: ProfileRole.BUSINESS,
    firstName: row.firstName,
    lastName: row.lastName,
    username: null,
    phoneNumber: row.phoneNumber,
    avatarUrl: row.avatarUrl,
    // Student-only, like the university/course fields — `business_owners` has no such column.
    bio: null,
    gender: row.gender === null ? null : GENDER_TO_DOMAIN[row.gender],
    universityId: null,
    universityEmail: null,
    birthYear: null,
    courseYear: null,
    lastSeenVisibility: null,
    phoneVisibility: null,
  };
}

/** Builds the Prisma update payload for a Student from a domain patch (only present keys). */
export function toStudentUpdateData(patch: ProfilePatch): Prisma.StudentUpdateInput {
  const data: Prisma.StudentUpdateInput = { ...toSharedUpdateData(patch) };
  if (patch.username !== undefined) {
    data.username = patch.username;
  }
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
  if (patch.lastSeenVisibility !== undefined) {
    data.lastSeenVisibility = LAST_SEEN_VISIBILITY_TO_PRISMA[patch.lastSeenVisibility];
  }
  if (patch.phoneVisibility !== undefined) {
    data.phoneVisibility = PHONE_VISIBILITY_TO_PRISMA[patch.phoneVisibility];
  }
  // `null` is a real value here — it is how a bio gets cleared, so this cannot use `?? undefined`.
  if (patch.bio !== undefined) {
    data.bio = patch.bio;
  }
  return data;
}

/** Builds the Prisma update payload for a BusinessOwner (shared identity fields + gender). */
export function toBusinessUpdateData(patch: ProfilePatch): Prisma.BusinessOwnerUpdateInput {
  const data: Prisma.BusinessOwnerUpdateInput = { ...toSharedUpdateData(patch) };
  if (patch.gender !== undefined) {
    data.gender = GENDER_TO_PRISMA[patch.gender];
  }
  return data;
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
