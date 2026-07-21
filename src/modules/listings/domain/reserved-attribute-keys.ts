/**
 * Reserved system attribute keys (LISTINGS.md §5/§6). They carry meaning outside the per-type
 * attribute schema and are therefore accepted even though the catalog does not declare them:
 * `_regular` marks a plain single-price (non-discount) listing, `_gender` / `_phone` are system
 * hints. Attribute validation skips these keys instead of rejecting them as unknown.
 */
export const REGULAR_KEY = '_regular';
export const GENDER_KEY = '_gender';
export const PHONE_KEY = '_phone';

/** The value of `_regular` that marks a listing as a regular (non-discount) listing. */
export const REGULAR_VALUE = '1';

/** All reserved system keys, exempt from the catalog attribute-schema check. */
export const RESERVED_ATTRIBUTE_KEYS: readonly string[] = [REGULAR_KEY, GENDER_KEY, PHONE_KEY];
