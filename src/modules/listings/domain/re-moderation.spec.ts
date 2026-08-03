import { PriceUnit } from '../../catalog/domain/enums/price-unit.enum';
import type { DiscountInput, UpdateListingInput } from '../application/listings.io';
import type { Listing } from './entities/listing.entity';
import { DiscountType } from './enums/discount-type.enum';
import { RedemptionMethod } from './enums/redemption-method.enum';
import { requiresReModeration } from './re-moderation';

/**
 * The stored listing and the edit that changes nothing about it. Every test mutates one field of
 * the incoming copy, so the two fixtures must start identical in every compared field.
 *
 * The cast is deliberate and confined to this file: `Listing` carries counters, ids and timestamps
 * that {@link requiresReModeration} never reads, and spelling them out would only obscure which
 * fields the function actually depends on.
 */
function stored(overrides: Partial<Listing> = {}): Listing {
  return {
    categoryKey: 'PIZZA',
    customCategoryName: null,
    title: 'Pepperoni pitsa',
    description: 'Mozzarella, pepperoni.',
    images: ['https://cdn/1.webp', 'https://cdn/2.webp'],
    priceUnit: PriceUnit.PER_ITEM,
    originalPrice: 55_000,
    discount: {
      type: DiscountType.PERCENT,
      value: 20,
      finalPrice: 44_000,
      conditions: 'Talaba ID bilan',
      appliesToOptions: false,
      isDiscount: true,
      percent: 20,
    },
    ...overrides,
  } as Listing;
}

function discountInput(overrides: Partial<DiscountInput> = {}): DiscountInput {
  return {
    type: DiscountType.PERCENT,
    value: 20,
    conditions: 'Talaba ID bilan',
    appliesToOptions: false,
    ...overrides,
  };
}

function incoming(overrides: Partial<UpdateListingInput> = {}): UpdateListingInput {
  return {
    branchIds: ['br-1'],
    categoryKey: 'PIZZA',
    customCategoryName: null,
    title: 'Pepperoni pitsa',
    description: 'Mozzarella, pepperoni.',
    images: ['https://cdn/1.webp', 'https://cdn/2.webp'],
    priceUnit: PriceUnit.PER_ITEM,
    originalPrice: 55_000,
    discount: discountInput(),
    redemption: {
      method: RedemptionMethod.QR,
      promoCode: null,
      url: null,
      perUserLimit: 1,
      perUserPeriod: null,
      totalLimit: 200,
    },
    validFrom: new Date('2026-08-01T00:00:00Z'),
    validTo: new Date('2026-09-01T00:00:00Z'),
    attributes: { portionGrams: '550' },
    optionGroups: [],
    ...overrides,
  };
}

describe('requiresReModeration', () => {
  it('is false for an identical edit', () => {
    expect(requiresReModeration(stored(), incoming())).toBe(false);
  });

  it.each([
    ['title', { title: 'Margarita pitsa' }],
    ['description', { description: 'Boshqa tavsif' }],
    ['originalPrice', { originalPrice: 60_000 }],
    ['categoryKey', { categoryKey: 'BURGER' }],
    ['customCategoryName', { customCategoryName: 'Uy pitsasi' }],
  ])('is true when %s changes', (_field, override) => {
    expect(requiresReModeration(stored(), incoming(override))).toBe(true);
  });

  it('is true when an image is replaced', () => {
    const edit = incoming({ images: ['https://cdn/9.webp', 'https://cdn/2.webp'] });
    expect(requiresReModeration(stored(), edit)).toBe(true);
  });

  it('is true when the image order changes — the first image is the cover', () => {
    const edit = incoming({ images: ['https://cdn/2.webp', 'https://cdn/1.webp'] });
    expect(requiresReModeration(stored(), edit)).toBe(true);
  });

  it('is true when an image is removed', () => {
    expect(requiresReModeration(stored(), incoming({ images: ['https://cdn/1.webp'] }))).toBe(true);
  });

  it.each([
    ['discount type', discountInput({ type: DiscountType.FIXED_AMOUNT })],
    ['discount value', discountInput({ value: 30 })],
    ['discount conditions', discountInput({ conditions: 'Boshqa shart' })],
    ['discount conditions being cleared', discountInput({ conditions: null })],
  ])('is true when %s changes', (_field, discount) => {
    expect(requiresReModeration(stored(), incoming({ discount }))).toBe(true);
  });

  it('is false when only the §6.3 exempt fields change, all at once', () => {
    const exemptEdit = incoming({
      branchIds: ['br-2', 'br-3'],
      validTo: new Date('2027-01-01T00:00:00Z'),
      redemption: {
        method: RedemptionMethod.QR,
        promoCode: null,
        url: null,
        perUserLimit: 1,
        perUserPeriod: null,
        totalLimit: 500,
      },
      attributes: { portionGrams: '550', stockCount: '3', seatsLeft: '2' },
      optionGroups: [],
    });

    expect(requiresReModeration(stored(), exemptEdit)).toBe(false);
  });

  it('ignores a finalPrice that disagrees with the discount — the server recomputes it anyway', () => {
    const listing = stored({
      discount: {
        type: DiscountType.PERCENT,
        value: 20,
        finalPrice: 1,
        conditions: 'Talaba ID bilan',
        appliesToOptions: false,
        isDiscount: true,
        percent: 20,
      },
    });

    expect(requiresReModeration(listing, incoming())).toBe(false);
  });
});
