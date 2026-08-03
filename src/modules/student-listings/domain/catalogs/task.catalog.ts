import { TaskCategory } from '../enums/detail.enums';

/** Every category also offers "Boshqa", which pairs with `details.customTypeName` (§4.1). */
export const TASK_OTHER_TYPE_KEY = 'OTHER';

/**
 * Category → the `details.typeKey` values it accepts (§4.1).
 *
 * Keys are permanent: a listing saved as REFERAT keeps that key forever, and the client filters on
 * the same strings. Labels are NOT here — they live on the client today and move to the §7.3
 * catalog endpoint later; a label may be reworded freely, a key may not.
 */
export const TASK_TYPE_KEYS: Readonly<Record<TaskCategory, readonly string[]>> = {
  [TaskCategory.WRITTEN]: ['REFERAT', 'MUSTAQIL', 'KURS', 'DIPLOM', 'MAGISTR', 'TAQRIZ'],
  [TaskCategory.PRESENTATION]: ['SLIDES', 'POSTER'],
  [TaskCategory.EXACT]: ['MATH', 'PHYSICS', 'CHEMISTRY', 'STATS'],
  [TaskCategory.IT]: ['WEB', 'CODE', 'SQL', 'CODE_REPORT'],
  [TaskCategory.DRAWING]: ['CAD', 'MAP', 'DIAGRAM'],
  [TaskCategory.HANDWRITING]: ['HW_TEXT', 'HW_DIARY'],
  [TaskCategory.TRANSLATION]: ['ARTICLE', 'ANNOTATION'],
  [TaskCategory.CALC]: ['GPA', 'DOCX', 'BIBLIO'],
};

/**
 * Whether `key` is valid *for this category*. Scoping matters: MATH is a real key, but not under
 * WRITTEN — an unscoped check would let the client file an essay as a maths problem.
 */
export function isKnownTaskTypeKey(category: TaskCategory, key: string): boolean {
  return key === TASK_OTHER_TYPE_KEY || TASK_TYPE_KEYS[category].includes(key);
}
