-- CreateEnum
CREATE TYPE "TradeCenterStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TradeCenterFieldType" AS ENUM ('TEXT', 'NUMBER');

-- DropIndex
DROP INDEX "branches_geo_point_gist";

-- DropIndex
DROP INDEX "listings_attributes_gin";

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "trade_center_id" TEXT;

-- CreateTable
CREATE TABLE "trade_centers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TradeCenterStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_center_fields" (
    "id" TEXT NOT NULL,
    "trade_center_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "TradeCenterFieldType" NOT NULL DEFAULT 'TEXT',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "trade_center_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_trade_center_field_values" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "branch_trade_center_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trade_centers_slug_key" ON "trade_centers"("slug");

-- CreateIndex
CREATE INDEX "trade_centers_status_sort_order_idx" ON "trade_centers"("status", "sort_order");

-- CreateIndex
CREATE INDEX "trade_center_fields_trade_center_id_sort_order_idx" ON "trade_center_fields"("trade_center_id", "sort_order");

-- CreateIndex
CREATE INDEX "branch_trade_center_field_values_field_id_idx" ON "branch_trade_center_field_values"("field_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_trade_center_field_values_branch_id_field_id_key" ON "branch_trade_center_field_values"("branch_id", "field_id");

-- CreateIndex
CREATE INDEX "branches_trade_center_id_idx" ON "branches"("trade_center_id");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_trade_center_id_fkey" FOREIGN KEY ("trade_center_id") REFERENCES "trade_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_center_fields" ADD CONSTRAINT "trade_center_fields_trade_center_id_fkey" FOREIGN KEY ("trade_center_id") REFERENCES "trade_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_trade_center_field_values" ADD CONSTRAINT "branch_trade_center_field_values_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_trade_center_field_values" ADD CONSTRAINT "branch_trade_center_field_values_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "trade_center_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
