-- CreateEnum
CREATE TYPE "StudentListingKind" AS ENUM ('RENTAL', 'SERVICE', 'JOB', 'TASK');

-- CreateEnum
CREATE TYPE "StudentPriceUnit" AS ENUM ('PER_ITEM', 'PER_HOUR', 'PER_KG', 'PER_DAY', 'PER_MONTH', 'PER_COURSE', 'PER_LESSON', 'PER_TICKET', 'PER_PERSON', 'PER_SESSION', 'PER_PAGE');

-- CreateEnum
CREATE TYPE "ListingAudience" AS ENUM ('ALL', 'NEARBY_UNIVERSITIES', 'MY_UNIVERSITY');

-- CreateTable
CREATE TABLE "student_listings" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "kind" "StudentListingKind" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price_unit" "StudentPriceUnit",
    "price" BIGINT NOT NULL DEFAULT 0,
    "price_max" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "is_negotiable" BOOLEAN NOT NULL DEFAULT false,
    "contact_phone" TEXT,
    "university_id" TEXT,
    "audience" "ListingAudience" NOT NULL DEFAULT 'ALL',
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "option_groups" JSONB NOT NULL DEFAULT '[]',
    "details" JSONB NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "rejection_reason" TEXT,
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "search_text" TEXT,
    "search_vector" tsvector,
    "idempotency_key" TEXT,
    "published_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "rental_gender" TEXT,
    "rental_property_type" TEXT,
    "rental_room_count" INTEGER,
    "rental_needed_tenants" INTEGER,
    "service_type" TEXT,
    "service_format" TEXT,
    "service_has_free_trial" BOOLEAN,
    "job_employment" TEXT,
    "job_category_key" TEXT,
    "job_shift" TEXT,
    "job_experience" TEXT,
    "task_category" TEXT,
    "task_type_key" TEXT,
    "task_format" TEXT,
    "task_deadline" TIMESTAMP(3),

    CONSTRAINT "student_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_listing_branches" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "geo_point" geography(Point, 4326),
    "address" TEXT NOT NULL,
    "name" TEXT,
    "landmark" TEXT,
    "region_id" TEXT,
    "district_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_listing_branches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_listings_kind_status_valid_to_idx" ON "student_listings"("kind", "status", "valid_to");

-- CreateIndex
CREATE INDEX "student_listings_owner_id_updated_at_idx" ON "student_listings"("owner_id", "updated_at");

-- CreateIndex
CREATE INDEX "student_listings_status_valid_to_idx" ON "student_listings"("status", "valid_to");

-- CreateIndex
CREATE INDEX "student_listings_kind_status_rental_gender_idx" ON "student_listings"("kind", "status", "rental_gender");

-- CreateIndex
CREATE INDEX "student_listings_kind_status_service_type_idx" ON "student_listings"("kind", "status", "service_type");

-- CreateIndex
CREATE INDEX "student_listings_kind_status_job_category_key_idx" ON "student_listings"("kind", "status", "job_category_key");

-- CreateIndex
CREATE INDEX "student_listings_kind_status_task_category_idx" ON "student_listings"("kind", "status", "task_category");

-- CreateIndex
CREATE INDEX "student_listings_kind_status_task_deadline_idx" ON "student_listings"("kind", "status", "task_deadline");

-- CreateIndex
CREATE INDEX "student_listings_details_gin" ON "student_listings" USING GIN ("details" jsonb_path_ops);

-- CreateIndex
CREATE INDEX "student_listings_search_vector_gin" ON "student_listings" USING GIN ("search_vector");

-- CreateIndex
CREATE UNIQUE INDEX "student_listings_owner_id_idempotency_key_key" ON "student_listings"("owner_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "student_listing_branches_listing_id_idx" ON "student_listing_branches"("listing_id");

-- CreateIndex
CREATE INDEX "student_listing_branches_geo_point_gist" ON "student_listing_branches" USING GIST ("geo_point");

-- AddForeignKey
ALTER TABLE "student_listings" ADD CONSTRAINT "student_listings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_listing_branches" ADD CONSTRAINT "student_listing_branches_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "student_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Populate the PostGIS geography point from lat/lng, exactly as branches_set_geo_point does.
-- Prisma cannot express this, so it lives here and the column is modelled as Unsupported.
CREATE OR REPLACE FUNCTION student_listing_branches_set_geo_point() RETURNS trigger AS $$
BEGIN
  NEW.geo_point := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS student_listing_branches_geo_point_biu ON "student_listing_branches";
CREATE TRIGGER student_listing_branches_geo_point_biu
  BEFORE INSERT OR UPDATE OF lat, lng ON "student_listing_branches"
  FOR EACH ROW EXECUTE FUNCTION student_listing_branches_set_geo_point();

-- Derive the search vector from the haystack the service writes. 'simple', not 'english' — the
-- corpus is Uzbek and an English stemmer would mangle it. uz_normalize() already exists from the
-- add_feed_foundation migration.
CREATE OR REPLACE FUNCTION student_listings_search_vector_refresh() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', uz_normalize(COALESCE(NEW.search_text, '')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS student_listings_search_vector_trigger ON "student_listings";
CREATE TRIGGER student_listings_search_vector_trigger
  BEFORE INSERT OR UPDATE OF search_text ON "student_listings"
  FOR EACH ROW EXECUTE FUNCTION student_listings_search_vector_refresh();
