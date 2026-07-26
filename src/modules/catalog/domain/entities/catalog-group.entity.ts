/**
 * A top-level catalog group over the business types (STUDENT_FEED.md, Ilova).
 * `typeKeys` is the group's membership, resolved from `business_types.group_key`.
 */
export interface CatalogGroup {
  key: string;
  nameUz: string;
  nameRu: string | null;
  emoji: string | null;
  icon: string | null;
  accentColor: string | null;
  sortOrder: number;
  typeKeys: string[];
}
