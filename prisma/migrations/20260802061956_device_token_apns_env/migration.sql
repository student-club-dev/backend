-- CreateEnum
CREATE TYPE "ApnsEnvironment" AS ENUM ('PRODUCTION', 'SANDBOX');

-- AlterTable
ALTER TABLE "device_tokens" ADD COLUMN     "apns_env" "ApnsEnvironment",
ADD COLUMN     "last_success_at" TIMESTAMP(3);
