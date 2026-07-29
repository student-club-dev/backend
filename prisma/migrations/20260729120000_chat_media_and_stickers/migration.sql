-- AlterEnum
-- Adds more than one value. Safe inside a transaction on PostgreSQL 12+ as long as the new values
-- are not *used* in the same transaction — this migration only declares them.
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'GIF';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'VIDEO';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'STICKER';

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'GIF', 'VIDEO', 'VOICE', 'FILE');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaProvider" AS ENUM ('TENOR', 'GIPHY');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'OK', 'BLOCKED');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "sticker_id" TEXT,
ADD COLUMN     "album_id" TEXT;

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'READY',
    "moderation" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "is_animated" BOOLEAN NOT NULL DEFAULT false,
    "storage_key" TEXT,
    "thumb_storage_key" TEXT,
    "external_url" TEXT,
    "external_thumb_url" TEXT,
    "provider" "MediaProvider",
    "external_id" TEXT,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "waveform" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "file_name" TEXT,
    "blur_hash" TEXT,
    "message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker_packs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cover_url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sticker_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stickers" (
    "id" TEXT NOT NULL,
    "pack_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 512,
    "height" INTEGER NOT NULL DEFAULT 512,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stickers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_message_id_key" ON "media_assets"("message_id");

-- CreateIndex
CREATE INDEX "media_assets_owner_id_created_at_idx" ON "media_assets"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "media_assets_conversation_id_idx" ON "media_assets"("conversation_id");

-- CreateIndex
CREATE INDEX "media_assets_created_at_idx" ON "media_assets"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sticker_packs_key_key" ON "sticker_packs"("key");

-- CreateIndex
CREATE INDEX "stickers_pack_id_idx" ON "stickers"("pack_id");

-- CreateIndex
CREATE INDEX "messages_album_id_idx" ON "messages"("album_id");

-- CreateIndex
CREATE INDEX "messages_sticker_id_idx" ON "messages"("sticker_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sticker_id_fkey" FOREIGN KEY ("sticker_id") REFERENCES "stickers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "sticker_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
