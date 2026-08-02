-- CreateEnum
CREATE TYPE "MediaQuality" AS ENUM ('AUTO', 'HIGH', 'ORIGINAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MediaKind" ADD VALUE 'IMAGE_ORIGINAL';
ALTER TYPE "MediaKind" ADD VALUE 'VIDEO_NOTE';

-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'VIDEO_NOTE';

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "quality" "MediaQuality",
ADD COLUMN     "transcript" TEXT,
ADD COLUMN     "variants" JSONB;

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "kind" "MediaKind" NOT NULL,
    "quality" "MediaQuality",
    "file_name" TEXT,
    "total_bytes" BIGINT NOT NULL,
    "chunk_size" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upload_sessions_owner_id_idx" ON "upload_sessions"("owner_id");

-- CreateIndex
CREATE INDEX "upload_sessions_expires_at_idx" ON "upload_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "upload_sessions_conversation_id_idx" ON "upload_sessions"("conversation_id");

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
