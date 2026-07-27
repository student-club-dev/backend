import { AttributeSpec } from '../../catalog/domain/entities/attribute-spec.entity';
import { AttributeFieldType } from '../../catalog/domain/enums/attribute-field-type.enum';
import { RawAttributeCount } from '../domain/facets.model';

/** Operators the server permits per attribute kind (STUDENT_FEED.md §5). */
const OPERATORS: Record<AttributeFieldType, string[]> = {
  [AttributeFieldType.TEXT]: ['EQ', 'NEQ', 'CONTAINS', 'EXISTS'],
  [AttributeFieldType.NUMBER]: ['EQ', 'NEQ', 'BETWEEN', 'GTE', 'LTE', 'EXISTS'],
  [AttributeFieldType.BOOLEAN]: ['EQ', 'EXISTS'],
  [AttributeFieldType.SELECT]: ['EQ', 'NEQ', 'IN', 'NOT_IN', 'EXISTS'],
  [AttributeFieldType.MULTI_SELECT]: ['ANY', 'ALL', 'EXISTS'],
  [AttributeFieldType.TAGS]: ['ANY', 'ALL', 'EXISTS'],
};

/** Kinds whose stored value is a comma-joined list rather than a single value. */
const MULTI_VALUE = new Set([AttributeFieldType.MULTI_SELECT, AttributeFieldType.TAGS]);

/** Kinds the client filters by picking from a list. TEXT and NUMBER are not among them. */
const VALUE_LISTED = new Set([
  AttributeFieldType.SELECT,
  AttributeFieldType.BOOLEAN,
  AttributeFieldType.MULTI_SELECT,
  AttributeFieldType.TAGS,
]);

export interface ShapedAttributeFacet {
  key: string;
  label: string;
  kind: AttributeFieldType;
  suffix: string | null;
  appliesToTypes: string[];
  operators: string[];
  values?: { value: string; count: number }[];
  range?: { min: number; max: number };
}

/**
 * Turns the raw `(key, value, count)` rows into the per-attribute schema the filter screen is
 * built from (Q6). The catalog decides what each key means; anything it does not declare for the
 * selected types is dropped — which also removes the reserved keys (`_regular`, `_phone`,
 * `_gender`), since those never appear as attribute specs.
 *
 * Only values that actually occur come back: the client must not be able to pick a filter that
 * yields zero results (§9).
 */
export function shapeAttributeFacets(
  raw: RawAttributeCount[],
  specs: AttributeSpec[],
): ShapedAttributeFacet[] {
  const byKey = new Map<string, ShapedAttributeFacet>();

  for (const spec of specs) {
    const existing = byKey.get(spec.key);
    if (existing === undefined) {
      byKey.set(spec.key, {
        key: spec.key,
        label: spec.label,
        kind: spec.kind,
        suffix: spec.suffix,
        appliesToTypes: [spec.businessType],
        operators: OPERATORS[spec.kind],
      });
      continue;
    }
    // The same key declared by several selected types — merge rather than duplicate.
    if (!existing.appliesToTypes.includes(spec.businessType)) {
      existing.appliesToTypes.push(spec.businessType);
    }
  }

  const counts = new Map<string, Map<string, number>>();
  const numbers = new Map<string, number[]>();

  for (const row of raw) {
    const facet = byKey.get(row.key);
    if (facet === undefined) {
      continue;
    }

    if (facet.kind === AttributeFieldType.NUMBER) {
      const parsed = Number(row.value);
      if (row.value.trim() !== '' && Number.isFinite(parsed)) {
        const list = numbers.get(row.key) ?? [];
        list.push(parsed);
        numbers.set(row.key, list);
      }
      continue;
    }

    if (!VALUE_LISTED.has(facet.kind)) {
      continue;
    }

    const values = MULTI_VALUE.has(facet.kind)
      ? row.value
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
      : [row.value];

    const bucket = counts.get(row.key) ?? new Map<string, number>();
    for (const value of values) {
      bucket.set(value, (bucket.get(value) ?? 0) + row.count);
    }
    counts.set(row.key, bucket);
  }

  for (const [key, facet] of byKey) {
    const numeric = numbers.get(key);
    if (numeric !== undefined && numeric.length > 0) {
      facet.range = { min: Math.min(...numeric), max: Math.max(...numeric) };
      continue;
    }
    const bucket = counts.get(key);
    if (bucket !== undefined && bucket.size > 0) {
      facet.values = [...bucket]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    }
  }

  return [...byKey.values()];
}
