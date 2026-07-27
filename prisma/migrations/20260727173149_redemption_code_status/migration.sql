-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED');

-- AlterTable
ALTER TABLE "redemptions" ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "redeemed_at" DROP NOT NULL,
ALTER COLUMN "redeemed_at" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_code_key" ON "redemptions"("code");

