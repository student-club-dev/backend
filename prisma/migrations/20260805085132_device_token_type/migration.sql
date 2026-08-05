-- CreateEnum
CREATE TYPE "DeviceTokenType" AS ENUM ('FCM', 'APNS', 'APNS_VOIP');

-- AlterTable
ALTER TABLE "device_tokens" ADD COLUMN     "token_type" "DeviceTokenType" NOT NULL DEFAULT 'FCM';

-- Backfill: the column default is FCM, which is wrong for every row already in the table for an
-- iPhone. Those hold raw APNs device tokens — `POST /v1/devices` has rejected anything else for
-- iOS since the APNs work — and they are already delivered through Apple, not Firebase.
--
-- Without this line they would be labelled FCM, and the moment sends start filtering on
-- `token_type` every existing iOS device would stop receiving notifications, silently. There is no
-- VoIP row to backfill: PushKit tokens have never been registered before this migration.
UPDATE "device_tokens" SET "token_type" = 'APNS' WHERE "platform" = 'IOS';

-- CreateIndex
CREATE INDEX "device_tokens_student_id_token_type_idx" ON "device_tokens"("student_id", "token_type");
