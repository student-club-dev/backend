/**
 * What a suggestion points at. The client sends the picked one back as an exact filter
 * (`categoryKeys: ["PALOV"]`) instead of free text, so a suggestion is only useful if the
 * client can act on it — hence every kind carries the key(s) that filter needs.
 */
export type SuggestionKind = 'CATEGORY' | 'TYPE' | 'BUSINESS' | 'LISTING';

/**
 * One autocomplete row (STUDENT_FEED.md §9). `count` is how many *visible* listings (Q4) the
 * suggestion would yield inside the requested scope; a suggestion that would yield none is never
 * offered, same principle as the filter schema.
 *
 * Only the keys its kind needs are filled: CATEGORY → `typeKey` + `categoryKey`, TYPE → `typeKey`,
 * BUSINESS → `businessId`, LISTING → `listingId`. The rest are null.
 */
export interface Suggestion {
  kind: SuggestionKind;
  label: string;
  typeKey: string | null;
  categoryKey: string | null;
  businessId: string | null;
  listingId: string | null;
  count: number;
}

/** The slice autocomplete runs over: the free-text term, the expanded business types, and a cap. */
export interface SuggestQuery {
  term: string;
  types: string[];
  limit: number;
}
