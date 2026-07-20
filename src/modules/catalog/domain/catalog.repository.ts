import { BusinessType } from './entities/business-type.entity';
import { Category } from './entities/category.entity';
import { Gender } from './enums/gender.enum';
import { PriceUnit } from './enums/price-unit.enum';

/** Injection token for the catalog repository port (bound to the Prisma impl in the module). */
export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

/** Writable fields of a business type (`type` — the PK — is passed separately on create). */
export interface BusinessTypeWrite {
  nameUz: string;
  nameRu: string | null;
  emoji: string | null;
  accentColor: string | null;
  iconUrl: string | null;
  defaultPriceUnit: PriceUnit;
  priceUnits: PriceUnit[];
  availableForGenders: Gender[];
}

/**
 * Catalog data-access port. The application layer depends on this interface only;
 * the Prisma implementation lives in the infrastructure layer.
 */
export interface CatalogRepository {
  /** All business types, unfiltered — the service applies gender personalisation. */
  findBusinessTypes(): Promise<BusinessType[]>;

  /**
   * All categories for a business type (base list + per-gender lists), each with its fields.
   * Returns `null` when the business type does not exist.
   */
  findCategoriesByType(type: string): Promise<Category[] | null>;

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
