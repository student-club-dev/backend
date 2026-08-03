import type { GeoScope } from '../../../common/geo/geo-scope';
import { AttributeSpec } from './entities/attribute-spec.entity';
import { BusinessType } from './entities/business-type.entity';
import { CatalogGroup } from './entities/catalog-group.entity';
import { Category } from './entities/category.entity';
import { TypeAttributeSchema } from './entities/type-attribute-schema.entity';
import { Gender } from './enums/gender.enum';
import { PriceUnit } from './enums/price-unit.enum';

/** Injection token for the catalog repository port (bound to the Prisma impl in the module). */
export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

/** Writable fields of a business type (`type` — the PK — is passed separately on create). */
export interface BusinessTypeWrite {
  groupKey: string;
  nameUz: string;
  nameRu: string | null;
  emoji: string | null;
  accentColor: string | null;
  iconUrl: string | null;
  defaultPriceUnit: PriceUnit;
  priceUnits: PriceUnit[];
  availableForGenders: Gender[];
}

// Lives in common/geo so the discounts module can share the exact same type rather than declaring
// a structurally identical twin. Re-exported here so existing imports keep working.
export type { GeoScope };

/**
 * Catalog data-access port. The application layer depends on this interface only;
 * the Prisma implementation lives in the infrastructure layer.
 */
export interface CatalogRepository {
  /** All business types, unfiltered — the service applies gender personalisation. */
  findBusinessTypes(): Promise<BusinessType[]>;

  /** All catalog groups with their member type keys, ordered by `sortOrder`. */
  findGroups(): Promise<CatalogGroup[]>;

  /** Business types belonging to any of `groupKeys`. Empty input → empty result. */
  findBusinessTypesByGroups(groupKeys: string[]): Promise<BusinessType[]>;

  /** Whether a catalog group with this key exists (admin write guard). */
  groupExists(key: string): Promise<boolean>;

  /**
   * Visible-listing count per business type (STUDENT_FEED.md Q4: listing ACTIVE, business
   * APPROVED, validFrom <= now <= validTo). Scoped to `geo` when given. Types with no visible
   * listing are absent from the map — callers default to 0.
   */
  countVisibleListingsByType(geo: GeoScope | null): Promise<Map<string, number>>;

  /** Number of base (non gender-specific) categories per business type. */
  countCategoriesByType(): Promise<Map<string, number>>;

  /**
   * All categories for a business type (base list + per-gender lists), each with its fields.
   * Returns `null` when the business type does not exist.
   */
  findCategoriesByType(type: string): Promise<Category[] | null>;

  /**
   * The attribute specs applicable to a listing of `businessType` in `categoryKey` — the type-level
   * specs (`categoryKey IS NULL`) merged with the category-level ones, ordered by `sortOrder`
   * (LISTINGS.md §6).
   */
  findAttributeSpecs(businessType: string, categoryKey: string): Promise<AttributeSpec[]>;

  /**
   * Every attribute field of a business type, split into the type-level set and per-category
   * groups. Returns `null` when the type does not exist — which distinguishes an unknown type (404)
   * from a real type that simply has no attributes yet (empty lists).
   */
  findTypeAttributeSchema(businessType: string): Promise<TypeAttributeSchema | null>;

  /** Whether a business type with this `type` key exists. */
  typeExists(type: string): Promise<boolean>;

  /** Admin: create a business type. Caller ensures the key is free. */
  createType(type: string, data: BusinessTypeWrite): Promise<BusinessType>;

  /** Admin: update a business type (only the present keys). Caller ensures it exists. */
  updateType(type: string, data: Partial<BusinessTypeWrite>): Promise<BusinessType>;

  /** Admin: delete a business type. Caller ensures nothing references it. */
  deleteType(type: string): Promise<void>;

  /** Number of businesses referencing this type (delete guard). */
  countBusinessesOfType(type: string): Promise<number>;

  /** Number of categories referencing this type (delete guard). */
  countCategoriesOfType(type: string): Promise<number>;
}
