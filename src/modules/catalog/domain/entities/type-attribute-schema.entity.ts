import { AttributeField } from './category.entity';

/** The form fields that apply only when one specific category is selected. */
export interface CategoryAttributeFields {
  categoryKey: string;
  fields: AttributeField[];
}

/**
 * Every attribute field defined for a business type, split the way the catalog stores them: the
 * type-level fields that apply to any of its listings, and the category-level ones keyed by
 * category. A client merges `common` with the selected category's `fields` to build the form.
 *
 * This is what `GET /business/types/{type}/attributes-schema` serves. The request document asks for
 * JSON Schema; we serve {@link AttributeField} instead, because that is the vocabulary
 * `GET /business/types/{type}/categories` already returns and the dynamic form already parses.
 * Two encodings of one concept would mean two parsers.
 */
export interface TypeAttributeSchema {
  businessType: string;
  common: AttributeField[];
  byCategory: CategoryAttributeFields[];
}
