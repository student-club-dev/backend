-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "client_msg_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "messages_sender_id_client_msg_id_key" ON "messages"("sender_id", "client_msg_id");

