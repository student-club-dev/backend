-- NOTE: `prisma migrate dev` also emitted `DROP INDEX "catalog_synonyms_term_trgm"` here. That is
-- pre-existing drift, not part of this change: the index is a raw-SQL GIN trigram index created by
-- 20260727090000_add_feed_foundation and never modelled in schema.prisma, so every diff wants to
-- drop it. Removed deliberately — dropping it would silently deoptimise catalog search.

-- A sticker picked from provider search, denormalised onto the message. There is no catalogue row
-- to point at, and a sticker sent last year must keep rendering after it leaves the provider's
-- catalogue. All nullable and additive: existing rows and older clients are untouched.
-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "sticker_external_id" TEXT,
ADD COLUMN     "sticker_height" INTEGER,
ADD COLUMN     "sticker_provider" "MediaProvider",
ADD COLUMN     "sticker_thumb_url" TEXT,
ADD COLUMN     "sticker_url" TEXT,
ADD COLUMN     "sticker_width" INTEGER;
