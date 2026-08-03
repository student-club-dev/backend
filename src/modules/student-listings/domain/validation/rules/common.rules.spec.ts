import { StudentListingKind } from '../../enums/student-listing-kind.enum';
import { validRental } from '../listing.fixture';
import { ListingField } from '../listing-field';
import { MSG, optionGroupEmpty, optionGroupTooManyOptions } from '../messages';
import { commonRules } from './common.rules';

describe('commonRules (§5.1)', () => {
  it('passes a well-formed listing', () => {
    expect(commonRules(validRental())).toEqual({});
  });

  describe('title', () => {
    it.each([
      ['', MSG.TITLE_REQUIRED],
      ['   ', MSG.TITLE_REQUIRED],
      ['ab', MSG.TITLE_TOO_SHORT],
      ['x'.repeat(121), MSG.TITLE_TOO_LONG],
    ])('rejects %p', (title, message) => {
      expect(commonRules(validRental({ title }))[ListingField.TITLE]).toBe(message);
    });

    it('accepts the exact boundaries', () => {
      expect(commonRules(validRental({ title: 'abc' }))[ListingField.TITLE]).toBeUndefined();
      expect(
        commonRules(validRental({ title: 'x'.repeat(120) }))[ListingField.TITLE],
      ).toBeUndefined();
    });
  });

  describe('images', () => {
    it.each([StudentListingKind.RENTAL, StudentListingKind.SERVICE])(
      'requires at least one for %s',
      (kind) => {
        expect(commonRules(validRental({ kind, images: [] }))[ListingField.IMAGES]).toBe(
          MSG.IMAGES_REQUIRED,
        );
      },
    );

    it.each([StudentListingKind.JOB, StudentListingKind.TASK])(
      'does not require one for %s',
      (kind) => {
        // A vacancy has no photo and a homework brief is text — demanding one would block a
        // legitimate listing (§5.1).
        expect(commonRules(validRental({ kind, images: [] }))[ListingField.IMAGES]).toBeUndefined();
      },
    );

    it('rejects more than 5', () => {
      const images = Array.from({ length: 6 }, (_, i) => `https://cdn.example/${i}.jpg`);
      expect(commonRules(validRental({ images }))[ListingField.IMAGES]).toBe(MSG.IMAGES_TOO_MANY);
    });
  });

  describe('price', () => {
    it('requires a price unless negotiable', () => {
      expect(commonRules(validRental({ price: 0 }))[ListingField.PRICE]).toBe(MSG.PRICE_REQUIRED);
      expect(
        commonRules(validRental({ price: 0, isNegotiable: true }))[ListingField.PRICE],
      ).toBeUndefined();
    });

    it('requires priceMax strictly above price when given', () => {
      expect(commonRules(validRental({ price: 100, priceMax: 100 }))[ListingField.PRICE]).toBe(
        MSG.PRICE_MAX_TOO_LOW,
      );
      expect(commonRules(validRental({ price: 100, priceMax: 99 }))[ListingField.PRICE]).toBe(
        MSG.PRICE_MAX_TOO_LOW,
      );
      expect(
        commonRules(validRental({ price: 100, priceMax: 200 }))[ListingField.PRICE],
      ).toBeUndefined();
    });
  });

  describe('contact', () => {
    it.each([null, '', '   '])('rejects %p', (contactPhone) => {
      expect(commonRules(validRental({ contactPhone }))[ListingField.CONTACT]).toBe(
        MSG.CONTACT_REQUIRED,
      );
    });
  });

  describe('validity window', () => {
    it('requires validTo after validFrom', () => {
      const listing = validRental({
        validFrom: new Date('2026-09-01T00:00:00Z'),
        validTo: new Date('2026-08-01T00:00:00Z'),
      });
      expect(commonRules(listing)[ListingField.VALIDITY]).toBe(MSG.VALIDITY_ORDER);
    });

    it.each([
      ['validFrom', { validFrom: null }],
      ['validTo', { validTo: null }],
    ])('rejects a missing %s', (_label, patch) => {
      expect(commonRules(validRental(patch))[ListingField.VALIDITY]).toBe(MSG.VALIDITY_ORDER);
    });

    it('caps the window at 90 days', () => {
      const listing = validRental({
        validFrom: new Date('2026-08-01T00:00:00Z'),
        validTo: new Date('2026-12-01T00:00:00Z'),
      });
      expect(commonRules(listing)[ListingField.VALIDITY]).toBe(MSG.VALIDITY_TOO_LONG);
    });

    it('accepts exactly 90 days', () => {
      const listing = validRental({
        validFrom: new Date('2026-08-01T00:00:00Z'),
        validTo: new Date('2026-10-30T00:00:00Z'),
      });
      expect(commonRules(listing)[ListingField.VALIDITY]).toBeUndefined();
    });
  });

  describe('option groups', () => {
    const group = (name: string, optionCount: number) => ({
      name,
      selectionType: 'SINGLE' as const,
      isRequired: false,
      options: Array.from({ length: optionCount }, (_, i) => ({
        name: `option-${i}`,
        priceDelta: 0,
        isAvailable: true,
      })),
    });

    it('rejects more than 10 groups', () => {
      const optionGroups = Array.from({ length: 11 }, (_, i) => group(`g${i}`, 1));
      expect(commonRules(validRental({ optionGroups }))[ListingField.OPTIONS]).toBe(
        MSG.OPTION_GROUPS_TOO_MANY,
      );
    });

    it('rejects a blank group name', () => {
      expect(
        commonRules(validRental({ optionGroups: [group('  ', 1)] }))[ListingField.OPTIONS],
      ).toBe(MSG.OPTION_GROUP_NAME_REQUIRED);
    });

    it('rejects a group with no options', () => {
      expect(
        commonRules(validRental({ optionGroups: [group('Davomiylik', 0)] }))[ListingField.OPTIONS],
      ).toBe(optionGroupEmpty('Davomiylik'));
    });

    it('rejects a group with more than 30 options', () => {
      expect(
        commonRules(validRental({ optionGroups: [group('Davomiylik', 31)] }))[ListingField.OPTIONS],
      ).toBe(optionGroupTooManyOptions('Davomiylik'));
    });

    it('accepts 10 groups of 30 options', () => {
      const optionGroups = Array.from({ length: 10 }, (_, i) => group(`g${i}`, 30));
      expect(commonRules(validRental({ optionGroups }))[ListingField.OPTIONS]).toBeUndefined();
    });
  });
});
