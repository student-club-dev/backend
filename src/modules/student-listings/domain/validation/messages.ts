/**
 * User-facing Uzbek validation copy, from STUDENT_LISTINGS_BACKEND.md §5.1–§5.6.
 *
 * The client renders these verbatim under the matching form field — it does not translate or
 * rewrite them — so rewording one here is a user-visible product change, not a refactor. They are
 * gathered in a single file precisely so that a reviewer can diff the wording against the spec
 * without reading six rule modules.
 */
export const MSG = {
  // §5.1 — common
  TITLE_REQUIRED: 'Sarlavhani kiriting',
  TITLE_TOO_SHORT: 'Sarlavha juda qisqa',
  TITLE_TOO_LONG: 'Sarlavha 120 belgidan oshmasin',
  IMAGES_REQUIRED: 'Kamida 1 ta rasm qo‘shing',
  IMAGES_TOO_MANY: 'Maksimal 5 ta rasm',
  PRICE_REQUIRED: 'Narxni kiriting yoki "kelishilgan" ni belgilang',
  PRICE_MAX_TOO_LOW: 'Yuqori chegara quyi chegaradan katta bo‘lsin',
  CONTACT_REQUIRED: 'Telefon raqamini kiriting',
  VALIDITY_ORDER: 'Tugash sanasi boshlanishdan keyin bo‘lsin',
  VALIDITY_TOO_LONG: 'E’lon muddati 90 kundan oshmasin',
  /** §6 — a TASK advertised past its own deadline is useless to whoever would take it on. */
  VALIDITY_AFTER_DEADLINE: 'E’lon muddati topshirish muddatidan oshmasin',
  OPTION_GROUPS_TOO_MANY: 'Qo‘shimchalar 10 guruhdan oshmasin',
  OPTION_GROUP_NAME_REQUIRED: 'Qo‘shimcha guruhining nomini kiriting',

  // §5.2 — location. The message names the thing being placed, so it reads naturally per kind.
  LOCATION_REQUIRED_RENTAL: 'Uy joyini xaritadan belgilang',
  LOCATION_REQUIRED_SERVICE: 'Xizmat ko‘rsatiladigan joyni xaritadan belgilang',
  LOCATION_REQUIRED_JOB: 'Ish joyini xaritadan belgilang',
  LOCATION_REQUIRED_TASK: 'Ish topshiriladigan joyni xaritadan belgilang',
  LOCATION_OUT_OF_BOUNDS: 'Nuqta O‘zbekiston hududidan tashqarida',
  LOCATION_DUPLICATE: 'Ikkita manzil bir joyda belgilangan',
  LOCATION_TOO_MANY: 'Bitta e’londa 20 tadan ko‘p manzil bo‘lmasin',

  // §5.3 — TASK
  TASK_CATEGORY_REQUIRED: 'Ish yo‘nalishini tanlang',
  TASK_TYPE_REQUIRED: 'Ish turini tanlang',
  TASK_CUSTOM_TYPE_REQUIRED: 'Ish turini yozing',
  TASK_BRIEF_REQUIRED: 'Topshiriq shartini yozing',
  TASK_DEADLINE_REQUIRED: 'Topshirish muddatini belgilang',
  TASK_DEADLINE_PAST: 'Muddat hozirgi vaqtdan keyin bo‘lsin',

  // §5.4 — RENTAL
  PROPERTY_TYPE_REQUIRED: 'Turarjoy turini tanlang',
  ROOMS_REQUIRED: 'Nechi xonaligini kiriting',
  ROOMS_OUT_OF_RANGE: 'Xonalar soni 1 dan 20 gacha bo‘lsin',
  CURRENT_TENANTS_REQUIRED: 'Hozir nechi kishi yashashini kiriting',
  NEEDED_TENANTS_REQUIRED: 'Nechi kishi kerakligini kiriting',
  GENDER_REQUIRED: 'Kim uchun ekanini tanlang — qiz yoki o‘g‘il',
  FLOOR_ABOVE_TOTAL: 'Qavat binoning qavatlar sonidan katta',

  // §5.5 — SERVICE
  SERVICE_TYPE_REQUIRED: 'Xizmat sohasini tanlang',
  SERVICE_NAME_REQUIRED: 'Xizmat nomini yozing',
  EXPERIENCE_YEARS_INVALID: 'Tajriba yillari noto‘g‘ri',

  // §5.6 — JOB
  JOB_CATEGORY_REQUIRED: 'Ish turini tanlang',
  COMPANY_NAME_REQUIRED: 'Tashkilot yoki ish beruvchi nomini kiriting',
  JOB_SHIFT_REQUIRED: 'Ish smenasini tanlang',
  JOB_SHIFT_PERMANENT_ONLY: 'Bu smena faqat doimiy ish uchun',
  JOB_TIME_RANGE_REQUIRED: 'Ish vaqti oralig‘ini kiriting',
  JOB_WORK_DATE_REQUIRED: 'Ish qaysi kuni ekanini belgilang',
  JOB_DAYS_REQUIRED: 'Ish kunlarini tanlang',
  JOB_HOURS_OUT_OF_RANGE: 'Kunlik soat 1 dan 24 gacha bo‘lsin',
  JOB_VACANCIES_REQUIRED: 'Nechta odam kerakligini kiriting',
  JOB_PAY_PERIOD_MISMATCH: 'To‘lov davri ish turiga to‘g‘ri kelmaydi',
  JOB_PRICE_UNIT_MISMATCH: 'Narx birligi to‘lov davriga to‘g‘ri kelmaydi',
  AGE_RANGE_INVALID: 'Yosh oralig‘i noto‘g‘ri',

  // catalog
  CATALOG_KEY_UNKNOWN: 'Noma’lum katalog kaliti',
} as const;

/** §5.4 — "{rooms} xonaga {total} kishi ko‘p — sonlarni tekshiring". */
export function tenantsExceedRooms(rooms: number, total: number): string {
  return `${rooms} xonaga ${total} kishi ko‘p — sonlarni tekshiring`;
}

/** §5.1 — an option group must offer between 1 and 30 choices. */
export function optionGroupEmpty(groupName: string): string {
  return `"${groupName}" guruhida kamida 1 ta variant bo‘lsin`;
}

export function optionGroupTooManyOptions(groupName: string): string {
  return `"${groupName}" guruhida 30 tadan ko‘p variant bo‘lmasin`;
}
