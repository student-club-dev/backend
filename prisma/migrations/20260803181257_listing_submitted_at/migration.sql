-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "submitted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "listings_submitted_at_idx" ON "listings"("submitted_at");

