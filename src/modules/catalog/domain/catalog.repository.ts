import { BusinessType } from './entities/business-type.entity';
import { Category } from './entities/category.entity';

/** Injection token for the catalog repository port (bound to the Prisma impl in the module). */
export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

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
}
