import type { TaskDetails } from '../../entities/student-listing.entity';
import { TaskCategory, TaskFormat } from '../../enums/detail.enums';
import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import { ListingField } from '../listing-field';
import { MSG } from '../messages';
import { taskRules } from './task.rules';

const NOW = new Date('2026-08-03T00:00:00Z');
const FUTURE = new Date('2026-08-14T18:00:00Z');
const PAST = new Date('2026-08-01T18:00:00Z');
const BRIEF = 'Analiz, aniqmas integrallar. Qo‘lda yozilgan bo‘lsa ham bo‘ladi.';

function details(overrides: Partial<TaskDetails> = {}): TaskDetails {
  return {
    kind: StudentListingKind.TASK,
    category: TaskCategory.EXACT,
    typeKey: 'MATH',
    customTypeName: null,
    deadline: FUTURE,
    format: TaskFormat.ONLINE,
    volume: null,
    ...overrides,
  };
}

describe('taskRules (§5.3)', () => {
  it('passes a well-formed TASK', () => {
    expect(taskRules(details(), BRIEF, NOW)).toEqual({});
  });

  describe('subject', () => {
    it('requires a category', () => {
      expect(taskRules(details({ category: null }), BRIEF, NOW)[ListingField.TASK_SUBJECT]).toBe(
        MSG.TASK_CATEGORY_REQUIRED,
      );
    });

    it.each([null, '', '   '])('requires a type key (%p)', (typeKey) => {
      expect(taskRules(details({ typeKey }), BRIEF, NOW)[ListingField.TASK_SUBJECT]).toBe(
        MSG.TASK_TYPE_REQUIRED,
      );
    });

    it('requires customTypeName when the type is OTHER', () => {
      expect(taskRules(details({ typeKey: 'OTHER' }), BRIEF, NOW)[ListingField.TASK_SUBJECT]).toBe(
        MSG.TASK_CUSTOM_TYPE_REQUIRED,
      );
      expect(taskRules(details({ typeKey: 'OTHER', customTypeName: 'Insho' }), BRIEF, NOW)).toEqual(
        {},
      );
    });

    it('rejects a type key from another category', () => {
      // MATH is real, but not under WRITTEN — an unscoped check would let this through.
      expect(
        taskRules(details({ category: TaskCategory.WRITTEN, typeKey: 'MATH' }), BRIEF, NOW)[
          ListingField.TASK_SUBJECT
        ],
      ).toBe(MSG.CATALOG_KEY_UNKNOWN);
    });

    it('rejects an invented type key', () => {
      expect(
        taskRules(details({ typeKey: 'ROCKET_SCIENCE' }), BRIEF, NOW)[ListingField.TASK_SUBJECT],
      ).toBe(MSG.CATALOG_KEY_UNKNOWN);
    });
  });

  describe('brief', () => {
    it.each([null, '', '   '])('requires a description (%p)', (description) => {
      expect(taskRules(details(), description, NOW)[ListingField.TASK_BRIEF]).toBe(
        MSG.TASK_BRIEF_REQUIRED,
      );
    });
  });

  describe('deadline', () => {
    it('requires one', () => {
      expect(taskRules(details({ deadline: null }), BRIEF, NOW)[ListingField.TASK_DEADLINE]).toBe(
        MSG.TASK_DEADLINE_REQUIRED,
      );
    });

    it('requires it to be in the future', () => {
      expect(taskRules(details({ deadline: PAST }), BRIEF, NOW)[ListingField.TASK_DEADLINE]).toBe(
        MSG.TASK_DEADLINE_PAST,
      );
    });

    it('rejects a deadline exactly at now', () => {
      expect(taskRules(details({ deadline: NOW }), BRIEF, NOW)[ListingField.TASK_DEADLINE]).toBe(
        MSG.TASK_DEADLINE_PAST,
      );
    });
  });

  it('reports every broken rule at once', () => {
    const errors = taskRules(details({ category: null, deadline: null }), null, NOW);
    expect(errors[ListingField.TASK_SUBJECT]).toBe(MSG.TASK_CATEGORY_REQUIRED);
    expect(errors[ListingField.TASK_BRIEF]).toBe(MSG.TASK_BRIEF_REQUIRED);
    expect(errors[ListingField.TASK_DEADLINE]).toBe(MSG.TASK_DEADLINE_REQUIRED);
  });
});
