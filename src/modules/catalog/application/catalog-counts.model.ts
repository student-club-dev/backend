import { BusinessType } from '../domain/entities/business-type.entity';
import { CatalogGroup } from '../domain/entities/catalog-group.entity';

/** A group plus the counts the home screen renders. */
export interface CatalogGroupWithCounts extends CatalogGroup {
  typesCount: number;
  listingsCount: number;
}

/** A business type plus its category and visible-listing counts. */
export interface BusinessTypeWithCounts extends BusinessType {
  categoriesCount: number;
  listingsCount: number;
}
