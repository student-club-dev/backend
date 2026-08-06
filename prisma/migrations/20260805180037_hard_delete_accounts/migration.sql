/*
  Warnings:

  - You are about to drop the column `deleted_at` on the `business_owners` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_reason` on the `business_owners` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `students` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_reason` on the `students` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "business_owners" DROP COLUMN "deleted_at",
DROP COLUMN "deleted_reason";

-- AlterTable
ALTER TABLE "students" DROP COLUMN "deleted_at",
DROP COLUMN "deleted_reason";
