-- CreateTable
CREATE TABLE "student_listing_views" (
    "listing_id" TEXT NOT NULL,
    "viewer_id" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_listing_views_pkey" PRIMARY KEY ("listing_id","viewer_id")
);

-- CreateIndex
CREATE INDEX "student_listing_views_viewed_at_idx" ON "student_listing_views"("viewed_at");

-- AddForeignKey
ALTER TABLE "student_listing_views" ADD CONSTRAINT "student_listing_views_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "student_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_listing_views" ADD CONSTRAINT "student_listing_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
