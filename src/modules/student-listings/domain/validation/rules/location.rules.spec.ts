import { TaskCategory, TaskFormat } from '../../enums/detail.enums';
import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import { pin, validRental } from '../listing.fixture';
import { ListingField } from '../listing-field';
import { MSG } from '../messages';
import { distanceMeters, locationRules } from './location.rules';

/** A TASK listing whose format decides whether a pin is demanded. */
function task(format: TaskFormat, branches = validRental().branches) {
  return validRental({
    kind: StudentListingKind.TASK,
    branches,
    details: {
      kind: StudentListingKind.TASK,
      category: TaskCategory.EXACT,
      typeKey: 'MATH',
      customTypeName: null,
      deadline: new Date('2026-08-14T18:00:00Z'),
      format,
      volume: null,
    },
  });
}

describe('locationRules (§5.2)', () => {
  it('passes a listing with one valid pin', () => {
    expect(locationRules(validRental())).toEqual({});
  });

  describe('when no pin is given', () => {
    it.each([
      [StudentListingKind.RENTAL, MSG.LOCATION_REQUIRED_RENTAL],
      [StudentListingKind.SERVICE, MSG.LOCATION_REQUIRED_SERVICE],
      [StudentListingKind.JOB, MSG.LOCATION_REQUIRED_JOB],
    ])('demands one for %s with its own message', (kind, message) => {
      expect(locationRules(validRental({ kind, branches: [] }))[ListingField.LOCATION]).toBe(
        message,
      );
    });

    it.each([TaskFormat.ONLINE, TaskFormat.ANY])('does not demand one for a %s TASK', (format) => {
      // An online homework brief has no place; demanding a pin would block it (§5.2).
      expect(locationRules(task(format, []))[ListingField.LOCATION]).toBeUndefined();
    });

    it('demands one for an IN_PERSON TASK', () => {
      expect(locationRules(task(TaskFormat.IN_PERSON, []))[ListingField.LOCATION]).toBe(
        MSG.LOCATION_REQUIRED_TASK,
      );
    });
  });

  describe('Uzbekistan bounds', () => {
    it('rejects a pin outside the country', () => {
      // Moscow.
      expect(
        locationRules(validRental({ branches: [pin(55.75, 37.62)] }))[ListingField.LOCATION],
      ).toBe(MSG.LOCATION_OUT_OF_BOUNDS);
    });

    it.each([
      ['south-west corner', 37.0, 55.0],
      ['north-east corner', 46.0, 74.0],
    ])('accepts the %s of the box', (_label, lat, lng) => {
      expect(locationRules(validRental({ branches: [pin(lat, lng)] }))).toEqual({});
    });

    it.each([
      ['latitude below', 36.99, 69.2034],
      ['latitude above', 46.01, 69.2034],
      ['longitude below', 41.2856, 54.99],
      ['longitude above', 41.2856, 74.01],
    ])('rejects %s the box', (_label, lat, lng) => {
      expect(locationRules(validRental({ branches: [pin(lat, lng)] }))[ListingField.LOCATION]).toBe(
        MSG.LOCATION_OUT_OF_BOUNDS,
      );
    });
  });

  describe('duplicate pins', () => {
    it('rejects two pins closer than 100 m', () => {
      const branches = [pin(), pin(41.2857, 69.2035, { id: 'br_2' })];
      expect(locationRules(validRental({ branches }))[ListingField.LOCATION]).toBe(
        MSG.LOCATION_DUPLICATE,
      );
    });

    it('accepts two pins further than 100 m apart', () => {
      const branches = [pin(), pin(41.2956, 69.2134, { id: 'br_2' })];
      expect(locationRules(validRental({ branches }))).toEqual({});
    });
  });

  it('rejects more than 20 pins', () => {
    const branches = Array.from({ length: 21 }, (_, i) =>
      pin(41.2 + i * 0.02, 69.2 + i * 0.02, { id: `br_${i}` }),
    );
    expect(locationRules(validRental({ branches }))[ListingField.LOCATION]).toBe(
      MSG.LOCATION_TOO_MANY,
    );
  });

  describe('distanceMeters', () => {
    it('returns zero for the same point', () => {
      expect(distanceMeters({ lat: 41.2856, lng: 69.2034 }, { lat: 41.2856, lng: 69.2034 })).toBe(
        0,
      );
    });

    it('agrees with a known distance', () => {
      // One degree of latitude is ~111.2 km anywhere on the globe.
      const metres = distanceMeters({ lat: 41.0, lng: 69.0 }, { lat: 42.0, lng: 69.0 });
      expect(metres).toBeGreaterThan(111_000);
      expect(metres).toBeLessThan(111_400);
    });
  });
});
