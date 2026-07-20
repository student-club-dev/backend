-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'REJECTED', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'EXPIRED', 'SOLD_OUT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PriceUnit" AS ENUM ('PER_ITEM', 'PER_HOUR', 'PER_KG', 'PER_MONTH', 'PER_COURSE', 'PER_LESSON', 'PER_TICKET', 'PER_PERSON', 'PER_SESSION');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED_AMOUNT', 'SPECIAL_PRICE', 'FREE_ITEM');

-- CreateEnum
CREATE TYPE "RedemptionMethod" AS ENUM ('QR', 'PROMO_CODE', 'STUDENT_ID', 'ONLINE_LINK');

-- CreateEnum
CREATE TYPE "RedemptionPeriod" AS ENUM ('DAY', 'WEEK', 'MONTH', 'TOTAL');

-- CreateEnum
CREATE TYPE "SelectionType" AS ENUM ('SINGLE', 'MULTIPLE');

-- CreateEnum
CREATE TYPE "CourseYear" AS ENUM ('1', '2', '3', '4', 'MASTER');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateEnum
CREATE TYPE "AttributeKind" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'TAGS');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'APPLE');

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT,
    "phone_number" TEXT,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "first_name" TEXT,
    "last_name" TEXT,
    "avatar_url" TEXT,
    "gender" "Gender",
    "university_id" TEXT,
    "university_email" TEXT,
    "birth_year" INTEGER,
    "course_year" "CourseYear",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_owners" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT,
    "phone_number" TEXT,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "first_name" TEXT,
    "last_name" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_oauth_accounts" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_owner_oauth_accounts" (
    "id" TEXT NOT NULL,
    "business_owner_id" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_owner_oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_refresh_tokens" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_name" TEXT,
    "platform" TEXT,
    "ip_address" TEXT,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_owner_refresh_tokens" (
    "id" TEXT NOT NULL,
    "business_owner_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_name" TEXT,
    "platform" TEXT,
    "ip_address" TEXT,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_owner_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_types" (
    "type" TEXT NOT NULL,
    "name_uz" TEXT NOT NULL,
    "name_ru" TEXT,
    "emoji" TEXT,
    "accent_color" TEXT,
    "icon_url" TEXT,
    "default_price_unit" "PriceUnit" NOT NULL,
    "price_units" "PriceUnit"[] DEFAULT ARRAY[]::"PriceUnit"[],
    "available_for_genders" "Gender"[] DEFAULT ARRAY[]::"Gender"[],
    "all_category_label" TEXT,
    "option_group_hint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_types_pkey" PRIMARY KEY ("type")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "business_type" TEXT NOT NULL,
    "gender" "Gender",
    "key" TEXT NOT NULL,
    "name_uz" TEXT NOT NULL,
    "name_ru" TEXT,
    "icon_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "requires_custom_name" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_specs" (
    "id" TEXT NOT NULL,
    "business_type" TEXT NOT NULL,
    "category_key" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "AttributeKind" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "hint" TEXT,
    "suffix" TEXT,
    "multiple" BOOLEAN,
    "options" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attribute_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "name_uz" TEXT NOT NULL,
    "name_ru" TEXT,
    "center_lat" DOUBLE PRECISION,
    "center_lng" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" TEXT NOT NULL,
    "region_id" TEXT NOT NULL,
    "name_uz" TEXT NOT NULL,
    "name_ru" TEXT,
    "center_lat" DOUBLE PRECISION,
    "center_lng" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "inn" TEXT,
    "description" TEXT,
    "logo_url" TEXT,
    "cover_url" TEXT,
    "phone" TEXT NOT NULL,
    "contacts" JSONB,
    "is_online_only" BOOLEAN NOT NULL DEFAULT false,
    "status" "BusinessStatus" NOT NULL DEFAULT 'DRAFT',
    "rejection_reason" TEXT,
    "rating" DOUBLE PRECISION,
    "reviews_count" INTEGER NOT NULL DEFAULT 0,
    "listings_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "region_id" TEXT NOT NULL,
    "district_id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "landmark" TEXT,
    "entrance_note" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "geohash" TEXT,
    "map_url" TEXT,
    "metro_station" TEXT,
    "geo_point" geography(Point, 4326),
    "working_hours" JSONB NOT NULL,
    "delivery_zone" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "category_key" TEXT NOT NULL,
    "custom_category_name" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price_unit" "PriceUnit" NOT NULL,
    "original_price" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "discount_type" "DiscountType" NOT NULL,
    "discount_value" BIGINT NOT NULL,
    "final_price" BIGINT NOT NULL,
    "discount_conditions" TEXT,
    "applies_to_options" BOOLEAN NOT NULL DEFAULT false,
    "redemption_method" "RedemptionMethod" NOT NULL,
    "promo_code" TEXT,
    "redemption_url" TEXT,
    "per_user_limit" INTEGER,
    "per_user_period" "RedemptionPeriod",
    "total_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "attributes" JSONB,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "rejection_reason" TEXT,
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_branches" (
    "listing_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_branches_pkey" PRIMARY KEY ("listing_id","branch_id")
);

-- CreateTable
CREATE TABLE "option_groups" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "selection_type" "SelectionType" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "min_select" INTEGER,
    "max_select" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "options" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_delta" BIGINT NOT NULL DEFAULT 0,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "amount" BIGINT,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "students_email_key" ON "students"("email");

-- CreateIndex
CREATE UNIQUE INDEX "students_phone_number_key" ON "students"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "business_owners_email_key" ON "business_owners"("email");

-- CreateIndex
CREATE UNIQUE INDEX "business_owners_phone_number_key" ON "business_owners"("phone_number");

-- CreateIndex
CREATE INDEX "student_oauth_accounts_student_id_idx" ON "student_oauth_accounts"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_oauth_accounts_provider_provider_account_id_key" ON "student_oauth_accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE INDEX "business_owner_oauth_accounts_business_owner_id_idx" ON "business_owner_oauth_accounts"("business_owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_owner_oauth_accounts_provider_provider_account_id_key" ON "business_owner_oauth_accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_refresh_tokens_token_hash_key" ON "student_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "student_refresh_tokens_student_id_idx" ON "student_refresh_tokens"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_owner_refresh_tokens_token_hash_key" ON "business_owner_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "business_owner_refresh_tokens_business_owner_id_idx" ON "business_owner_refresh_tokens"("business_owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_business_type_gender_key_key" ON "categories"("business_type", "gender", "key");

-- CreateIndex
CREATE UNIQUE INDEX "attribute_specs_business_type_category_key_key_key" ON "attribute_specs"("business_type", "category_key", "key");

-- CreateIndex
CREATE INDEX "districts_region_id_idx" ON "districts"("region_id");

-- CreateIndex
CREATE INDEX "businesses_owner_id_idx" ON "businesses"("owner_id");

-- CreateIndex
CREATE INDEX "businesses_type_idx" ON "businesses"("type");

-- CreateIndex
CREATE INDEX "businesses_status_idx" ON "businesses"("status");

-- CreateIndex
CREATE INDEX "branches_business_id_idx" ON "branches"("business_id");

-- CreateIndex
CREATE INDEX "branches_region_id_district_id_is_active_idx" ON "branches"("region_id", "district_id", "is_active");

-- CreateIndex
CREATE INDEX "listings_business_id_idx" ON "listings"("business_id");

-- CreateIndex
CREATE INDEX "listings_status_idx" ON "listings"("status");

-- CreateIndex
CREATE INDEX "listings_category_key_idx" ON "listings"("category_key");

-- CreateIndex
CREATE INDEX "listings_business_id_status_idx" ON "listings"("business_id", "status");

-- CreateIndex
CREATE INDEX "listings_category_key_status_idx" ON "listings"("category_key", "status");

-- CreateIndex
CREATE INDEX "listings_status_valid_to_idx" ON "listings"("status", "valid_to");

-- CreateIndex
CREATE INDEX "listings_valid_from_valid_to_idx" ON "listings"("valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "listing_branches_branch_id_idx" ON "listing_branches"("branch_id");

-- CreateIndex
CREATE INDEX "option_groups_listing_id_idx" ON "option_groups"("listing_id");

-- CreateIndex
CREATE INDEX "options_group_id_idx" ON "options"("group_id");

-- CreateIndex
CREATE INDEX "redemptions_listing_id_student_id_redeemed_at_idx" ON "redemptions"("listing_id", "student_id", "redeemed_at");

-- CreateIndex
CREATE INDEX "redemptions_student_id_idx" ON "redemptions"("student_id");

-- CreateIndex
CREATE INDEX "redemptions_branch_id_idx" ON "redemptions"("branch_id");

-- AddForeignKey
ALTER TABLE "student_oauth_accounts" ADD CONSTRAINT "student_oauth_accounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_owner_oauth_accounts" ADD CONSTRAINT "business_owner_oauth_accounts_business_owner_id_fkey" FOREIGN KEY ("business_owner_id") REFERENCES "business_owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_refresh_tokens" ADD CONSTRAINT "student_refresh_tokens_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_owner_refresh_tokens" ADD CONSTRAINT "business_owner_refresh_tokens_business_owner_id_fkey" FOREIGN KEY ("business_owner_id") REFERENCES "business_owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_business_type_fkey" FOREIGN KEY ("business_type") REFERENCES "business_types"("type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribute_specs" ADD CONSTRAINT "attribute_specs_business_type_fkey" FOREIGN KEY ("business_type") REFERENCES "business_types"("type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "business_owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_type_fkey" FOREIGN KEY ("type") REFERENCES "business_types"("type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_branches" ADD CONSTRAINT "listing_branches_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_branches" ADD CONSTRAINT "listing_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "options" ADD CONSTRAINT "options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================
-- PostGIS (manual): keep geo_point in sync with lat/lng + spatial/JSONB indexes.
-- ============================================================
CREATE OR REPLACE FUNCTION branches_set_geo_point() RETURNS trigger AS $$
BEGIN
  NEW.geo_point := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER branches_geo_point_biu
  BEFORE INSERT OR UPDATE OF lat, lng ON branches
  FOR EACH ROW EXECUTE FUNCTION branches_set_geo_point();

CREATE INDEX branches_geo_point_gist ON branches USING GIST (geo_point);

CREATE INDEX listings_attributes_gin ON listings USING GIN (attributes jsonb_path_ops);
