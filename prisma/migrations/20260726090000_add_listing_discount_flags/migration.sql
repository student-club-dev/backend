-- AlterTable
ALTER TABLE "listings" ADD COLUMN "is_discount" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "listings" ADD COLUMN "discount_percent" INTEGER;

-- Backfill: a listing is "regular" when attributes._regular = '1' (STUDENT_FEED.md Q0).
UPDATE "listings" SET "is_discount" = false
  WHERE "attributes" ->> '_regular' = '1';

-- Normalised percent for the discount listings. FREE_ITEM (1+1) has finalPrice == originalPrice,
-- so it gets a flat 50 per the sort rule; the rest derive from the actual price drop.
UPDATE "listings" SET "discount_percent" = CASE
    WHEN "discount_type" = 'FREE_ITEM' THEN 50
    WHEN "original_price" > 0
      THEN GREATEST(0, ROUND(("original_price" - "final_price") * 100.0 / "original_price"))::int
    ELSE 0
  END
  WHERE "is_discount" = true;

-- CreateIndex
CREATE INDEX "listings_is_discount_idx" ON "listings"("is_discount");
CREATE INDEX "listings_business_id_is_discount_status_idx" ON "listings"("business_id", "is_discount", "status");
