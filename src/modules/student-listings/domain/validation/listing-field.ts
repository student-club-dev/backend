/**
 * Keys returned in `error.fields` on a 422 (§5). Identical to the client's `ListingField` enum:
 * the app looks each message up by key to show it under the matching form input, so a renamed key
 * does not surface an error — it silently hides one.
 */
export enum ListingField {
  TITLE = 'TITLE',
  IMAGES = 'IMAGES',
  PRICE = 'PRICE',
  LOCATION = 'LOCATION',
  VALIDITY = 'VALIDITY',
  CONTACT = 'CONTACT',
  ATTRIBUTES = 'ATTRIBUTES',
  OPTIONS = 'OPTIONS',
  CATEGORY = 'CATEGORY',
  PROPERTY_TYPE = 'PROPERTY_TYPE',
  ROOMS = 'ROOMS',
  TENANTS = 'TENANTS',
  GENDER = 'GENDER',
  SERVICE_TYPE = 'SERVICE_TYPE',
  SERVICE_SUBJECT = 'SERVICE_SUBJECT',
  TASK_SUBJECT = 'TASK_SUBJECT',
  TASK_BRIEF = 'TASK_BRIEF',
  TASK_DEADLINE = 'TASK_DEADLINE',
  JOB_CATEGORY = 'JOB_CATEGORY',
  JOB_SHIFT = 'JOB_SHIFT',
  JOB_SCHEDULE = 'JOB_SCHEDULE',
  JOB_PAY = 'JOB_PAY',
  BUSINESS_NAME = 'BUSINESS_NAME',
}

/** Field → Uzbek message. Empty means the listing may be published. */
export type FieldErrors = Partial<Record<ListingField, string>>;
