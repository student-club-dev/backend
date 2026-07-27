import { Prisma } from '@prisma/client';
import type { FacetScope } from '../domain/facets.model';
import { scopedFrom } from './visible-scope.sql';

export interface KeyCountRow {
  key: string;
  count: number;
}

export interface AttributeCountRow {
  key: string;
  value: string;
  count: number;
}

export interface RangeRow {
  min: number | null;
  max: number | null;
}

export interface KindRow {
  discount: number;
  regular: number;
}

/** Visible listings per category key. */
export function categoryFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`SELECT l.category_key AS key, COUNT(*)::int AS count ${scopedFrom(scope)} GROUP BY l.category_key`;
}

/**
 * Every `(attribute key, stored value)` pair with its count, in one pass. `jsonb_each_text`
 * expands the map so no per-key SQL is needed (Q6) — the application layer decides what each key
 * means from the catalog's AttributeKind. TAGS values arrive comma-joined and are split there.
 *
 * `scopedFrom` already ends in a WHERE clause, so the LATERAL join cannot follow it directly:
 * the scope goes into a subquery and the expansion happens outside.
 */
export function attributeFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`
    SELECT attr.key AS key, attr.value AS value, COUNT(*)::int AS count
    FROM (SELECT l.attributes ${scopedFrom(scope)}) AS visible
    CROSS JOIN LATERAL jsonb_each_text(visible.attributes) AS attr(key, value)
    WHERE visible.attributes IS NOT NULL
    GROUP BY attr.key, attr.value
  `;
}

/** Visible listings per price unit. */
export function priceUnitFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`SELECT l.price_unit::text AS key, COUNT(*)::int AS count ${scopedFrom(scope)} GROUP BY l.price_unit`;
}

/** Final-price bounds — the basis the feed sorts and filters on by default. */
export function priceRangeFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`SELECT MIN(l.final_price)::int AS min, MAX(l.final_price)::int AS max ${scopedFrom(scope)}`;
}

/** Discount types, excluding regular listings (their stored type is a placeholder). */
export function discountTypeFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`SELECT l.discount_type::text AS key, COUNT(*)::int AS count ${scopedFrom(scope)} AND l.is_discount = true GROUP BY l.discount_type`;
}

/** Normalised discount-percent bounds across the discount listings. */
export function discountPercentRangeFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`SELECT MIN(l.discount_percent)::int AS min, MAX(l.discount_percent)::int AS max ${scopedFrom(scope)} AND l.is_discount = true`;
}

/** Visible listings per redemption method. */
export function redemptionFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`SELECT l.redemption_method::text AS key, COUNT(*)::int AS count ${scopedFrom(scope)} GROUP BY l.redemption_method`;
}

/** DISCOUNT vs REGULAR split (PROMPT_REGULAR_LISTINGS §4). The two always sum to `total`. */
export function listingKindFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE l.is_discount)::int AS discount,
      COUNT(*) FILTER (WHERE NOT l.is_discount)::int AS regular
    ${scopedFrom(scope)}
  `;
}

/** Total visible listings — must equal the sum of any single facet dimension. */
export function totalFacet(scope: FacetScope): Prisma.Sql {
  return Prisma.sql`SELECT COUNT(*)::int AS count ${scopedFrom(scope)}`;
}

/**
 * Region / district / trade-centre counts. Same shape as {@link attributeFacet}: the scope goes
 * into a subquery so the branch tables can be joined outside it. `COUNT(DISTINCT)` because one
 * listing can have several branches sharing a district.
 *
 * `Prisma.raw` is safe here — `column` is one of three literals in the signature, never user input.
 */
export function locationFacet(
  scope: FacetScope,
  column: 'region_id' | 'district_id' | 'trade_center_id',
): Prisma.Sql {
  return Prisma.sql`
    SELECT br.${Prisma.raw(column)}::text AS key, COUNT(DISTINCT visible.id)::int AS count
    FROM (SELECT l.id ${scopedFrom(scope)}) AS visible
    JOIN listing_branches lb ON lb.listing_id = visible.id
    JOIN branches br ON br.id = lb.branch_id AND br.is_active = true
    WHERE br.${Prisma.raw(column)} IS NOT NULL
    GROUP BY br.${Prisma.raw(column)}
  `;
}
