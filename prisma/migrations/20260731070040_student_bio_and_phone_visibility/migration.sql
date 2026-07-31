-- NOTE: `prisma migrate dev` also emitted `DROP INDEX "catalog_synonyms_term_trgm"` here. That is
-- pre-existing drift, not part of this change: the index is a raw-SQL GIN trigram index created by
-- 20260727090000_add_feed_foundation and never modelled in schema.prisma, so every diff wants to
-- drop it. Removed deliberately — dropping it would silently deoptimise catalog search.

-- CreateEnum
CREATE TYPE "PhoneVisibility" AS ENUM ('EVERYONE', 'CONNECTIONS', 'NOBODY');

-- `bio` is nullable and `phone_visibility` defaults to NOBODY, so this is safe on a populated table:
-- no backfill, no rewrite of existing rows' visible behaviour. NOBODY specifically — every student
-- already in the table gave us their number to sign in with, and any other default would publish it
-- to their connections the moment this ships, without ever asking them.
-- AlterTable
ALTER TABLE "students" ADD COLUMN     "bio" VARCHAR(140),
ADD COLUMN     "phone_visibility" "PhoneVisibility" NOT NULL DEFAULT 'NOBODY';
