-- CreateEnum
CREATE TYPE "LastSeenVisibility" AS ENUM ('EVERYONE', 'CONNECTIONS', 'NOBODY');

-- NOTE: `prisma migrate dev` also emitted `DROP INDEX "catalog_synonyms_term_trgm"` here. That is
-- pre-existing drift, not part of this change: the index is a raw-SQL GIN trigram index created by
-- 20260727090000_add_feed_foundation and never modelled in schema.prisma, so every diff wants to
-- drop it. Removed deliberately — dropping it would silently deoptimise catalog search.

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "last_seen_visibility" "LastSeenVisibility" NOT NULL DEFAULT 'CONNECTIONS';

-- CreateIndex
CREATE INDEX "students_university_id_idx" ON "students"("university_id");

-- CreateIndex
CREATE INDEX "students_course_year_idx" ON "students"("course_year");

-- CreateIndex
CREATE INDEX "students_gender_idx" ON "students"("gender");

-- CreateIndex
CREATE INDEX "students_birth_year_idx" ON "students"("birth_year");

-- CreateIndex
CREATE INDEX "students_created_at_idx" ON "students"("created_at");
