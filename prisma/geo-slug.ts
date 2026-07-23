/**
 * Region/District id derivation for the geo seed.
 *
 * Ids are semantic slugs (TOSHKENT_SHAHRI, CHILONZOR) — the contract (elon-uz.json) and the Prisma
 * schema document them this way, and the mobile client treats them as opaque strings fetched from
 * the geo endpoints. They are derived from `name_uz` so an id is stable and human-readable rather
 * than the source dataset's arbitrary row number.
 *
 * Rules:
 *  - Region: strip a trailing " viloyati" / " Respublikasi"; KEEP " shahri" so "Toshkent shahri"
 *    (TOSHKENT_SHAHRI, the city) stays distinct from "Toshkent viloyati" (TOSHKENT, the region).
 *  - District: a rural district ("X tumani") becomes its base (CHILONZOR); a city district
 *    ("X" or "X shahar") becomes "<BASE>_SHAHAR" so it never collides with the "X tumani" of the
 *    same name (e.g. "Andijon" -> ANDIJON_SHAHAR vs "Andijon tumani" -> ANDIJON).
 *  - Uzbek-Latin marks (Oʻ, gʻ and every apostrophe variant) are dropped; everything else is
 *    uppercased and non-alphanumerics collapse to a single "_".
 */

/** Strip the given trailing type-words, drop Uzbek apostrophes, then UPPER_SNAKE_CASE the rest. */
function normalize(nameUz: string, stripSuffixes: string[]): string {
  let s = nameUz.trim();
  for (const suffix of stripSuffixes) {
    s = s.replace(new RegExp(`\\s+${suffix}$`, 'i'), '');
  }
  return s
    .replace(/[ʻʼ‘’'`“”"]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function regionSlug(nameUz: string): string {
  return normalize(nameUz, ['viloyati', 'Respublikasi']);
}

export function districtSlug(nameUz: string): string {
  const isRural = /\s+(?:tumani|tumanlari)$/i.test(nameUz.trim());
  return isRural
    ? normalize(nameUz, ['tumani', 'tumanlari'])
    : `${normalize(nameUz, ['shahar', 'shaxar'])}_SHAHAR`;
}

/** Guard the derivation: a future dataset edit that produced a colliding id must fail the seed. */
export function assertUniqueSlugs(kind: string, slugs: string[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const slug of slugs) {
    if (seen.has(slug)) duplicates.add(slug);
    seen.add(slug);
  }
  if (duplicates.size > 0) {
    throw new Error(`Duplicate ${kind} slugs from uz-*.json: ${[...duplicates].join(', ')}`);
  }
}
