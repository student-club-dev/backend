import type { StudentListing } from '../entities/student-listing.entity';
import { StudentListingKind } from '../enums/student-listing-kind.enum';
import { ListingField, type FieldErrors } from './listing-field';
import { MSG } from './messages';
import { commonRules } from './rules/common.rules';
import { jobRules } from './rules/job.rules';
import { locationRules } from './rules/location.rules';
import { rentalRules } from './rules/rental.rules';
import { serviceRules } from './rules/service.rules';
import { taskRules } from './rules/task.rules';

/**
 * Every §5 publish rule in one pure pass. `{}` means the listing may go live.
 *
 * The client runs equivalent rules in ListingValidator.kt, but a client cannot be trusted with
 * them — this is the authoritative check, and §5 says so explicitly. `now` is a parameter rather
 * than read here so deadline rules are deterministic under test.
 *
 * DRAFTs never reach this function: a half-filled form must always be saveable (§6.1).
 */
export function validateForPublish(listing: StudentListing, now: Date): FieldErrors {
  const groups: FieldErrors[] = [commonRules(listing), locationRules(listing)];

  switch (listing.details.kind) {
    case StudentListingKind.TASK:
      groups.push(taskRules(listing.details, listing.description, now));
      break;
    case StudentListingKind.RENTAL:
      groups.push(rentalRules(listing.details));
      break;
    case StudentListingKind.SERVICE:
      groups.push(serviceRules(listing.details));
      break;
    case StudentListingKind.JOB:
      groups.push(jobRules(listing.details, listing.priceUnit));
      break;
  }

  groups.push(taskDeadlineCapsValidity(listing));

  return mergeFirstWins(groups);
}

/**
 * §6 — a TASK must not stay advertised past its own deadline: whoever picks it up could no longer
 * deliver. It lives here rather than in taskRules because it spans the listing's validity window
 * and the details' deadline, which no single rule group owns.
 */
function taskDeadlineCapsValidity(listing: StudentListing): FieldErrors {
  if (listing.details.kind !== StudentListingKind.TASK) {
    return {};
  }
  const { deadline } = listing.details;
  const { validTo } = listing;
  if (deadline === null || validTo === null || validTo.getTime() <= deadline.getTime()) {
    return {};
  }
  return { [ListingField.VALIDITY]: MSG.VALIDITY_AFTER_DEADLINE };
}

/**
 * Merges rule groups without overwriting. Where two groups flag the same field — validity being
 * the real case — the earlier, more general message wins: being told "the end date is before the
 * start" is more actionable than a refinement of a window that is already nonsense.
 */
function mergeFirstWins(groups: FieldErrors[]): FieldErrors {
  const merged: FieldErrors = {};
  for (const group of groups) {
    for (const [field, message] of Object.entries(group) as [ListingField, string][]) {
      if (merged[field] === undefined) {
        merged[field] = message;
      }
    }
  }
  return merged;
}
