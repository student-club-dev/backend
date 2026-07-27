import { AttributeFieldType } from '../enums/attribute-field-type.enum';

/**
 * The catalog's validation spec for one listing attribute — the source of truth Listings validates
 * a listing's attributes against (LISTINGS.md §6). Distinct from {@link AttributeField} (the
 * presentation projection): `options` is the raw allowed-value list (`string[]`) rather than the
 * `{ value, label }[]` shown in the form.
 */
export interface AttributeSpec {
  /** Owning business type — the feed's filter schema reports it as `appliesToTypes`. */
  businessType: string;
  key: string;
  label: string;
  kind: AttributeFieldType;
  required: boolean;
  /** Unit shown next to a NUMBER input ("gramm", "daqiqa"). */
  suffix: string | null;
  options: string[] | null;
}
