-- NOTE: `prisma migrate dev` also emitted `DROP INDEX "catalog_synonyms_term_trgm"` here. That is
-- pre-existing drift, not part of this change: the index is a raw-SQL GIN trigram index created by
-- 20260727090000_add_feed_foundation and never modelled in schema.prisma, so every diff wants to
-- drop it. Removed deliberately — dropping it would silently deoptimise catalog search.

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "quote_offset" INTEGER,
ADD COLUMN     "quote_text" VARCHAR(300),
ADD COLUMN     "reply_to_message_id" TEXT,
ADD COLUMN     "reply_to_preview" VARCHAR(120),
ADD COLUMN     "reply_to_sender_id" TEXT,
ADD COLUMN     "reply_to_sender_name" TEXT,
ADD COLUMN     "reply_to_seq" INTEGER,
ADD COLUMN     "reply_to_type" "MessageType";

-- CreateIndex
CREATE INDEX "messages_reply_to_message_id_idx" ON "messages"("reply_to_message_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
