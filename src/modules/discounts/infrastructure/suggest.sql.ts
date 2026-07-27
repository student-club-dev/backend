import { Prisma } from '@prisma/client';
import type { SuggestQuery } from '../domain/suggestion.model';
import { VISIBLE_LISTING } from './visible-scope.sql';

/**
 * How close a mistyped word must be to count as a hit. 0.3 catches "palv" → "palov" (0.375) while
 * leaving "osh" → "toshkent" (0.08) far outside — D7's whole point is that trigrams may fix typos
 * here, but must not degenerate into substring matching.
 */
const SIMILARITY_THRESHOLD = 0.3;

/**
 * The apostrophe variants `uz_normalize` folds away — dropped, not spaced, so `lag'mon` and
 * `lagʻmon` both reach the SQL side as `lagmon`. Anything missed here merely splits a word; it
 * cannot break the query.
 */
const APOSTROPHES = /['‘’‛`´′ʹʻʼ]/gu;

/** Anything that is neither a letter nor a digit separates words. */
const SEPARATORS = /[^\p{L}\p{N}]+/gu;

/**
 * Reduces the raw term to letters, digits and single spaces. Not an injection guard (Prisma
 * parameterises everything) — it keeps the term free of `LIKE` wildcards and `tsquery` operators,
 * which would otherwise change the query's meaning or make `to_tsquery` throw. Letters stay
 * untouched, including Cyrillic: `uz_normalize` transliterates them SQL-side.
 */
function sanitizeTerm(raw: string): string {
  return raw.replace(APOSTROPHES, '').replace(SEPARATORS, ' ').trim();
}

/**
 * "The normalised column matches the normalised term": a word-prefix hit, or a trigram-similar one
 * for typos. Both sides go through `uz_normalize`, so `самса` finds `somsa` and `lag'mon` finds
 * `lagmon`. Callers must have `q` in scope.
 *
 * `Prisma.raw` is safe here — `column` is a fixed identifier written at the call site below, never
 * user input.
 */
function matchesTerm(column: string): Prisma.Sql {
  const normalized = Prisma.raw(`uz_normalize(${column})`);
  return Prisma.sql`(
    ${normalized} LIKE q.text || '%'
    OR ${normalized} LIKE '% ' || q.text || '%'
    OR similarity(${normalized}, q.text) >= ${SIMILARITY_THRESHOLD}::real
  )`;
}

/**
 * The autocomplete query (STUDENT_FEED.md §9). Four match sources — category label or synonym,
 * business type name, business name, listing title — unioned into one row shape, each capped at
 * `limit`; the service ranks them across kinds.
 *
 * Two rules are enforced structurally rather than trusted to the caller:
 * - every count comes from the `visible` CTE, so a suggestion can never be offered with a count of
 *   0 or include a listing the student may not see (Q4);
 * - the term is matched inside the requested types only, so every suggestion is one the client can
 *   actually turn into a filter.
 *
 * `q` yields zero rows for a term that normalises to nothing (`"ъь"`, punctuation only); since every
 * branch cross-joins it, the whole query then returns nothing instead of building an invalid tsquery.
 */
export function suggestCandidates(query: SuggestQuery): Prisma.Sql {
  const types = Prisma.join(query.types);
  const limit = Prisma.sql`LIMIT ${query.limit}::int`;

  return Prisma.sql`
    WITH q AS (
      SELECT normalized.text
      FROM (SELECT uz_normalize(${sanitizeTerm(query.term)}) AS text) normalized
      WHERE normalized.text <> ''
    ),
    -- MATERIALIZED: the tsquery is a constant, but inlining it would rebuild it for every listing
    -- row the join considers.
    tsq AS MATERIALIZED (
      SELECT to_tsquery('simple', regexp_replace(q.text, ' +', ':* & ', 'g') || ':*') AS query
      FROM q
    ),
    visible AS (
      SELECT l.id, l.title, l.business_id, l.category_key, l.search_vector, b.type
      FROM listings l
      JOIN businesses b ON b.id = l.business_id
      WHERE ${VISIBLE_LISTING}
        AND b.type IN (${types})
    ),
    -- One label per (type, category). CLOTHING keeps gender-specific lists whose keys repeat, and
    -- six keys exist ONLY there — preferring the base row keeps the canonical label without
    -- dropping those six.
    category_label AS (
      SELECT DISTINCT ON (c.business_type, c.key) c.business_type, c.key, c.name_uz
      FROM categories c
      WHERE c.business_type IN (${types})
      ORDER BY c.business_type, c.key, (c.gender IS NULL) DESC, c.gender
    ),
    category_hits AS (
      SELECT
        'CATEGORY' AS kind,
        label.name_uz AS label,
        counted.type AS "typeKey",
        counted.category_key AS "categoryKey",
        NULL::text AS "businessId",
        NULL::text AS "listingId",
        counted.count AS count
      FROM (
        SELECT v.type, v.category_key, COUNT(*)::int AS count
        FROM visible v
        GROUP BY v.type, v.category_key
      ) counted
      JOIN category_label label
        ON label.business_type = counted.type AND label.key = counted.category_key
      CROSS JOIN q
      WHERE ${matchesTerm('label.name_uz')}
        OR EXISTS (
          SELECT 1 FROM catalog_synonyms s
          WHERE s.business_type = counted.type
            AND s.category_key = counted.category_key
            AND ${matchesTerm('s.term')}
        )
      ORDER BY counted.count DESC
      ${limit}
    ),
    type_hits AS (
      SELECT 'TYPE', t.name_uz, counted.type, NULL::text, NULL::text, NULL::text, counted.count
      FROM (SELECT v.type, COUNT(*)::int AS count FROM visible v GROUP BY v.type) counted
      JOIN business_types t ON t.type = counted.type
      CROSS JOIN q
      WHERE ${matchesTerm('t.name_uz')}
      ORDER BY counted.count DESC
      ${limit}
    ),
    business_hits AS (
      SELECT 'BUSINESS', b.name, NULL::text, NULL::text, b.id, NULL::text, counted.count
      FROM (
        SELECT v.business_id, COUNT(*)::int AS count FROM visible v GROUP BY v.business_id
      ) counted
      JOIN businesses b ON b.id = counted.business_id
      CROSS JOIN q
      WHERE ${matchesTerm('b.name')}
      ORDER BY counted.count DESC
      ${limit}
    ),
    -- Listing text stays on tsvector (D7 forbids trigrams here). The indexed search_vector is the
    -- cheap pre-filter; re-checking the title keeps the suggestion honest, since search_vector also
    -- carries the business and category names and would otherwise offer "Burger meni" for "osh".
    listing_hits AS (
      SELECT 'LISTING', v.title, NULL::text, NULL::text, NULL::text, v.id, 1
      FROM visible v
      CROSS JOIN tsq
      WHERE v.search_vector @@ tsq.query
        AND to_tsvector('simple', uz_normalize(v.title)) @@ tsq.query
      ORDER BY ts_rank(v.search_vector, tsq.query) DESC, v.id
      ${limit}
    )
    SELECT * FROM category_hits
    UNION ALL SELECT * FROM type_hits
    UNION ALL SELECT * FROM business_hits
    UNION ALL SELECT * FROM listing_hits
  `;
}
