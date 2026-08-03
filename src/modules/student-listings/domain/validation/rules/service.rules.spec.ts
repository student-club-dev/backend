import type { ServiceDetails } from '../../entities/student-listing.entity';
import { ServiceFormat, ServiceType } from '../../enums/detail.enums';
import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import { ListingField } from '../listing-field';
import { MSG } from '../messages';
import { serviceRules } from './service.rules';

function details(overrides: Partial<ServiceDetails> = {}): ServiceDetails {
  return {
    kind: StudentListingKind.SERVICE,
    serviceType: ServiceType.TUTOR,
    fields: { subject: 'IELTS' },
    format: ServiceFormat.OFFLINE,
    experienceYears: 3,
    workingHours: '09:00 — 21:00',
    hasHomeVisit: false,
    hasFreeTrial: true,
    ...overrides,
  };
}

describe('serviceRules (§5.5)', () => {
  it('passes a well-formed SERVICE', () => {
    expect(serviceRules(details())).toEqual({});
  });

  it('requires a service type', () => {
    expect(serviceRules(details({ serviceType: null }))[ListingField.SERVICE_TYPE]).toBe(
      MSG.SERVICE_TYPE_REQUIRED,
    );
  });

  it('skips every other check when the service type is missing', () => {
    // §5.5: "tanlanmagan bo‘lsa qolgan tekshiruvlar o‘tkazilmaydi" — with no domain chosen there
    // is nothing to validate the rest against.
    const errors = serviceRules(details({ serviceType: null, experienceYears: 999 }));
    expect(errors).toEqual({ [ListingField.SERVICE_TYPE]: MSG.SERVICE_TYPE_REQUIRED });
  });

  describe('the OTHER domain', () => {
    const missingName: Record<string, string>[] = [{}, { serviceName: '   ' }];

    it.each(missingName)('requires serviceName (%p)', (fields) => {
      expect(
        serviceRules(details({ serviceType: ServiceType.OTHER, fields }))[
          ListingField.SERVICE_SUBJECT
        ],
      ).toBe(MSG.SERVICE_NAME_REQUIRED);
    });

    it('accepts a filled serviceName', () => {
      expect(
        serviceRules(
          details({ serviceType: ServiceType.OTHER, fields: { serviceName: 'Qandolatchilik' } }),
        ),
      ).toEqual({});
    });
  });

  describe('experience', () => {
    it.each([-1, 61])('rejects %i years', (experienceYears) => {
      expect(serviceRules(details({ experienceYears }))[ListingField.ATTRIBUTES]).toBe(
        MSG.EXPERIENCE_YEARS_INVALID,
      );
    });

    it.each([0, 60, null])('accepts %p years', (experienceYears) => {
      expect(serviceRules(details({ experienceYears }))[ListingField.ATTRIBUTES]).toBeUndefined();
    });
  });

  it('does not yet validate fields.subject against the catalog', () => {
    // Deferred until the mobile team sends ServiceCatalog.kt (spec §11). Asserted so the gap is
    // visible in the suite rather than silently absent.
    expect(serviceRules(details({ fields: { subject: 'NOT_A_REAL_SUBJECT' } }))).toEqual({});
  });
});
