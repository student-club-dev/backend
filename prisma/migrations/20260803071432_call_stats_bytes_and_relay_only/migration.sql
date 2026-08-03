-- AlterTable
ALTER TABLE "call_stats" ADD COLUMN     "bytes_received" BIGINT,
ADD COLUMN     "bytes_sent" BIGINT;

-- AlterTable
ALTER TABLE "calls" ADD COLUMN     "relay_only" BOOLEAN NOT NULL DEFAULT false;
