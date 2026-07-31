import {
  CourseYear as PrismaCourseYear,
  Gender as PrismaGender,
  LastSeenVisibility as PrismaLastSeenVisibility,
  PhoneVisibility as PrismaPhoneVisibility,
} from '@prisma/client';
import { CourseYear } from '../domain/enums/course-year.enum';
import { Gender } from '../domain/enums/gender.enum';
import { LastSeenVisibility } from '../domain/enums/last-seen-visibility.enum';
import { PhoneVisibility } from '../domain/enums/phone-visibility.enum';

// The Prisma enums carry different values from the wire (Gender matches, CourseYear does not:
// YEAR_1 <-> "1"), so both directions are mapped explicitly. Profiles owns these domain enums;
// `connections` and `chat` map the same columns when building a StudentSummary, so the tables
// live here rather than being duplicated per module.

export const GENDER_TO_DOMAIN: Record<PrismaGender, Gender> = {
  MALE: Gender.MALE,
  FEMALE: Gender.FEMALE,
};

export const GENDER_TO_PRISMA: Record<Gender, PrismaGender> = {
  [Gender.MALE]: PrismaGender.MALE,
  [Gender.FEMALE]: PrismaGender.FEMALE,
};

export const COURSE_YEAR_TO_DOMAIN: Record<PrismaCourseYear, CourseYear> = {
  YEAR_1: CourseYear.YEAR_1,
  YEAR_2: CourseYear.YEAR_2,
  YEAR_3: CourseYear.YEAR_3,
  YEAR_4: CourseYear.YEAR_4,
  MASTER: CourseYear.MASTER,
};

export const COURSE_YEAR_TO_PRISMA: Record<CourseYear, PrismaCourseYear> = {
  [CourseYear.YEAR_1]: PrismaCourseYear.YEAR_1,
  [CourseYear.YEAR_2]: PrismaCourseYear.YEAR_2,
  [CourseYear.YEAR_3]: PrismaCourseYear.YEAR_3,
  [CourseYear.YEAR_4]: PrismaCourseYear.YEAR_4,
  [CourseYear.MASTER]: PrismaCourseYear.MASTER,
};

export const LAST_SEEN_VISIBILITY_TO_DOMAIN: Record<PrismaLastSeenVisibility, LastSeenVisibility> =
  {
    EVERYONE: LastSeenVisibility.EVERYONE,
    CONNECTIONS: LastSeenVisibility.CONNECTIONS,
    NOBODY: LastSeenVisibility.NOBODY,
  };

export const LAST_SEEN_VISIBILITY_TO_PRISMA: Record<LastSeenVisibility, PrismaLastSeenVisibility> =
  {
    [LastSeenVisibility.EVERYONE]: PrismaLastSeenVisibility.EVERYONE,
    [LastSeenVisibility.CONNECTIONS]: PrismaLastSeenVisibility.CONNECTIONS,
    [LastSeenVisibility.NOBODY]: PrismaLastSeenVisibility.NOBODY,
  };

export const PHONE_VISIBILITY_TO_DOMAIN: Record<PrismaPhoneVisibility, PhoneVisibility> = {
  EVERYONE: PhoneVisibility.EVERYONE,
  CONNECTIONS: PhoneVisibility.CONNECTIONS,
  NOBODY: PhoneVisibility.NOBODY,
};

export const PHONE_VISIBILITY_TO_PRISMA: Record<PhoneVisibility, PrismaPhoneVisibility> = {
  [PhoneVisibility.EVERYONE]: PrismaPhoneVisibility.EVERYONE,
  [PhoneVisibility.CONNECTIONS]: PrismaPhoneVisibility.CONNECTIONS,
  [PhoneVisibility.NOBODY]: PrismaPhoneVisibility.NOBODY,
};
