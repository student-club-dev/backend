import type { ServiceDetails } from '../../entities/student-listing.entity';
import { ServiceType } from '../../enums/detail.enums';
import { ListingField, type FieldErrors } from '../listing-field';
import { MSG } from '../messages';

const EXPERIENCE_YEARS_MIN = 0;
const EXPERIENCE_YEARS_MAX = 60;

/**
 * §5.5 — partially enforced.
 *
 * The domain-specific half of this rule set (is `fields.subject` a real subject for this domain?
 * which of the domain's fields are `required`?) is driven by ServiceCatalog.kt — 12 domains, ~90
 * subjects, ~60 field specs — which the mobile team has not sent yet (spec §11). Until it arrives a
 * subject is stored as given rather than rejected, and only `serviceType` and `experienceYears`
 * are checked. The gap is asserted in the spec so it stays visible.
 */
export function serviceRules(details: ServiceDetails): FieldErrors {
  // §5.5 is explicit that nothing else is checked without a domain: every remaining rule is
  // defined relative to the chosen domain, so there is nothing to check against.
  if (details.serviceType === null) {
    return { [ListingField.SERVICE_TYPE]: MSG.SERVICE_TYPE_REQUIRED };
  }

  const errors: FieldErrors = {};

  // "Boshqa" carries no catalog entry, so the name is the only thing identifying the service.
  if (details.serviceType === ServiceType.OTHER) {
    const serviceName = details.fields.serviceName;
    if (serviceName === undefined || serviceName.trim().length === 0) {
      errors[ListingField.SERVICE_SUBJECT] = MSG.SERVICE_NAME_REQUIRED;
    }
  }

  const years = details.experienceYears;
  if (years !== null && (years < EXPERIENCE_YEARS_MIN || years > EXPERIENCE_YEARS_MAX)) {
    errors[ListingField.ATTRIBUTES] = MSG.EXPERIENCE_YEARS_INVALID;
  }

  return errors;
}
