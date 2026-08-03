/**
 * The kind-specific enums used inside `details` (§2.3). Names and wire values are copied verbatim
 * from the client's model — the app is already generated against them, so a rename here breaks it.
 *
 * They live in one file rather than twelve because none of them means anything on its own: each is
 * a field of one `details` shape, and they are always read together with it.
 */

/** Who a room or vacancy is meant for. ANY matches every search (§7.2.1 soft-match). */
export enum TenantGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  ANY = 'ANY',
}

export enum PropertyType {
  APARTMENT = 'APARTMENT',
  ROOM = 'ROOM',
  HOUSE = 'HOUSE',
  DORMITORY = 'DORMITORY',
  BED_SPACE = 'BED_SPACE',
}

export enum RentPeriod {
  MONTHLY = 'MONTHLY',
  DAILY = 'DAILY',
}

export enum ServiceType {
  TUTOR = 'TUTOR',
  PRINTING = 'PRINTING',
  IT_DEV = 'IT_DEV',
  DESIGN = 'DESIGN',
  PHOTO_VIDEO = 'PHOTO_VIDEO',
  TRANSLATION = 'TRANSLATION',
  REPAIR = 'REPAIR',
  BEAUTY = 'BEAUTY',
  TRANSPORT = 'TRANSPORT',
  EVENT = 'EVENT',
  CLEANING = 'CLEANING',
  OTHER = 'OTHER',
}

/** HYBRID matches any requested format (§7.2.1 soft-match). */
export enum ServiceFormat {
  OFFLINE = 'OFFLINE',
  ONLINE = 'ONLINE',
  HYBRID = 'HYBRID',
}

export enum EmploymentType {
  DAILY = 'DAILY',
  PERMANENT = 'PERMANENT',
}

/** FLEXIBLE matches any requested shift (§7.2.1); SHIFT_2_2/SHIFT_1_2 are PERMANENT-only (§4.4). */
export enum WorkShift {
  MORNING = 'MORNING',
  DAY = 'DAY',
  EVENING = 'EVENING',
  NIGHT = 'NIGHT',
  SHIFT_2_2 = 'SHIFT_2_2',
  SHIFT_1_2 = 'SHIFT_1_2',
  FLEXIBLE = 'FLEXIBLE',
}

export enum PayPeriod {
  HOURLY = 'HOURLY',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  PER_TASK = 'PER_TASK',
}

export enum ExperienceLevel {
  NONE = 'NONE',
  LESS_THAN_YEAR = 'LESS_THAN_YEAR',
  ONE_TO_THREE = 'ONE_TO_THREE',
  MORE_THAN_THREE = 'MORE_THAN_THREE',
}

export enum WeekDay {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}

export enum TaskCategory {
  WRITTEN = 'WRITTEN',
  PRESENTATION = 'PRESENTATION',
  EXACT = 'EXACT',
  IT = 'IT',
  DRAWING = 'DRAWING',
  HANDWRITING = 'HANDWRITING',
  TRANSLATION = 'TRANSLATION',
  CALC = 'CALC',
}

/** ANY matches every requested format (§7.2.1 soft-match). */
export enum TaskFormat {
  ONLINE = 'ONLINE',
  IN_PERSON = 'IN_PERSON',
  ANY = 'ANY',
}
