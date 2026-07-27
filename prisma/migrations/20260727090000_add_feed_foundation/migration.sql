-- Extensions: unaccent powers uz_normalize, pg_trgm backs the suggest endpoint's typo tolerance.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Uzbek text normalisation (STUDENT_FEED.md §7). One function so the write path, the search query
-- and the suggest query all fold text identically:
--   * apostrophe variants in o'/g' are dropped   (o'quv = oquv = oʻquv)
--   * Cyrillic is transliterated to Latin         (Тошкент = Toshkent)
--   * accents removed, lower-cased, whitespace collapsed
-- Multi-character Cyrillic (щ ш ч ю я ё) is expanded first; translate() then maps the 1:1 letters
-- and deletes the trailing set (ъ ь and every apostrophe variant) that has no counterpart.
-- IMMUTABLE so it can be used in expression indexes.
CREATE OR REPLACE FUNCTION uz_normalize(input text) RETURNS text AS $$
  SELECT btrim(regexp_replace(
    translate(
      lower(unaccent(coalesce(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(input, 'щ', 'shch', 'gi'),
                  'ш', 'sh', 'gi'),
                'ч', 'ch', 'gi'),
              'ю', 'yu', 'gi'),
            'я', 'ya', 'gi'),
          'ё', 'yo', 'gi'),
        ''))),
      'абвгдежзийклмнопрстуфхцыэғқҳў' || 'ъь' || 'ʻʼ''`´',
      'abvgdejziyklmnoprstufxciegqho'
    ),
    '\s+', ' ', 'g'));
$$ LANGUAGE sql IMMUTABLE;

-- AlterTable: the listing search haystack.
ALTER TABLE "listings" ADD COLUMN "search_text" TEXT;
ALTER TABLE "listings" ADD COLUMN "search_vector" tsvector;

-- Derive the vector from the normalised text on every write. 'simple' (not 'english') because the
-- corpus is Uzbek — an English stemmer would mangle it.
CREATE OR REPLACE FUNCTION listings_search_vector_refresh() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', uz_normalize(COALESCE(NEW.search_text, '')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS listings_search_vector_trigger ON "listings";
CREATE TRIGGER listings_search_vector_trigger
  BEFORE INSERT OR UPDATE OF search_text ON "listings"
  FOR EACH ROW EXECUTE FUNCTION listings_search_vector_refresh();

CREATE INDEX "listings_search_vector_gin" ON "listings" USING GIN ("search_vector");

-- CreateTable
CREATE TABLE "catalog_synonyms" (
    "id" TEXT NOT NULL,
    "business_type" TEXT NOT NULL,
    "category_key" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_synonyms_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "catalog_synonyms_business_type_category_key_term_key"
  ON "catalog_synonyms"("business_type", "category_key", "term");
CREATE INDEX "catalog_synonyms_term_idx" ON "catalog_synonyms"("term");
-- Trigram index for suggest: matches a mistyped "palv" against "palov".
CREATE INDEX "catalog_synonyms_term_trgm" ON "catalog_synonyms" USING GIN ("term" gin_trgm_ops);

-- CreateTable
CREATE TABLE "branch_working_hours" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "day" "DayOfWeek" NOT NULL,
    "open_minute" INTEGER,
    "close_minute" INTEGER,
    "spans_midnight" BOOLEAN NOT NULL DEFAULT false,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "branch_working_hours_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "branch_working_hours_branch_id_day_key"
  ON "branch_working_hours"("branch_id", "day");
CREATE INDEX "branch_working_hours_day_open_minute_close_minute_idx"
  ON "branch_working_hours"("day", "open_minute", "close_minute");
ALTER TABLE "branch_working_hours" ADD CONSTRAINT "branch_working_hours_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "student_favorites" (
    "student_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_favorites_pkey" PRIMARY KEY ("student_id", "listing_id")
);
CREATE INDEX "student_favorites_listing_id_idx" ON "student_favorites"("listing_id");
CREATE INDEX "student_favorites_student_id_created_at_idx"
  ON "student_favorites"("student_id", "created_at");
ALTER TABLE "student_favorites" ADD CONSTRAINT "student_favorites_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_favorites" ADD CONSTRAINT "student_favorites_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
