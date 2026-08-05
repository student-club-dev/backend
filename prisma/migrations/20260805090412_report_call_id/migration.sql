-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "call_id" TEXT;

-- CreateIndex
CREATE INDEX "reports_call_id_idx" ON "reports"("call_id");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
