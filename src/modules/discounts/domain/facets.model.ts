import type { GeoScope } from '../../../common/geo/geo-scope';

export type { GeoScope };

/**
 * The slice of listings a facet run is computed over: the expanded business types, optionally
 * narrowed by category and location. Everything else (Q4 visibility) is implicit and enforced in
 * `visible-scope.sql.ts`.
 */
export interface FacetScope {
  types: string[];
  categoryKeys: string[];
  geo: GeoScope | null;
}

/** A facet bucket: one selectable value and how many visible listings carry it. */
export interface FacetCount {
  key: string;
  count: number;
}

/** One `(attribute key, raw stored value)` pair with its count, straight out of the jsonb. */
export interface RawAttributeCount {
  key: string;
  value: string;
  count: number;
}

/** Everything one facet run produces. Shaped into the wire DTO by the application layer. */
export interface ListingFacets {
  total: number;
  categories: FacetCount[];
  attributes: RawAttributeCount[];
  priceUnits: FacetCount[];
  priceRange: { min: number; max: number } | null;
  discountTypes: FacetCount[];
  discountPercentRange: { min: number; max: number } | null;
  redemptionMethods: FacetCount[];
  listingKind: { discount: number; regular: number };
  regions: FacetCount[];
  districts: FacetCount[];
  tradeCenters: FacetCount[];
}
