import { TaskCategory } from '../enums/detail.enums';
import { JOB_CATEGORY_KEYS, isKnownJobCategoryKey } from './job.catalog';
import { RENTAL_AMENITY_KEYS, isKnownAmenity } from './rental.catalog';
import { TASK_TYPE_KEYS, isKnownTaskTypeKey } from './task.catalog';

/**
 * These lists are a contract with rows already in the database: a listing saved as `REFERAT` stays
 * `REFERAT` forever, and the client filters on the same strings. So the exact sets are asserted
 * rather than spot-checked — a "harmless" rename would orphan every listing that used the old key.
 */
describe('catalogs', () => {
  describe('TASK', () => {
    it('exposes the documented type keys per category', () => {
      expect(TASK_TYPE_KEYS[TaskCategory.WRITTEN]).toEqual([
        'REFERAT',
        'MUSTAQIL',
        'KURS',
        'DIPLOM',
        'MAGISTR',
        'TAQRIZ',
      ]);
      expect(TASK_TYPE_KEYS[TaskCategory.PRESENTATION]).toEqual(['SLIDES', 'POSTER']);
      expect(TASK_TYPE_KEYS[TaskCategory.EXACT]).toEqual(['MATH', 'PHYSICS', 'CHEMISTRY', 'STATS']);
      expect(TASK_TYPE_KEYS[TaskCategory.IT]).toEqual(['WEB', 'CODE', 'SQL', 'CODE_REPORT']);
      expect(TASK_TYPE_KEYS[TaskCategory.DRAWING]).toEqual(['CAD', 'MAP', 'DIAGRAM']);
      expect(TASK_TYPE_KEYS[TaskCategory.HANDWRITING]).toEqual(['HW_TEXT', 'HW_DIARY']);
      expect(TASK_TYPE_KEYS[TaskCategory.TRANSLATION]).toEqual(['ARTICLE', 'ANNOTATION']);
      expect(TASK_TYPE_KEYS[TaskCategory.CALC]).toEqual(['GPA', 'DOCX', 'BIBLIO']);
    });

    it('covers every TaskCategory', () => {
      for (const category of Object.values(TaskCategory)) {
        expect(TASK_TYPE_KEYS[category]).toBeDefined();
      }
    });

    it('accepts OTHER in every category', () => {
      for (const category of Object.values(TaskCategory)) {
        expect(isKnownTaskTypeKey(category, 'OTHER')).toBe(true);
      }
    });

    it('rejects a type key belonging to a different category', () => {
      expect(isKnownTaskTypeKey(TaskCategory.WRITTEN, 'MATH')).toBe(false);
      expect(isKnownTaskTypeKey(TaskCategory.EXACT, 'MATH')).toBe(true);
    });

    it('rejects an invented key', () => {
      expect(isKnownTaskTypeKey(TaskCategory.WRITTEN, 'ESSAY')).toBe(false);
    });
  });

  describe('JOB', () => {
    it('exposes the 21 documented category keys', () => {
      expect(JOB_CATEGORY_KEYS).toHaveLength(21);
    });

    it('accepts documented keys and rejects anything else', () => {
      expect(isKnownJobCategoryKey('COURIER')).toBe(true);
      expect(isKnownJobCategoryKey('TUTOR_JOB')).toBe(true);
      expect(isKnownJobCategoryKey('OTHER')).toBe(true);
      expect(isKnownJobCategoryKey('ASTRONAUT')).toBe(false);
      expect(isKnownJobCategoryKey('')).toBe(false);
    });
  });

  describe('RENTAL', () => {
    it('exposes the 14 documented amenity keys', () => {
      expect(RENTAL_AMENITY_KEYS).toHaveLength(14);
    });

    it('accepts documented keys and rejects anything else', () => {
      expect(isKnownAmenity('WIFI')).toBe(true);
      expect(isKnownAmenity('NEAR_METRO')).toBe(true);
      expect(isKnownAmenity('NEAR_UNIVERSITY')).toBe(true);
      expect(isKnownAmenity('JACUZZI')).toBe(false);
    });
  });
});
