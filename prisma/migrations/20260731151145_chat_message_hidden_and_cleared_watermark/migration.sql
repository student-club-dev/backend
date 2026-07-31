-- NOTE: `prisma migrate dev` also emitted `DROP INDEX "catalog_synonyms_term_trgm"` here. That is
-- pre-existing drift, not part of this change: the index is a raw-SQL GIN trigram index created by
-- 20260727090000_add_feed_foundation and never modelled in schema.prisma, so every diff wants to
-- drop it. Removed deliberately — dropping it would silently deoptimise catalog search.

-- AlterTable
ALTER TABLE "conversation_members" ADD COLUMN     "cleared_before_seq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "message_hidden" (
    "student_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "hidden_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_hidden_pkey" PRIMARY KEY ("student_id","message_id")
);

-- CreateIndex
CREATE INDEX "message_hidden_message_id_idx" ON "message_hidden"("message_id");

-- AddForeignKey
ALTER TABLE "message_hidden" ADD CONSTRAINT "message_hidden_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_hidden" ADD CONSTRAINT "message_hidden_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
