-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('JOB', 'DISCOUNT', 'LISTING', 'CHAT', 'CONNECTION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationTargetType" AS ENUM ('CHAT', 'LISTING', 'CONNECTION_REQUESTS', 'MY_LISTINGS', 'PROFILE');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(300),
    "target_type" "NotificationTargetType",
    "target_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_student_id_created_at_id_idx" ON "notifications"("student_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "notifications_student_id_read_at_idx" ON "notifications"("student_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
