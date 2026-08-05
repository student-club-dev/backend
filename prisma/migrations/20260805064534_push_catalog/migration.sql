-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "push_deferred_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "district_id" TEXT,
ADD COLUMN     "region_id" TEXT;

-- CreateTable
CREATE TABLE "notification_dedup" (
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_dedup_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "notification_dedup_created_at_idx" ON "notification_dedup"("created_at");

-- CreateIndex
CREATE INDEX "notifications_push_deferred_until_idx" ON "notifications"("push_deferred_until");
