-- NOTE: `prisma migrate dev` also emitted `DROP INDEX "catalog_synonyms_term_trgm"` here. That is
-- pre-existing drift, not part of this change: the index is a raw-SQL GIN trigram index created by
-- 20260727090000_add_feed_foundation and never modelled in schema.prisma, so every diff wants to
-- drop it. Removed deliberately — dropping it would silently deoptimise catalog search.

-- CreateEnum
CREATE TYPE "StoryKind" AS ENUM ('IMAGE', 'VIDEO');

-- Three new upload kinds. `ALTER TYPE ... ADD VALUE` runs inside a transaction from PostgreSQL 12
-- on (we are on 16), and none of the new labels is *used* later in this file — which is the part
-- Postgres still forbids in the same transaction.
-- AlterEnum
ALTER TYPE "MediaKind" ADD VALUE 'PROFILE_PHOTO';
ALTER TYPE "MediaKind" ADD VALUE 'STORY_IMAGE';
ALTER TYPE "MediaKind" ADD VALUE 'STORY_VIDEO';

-- Dropping NOT NULL only widens what the column accepts, so every existing row stays valid and no
-- rewrite happens. Profile photos and stories have no conversation to point at; their read
-- authorisation is by kind instead (see ChatMediaService.mayRead).
-- AlterTable
ALTER TABLE "media_assets" ALTER COLUMN "conversation_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "profile_photos" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumb_url" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "kind" "StoryKind" NOT NULL,
    "media_id" TEXT NOT NULL,
    "caption" VARCHAR(200),
    "url" TEXT NOT NULL,
    "thumb_url" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "views_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_views" (
    "story_id" TEXT NOT NULL,
    "viewer_id" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_views_pkey" PRIMARY KEY ("story_id","viewer_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profile_photos_media_id_key" ON "profile_photos"("media_id");

-- CreateIndex
CREATE INDEX "profile_photos_student_id_sort_order_idx" ON "profile_photos"("student_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "stories_media_id_key" ON "stories"("media_id");

-- CreateIndex
CREATE INDEX "stories_author_id_created_at_idx" ON "stories"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "stories_expires_at_idx" ON "stories"("expires_at");

-- CreateIndex
CREATE INDEX "story_views_viewer_id_idx" ON "story_views"("viewer_id");

-- AddForeignKey
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
