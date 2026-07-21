import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { AttributeSpec } from '../../catalog/domain/entities/attribute-spec.entity';
import { AttributeFieldType } from '../../catalog/domain/enums/attribute-field-type.enum';
import { RESERVED_ATTRIBUTE_KEYS } from '../domain/reserved-attribute-keys';

/**
 * Full-strict attribute validation against the catalog schema (LISTINGS.md §6). The catalog stays
 * the single source of truth: Listings is never more permissive. `specs` are already the merged
 * type-level + category-level specs. Every `required` spec must be present; each value must match
 * its `kind`; unknown keys are rejected except the reserved system keys (`_regular`, `_gender`,
 * `_phone`). Any failure throws `422 ATTRIBUTES_SCHEMA_MISMATCH` (field-level).
 */
export function validateAttributes(
  attributes: Record<string, string> | null,
  specs: AttributeSpec[],
): void {
  const values = attributes ?? {};
  const specByKey = new Map(specs.map((spec) => [spec.key, spec]));

  for (const spec of specs) {
    if (!spec.required) {
      continue;
    }
    const value = values[spec.key];
    if (value === undefined || value.trim() === '') {
      throw mismatch(spec.key, `${spec.label} majburiy`);
    }
  }

  for (const [key, value] of Object.entries(values)) {
    if (RESERVED_ATTRIBUTE_KEYS.includes(key)) {
      continue;
    }
    const spec = specByKey.get(key);
    if (spec === undefined) {
      throw mismatch(key, 'Noma’lum atribut');
    }
    if (!matchesKind(spec, value)) {
      throw mismatch(key, `${spec.label} qiymati noto‘g‘ri`);
    }
  }
}

/** Whether a submitted (string) value is valid for the spec's kind. Multi-values are comma-separated. */
function matchesKind(spec: AttributeSpec, value: string): boolean {
  const options = spec.options;
  switch (spec.kind) {
    case AttributeFieldType.TEXT:
    case AttributeFieldType.TAGS:
      return true;
    case AttributeFieldType.NUMBER:
      return value.trim() !== '' && !Number.isNaN(Number(value));
    case AttributeFieldType.BOOLEAN:
      return ['true', 'false'].includes(value.trim().toLowerCase());
    case AttributeFieldType.SELECT:
      return options !== null && options.includes(value);
    case AttributeFieldType.MULTI_SELECT: {
      const parts = splitMulti(value);
      return parts.length > 0 && options !== null && parts.every((part) => options.includes(part));
    }
  }
}

/** Splits a comma-separated multi-value into trimmed, non-empty parts. */
function splitMulti(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function mismatch(key: string, message: string): AppException {
  return new AppException(
    ERROR_CODE.ATTRIBUTES_SCHEMA_MISMATCH,
    422,
    'Atributlar katalog sxemasiga mos emas',
    { [key]: message },
  );
}
