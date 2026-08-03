import { TASK_OTHER_TYPE_KEY, isKnownTaskTypeKey } from '../../catalogs/task.catalog';
import type { TaskDetails } from '../../entities/student-listing.entity';
import { ListingField, type FieldErrors } from '../listing-field';
import { MSG } from '../messages';

/**
 * §5.3 — a TASK is a request for work, so the three things a bidder needs are what gets enforced:
 * what the work is, what it involves, and when it is due.
 *
 * `description` is the brief and lives on the listing rather than in `details`, hence the separate
 * parameter. `now` is injected so the deadline check is deterministic under test rather than
 * depending on when the suite happens to run.
 */
export function taskRules(
  details: TaskDetails,
  description: string | null,
  now: Date,
): FieldErrors {
  const errors: FieldErrors = {};

  const subjectError = subjectErrorOf(details);
  if (subjectError !== null) {
    errors[ListingField.TASK_SUBJECT] = subjectError;
  }

  if (description === null || description.trim().length === 0) {
    errors[ListingField.TASK_BRIEF] = MSG.TASK_BRIEF_REQUIRED;
  }

  const deadlineError = deadlineErrorOf(details, now);
  if (deadlineError !== null) {
    errors[ListingField.TASK_DEADLINE] = deadlineError;
  }

  return errors;
}

function subjectErrorOf(details: TaskDetails): string | null {
  const { category, typeKey, customTypeName } = details;

  if (category === null) {
    return MSG.TASK_CATEGORY_REQUIRED;
  }
  if (typeKey === null || typeKey.trim().length === 0) {
    return MSG.TASK_TYPE_REQUIRED;
  }
  if (!isKnownTaskTypeKey(category, typeKey)) {
    return MSG.CATALOG_KEY_UNKNOWN;
  }
  // "Boshqa" is only meaningful once the student says what it actually is.
  if (
    typeKey === TASK_OTHER_TYPE_KEY &&
    (customTypeName === null || customTypeName.trim().length === 0)
  ) {
    return MSG.TASK_CUSTOM_TYPE_REQUIRED;
  }
  return null;
}

function deadlineErrorOf(details: TaskDetails, now: Date): string | null {
  if (details.deadline === null) {
    return MSG.TASK_DEADLINE_REQUIRED;
  }
  if (details.deadline.getTime() <= now.getTime()) {
    return MSG.TASK_DEADLINE_PAST;
  }
  return null;
}
