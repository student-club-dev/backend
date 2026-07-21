import { AttributeFieldType } from '../enums/attribute-field-type.enum';

/**
 * The catalog's validation spec for one listing attribute — the source of truth Listings validates
 * a listing's attributes against (LISTINGS.md §6). Distinct from {@link AttributeField} (the
 * presentation projection): `options` is the raw allowed-value list (`string[]`) rather than the
 * `{ value, label }[]` shown in the form.
 */
export interface AttributeSpec {
  key: string;
  label: string;
  kind: AttributeFieldType;
  required: boolean;
  options: string[] | null;
}
