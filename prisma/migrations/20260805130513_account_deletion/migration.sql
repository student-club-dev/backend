-- AlterTable
ALTER TABLE "business_owners" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_reason" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_reason" TEXT;
