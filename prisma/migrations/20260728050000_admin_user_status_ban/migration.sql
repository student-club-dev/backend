-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'BANNED', 'DELETED');

-- CreateEnum
CREATE TYPE "BusinessOwnerStatus" AS ENUM ('ACTIVE', 'BANNED', 'DELETED');

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "banned_at" TIMESTAMP(3),
ADD COLUMN     "ban_reason" TEXT;

-- AlterTable
ALTER TABLE "business_owners" ADD COLUMN     "status" "BusinessOwnerStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "banned_at" TIMESTAMP(3),
ADD COLUMN     "ban_reason" TEXT;

-- CreateIndex
CREATE INDEX "students_status_idx" ON "students"("status");

-- CreateIndex
CREATE INDEX "business_owners_status_idx" ON "business_owners"("status");
