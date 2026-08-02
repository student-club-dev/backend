-- Bu faylda ikki turdagi qulf bor — tartib ataylab shunga qarab tuzilgan: arzonrog'i avval,
-- qimmatrog'i oxirida. `calls`/`call_stats`ga FOREIGN KEY qo'shish `conversations` va
-- `students`ga SHARE ROW EXCLUSIVE qulf qo'yadi (faqat yozishni to'sadi, o'qishni emas) — ikkovi
-- ham yangi, hali bo'sh jadvallarni tekshiradi, shuning uchun tez bajariladi. `messages`ga ustun
-- qo'shish (fayl OXIRIDA, FK'lardan keyin) esa ACCESS EXCLUSIVE qulf qo'yadi — hatto o'qishni
-- ham to'sadi, va bu chatning eng issiq jadvali. Shu sabab u oxirga qoldirilgan: FK
-- qulflaridan biri 3 soniyada olinmasa, tranzaksiya `messages`ga tegmasdanoq bekor bo'ladi.
-- `migrate deploy` ilova nusxalari trafik qabul qilib turganda ishlaydi, ya'ni qulf 3 soniyada
-- olinmasa migratsiya tez tushsin va qayta urinilsin — chatni to'xtatib turgandan yaxshi.
SET lock_timeout = '3s';

-- CreateEnum
CREATE TYPE "CallMedia" AS ENUM ('AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'CONNECTING', 'ACTIVE', 'ENDED', 'MISSED', 'DECLINED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CallEndReason" AS ENUM ('HANGUP', 'TIMEOUT', 'DECLINED', 'BUSY', 'FAILED', 'CANCELED', 'UNAUTHORIZED');

-- CreateEnum
CREATE TYPE "CallParty" AS ENUM ('CALLER', 'CALLEE');

-- CreateEnum
CREATE TYPE "IceCandidateType" AS ENUM ('HOST', 'SRFLX', 'RELAY');

-- PG16'da tranzaksiya ichida xavfsiz: yangi qiymat SHU tranzaksiyada ishlatilmaydi.
-- ⚠️ QAYTARIB BO'LMAYDI — PostgreSQL enum qiymatini o'chira olmaydi, bu migratsiyaning
-- rollback'i yo'q.
-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'CALL';

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "caller_id" TEXT NOT NULL,
    "callee_id" TEXT NOT NULL,
    "media" "CallMedia" NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "end_reason" "CallEndReason",
    "ended_by" "CallParty",
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_stats" (
    "call_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "rtt_ms" INTEGER,
    "packets_lost" INTEGER,
    "packets_received" INTEGER,
    "jitter_ms" INTEGER,
    "candidate_type" "IceCandidateType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_stats_pkey" PRIMARY KEY ("call_id","student_id")
);

-- CreateIndex
CREATE INDEX "calls_caller_id_started_at_idx" ON "calls"("caller_id", "started_at");

-- CreateIndex
CREATE INDEX "calls_callee_id_started_at_idx" ON "calls"("callee_id", "started_at");

-- CreateIndex
CREATE INDEX "calls_conversation_id_idx" ON "calls"("conversation_id");

-- CreateIndex
CREATE INDEX "calls_status_started_at_idx" ON "calls"("status", "started_at");

-- CreateIndex
CREATE INDEX "call_stats_student_id_idx" ON "call_stats"("student_id");

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_callee_id_fkey" FOREIGN KEY ("callee_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_stats" ADD CONSTRAINT "call_stats_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_stats" ADD CONSTRAINT "call_stats_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "call_duration_ms" INTEGER,
ADD COLUMN     "call_end_reason" "CallEndReason",
ADD COLUMN     "call_id" TEXT,
ADD COLUMN     "call_media" "CallMedia",
ADD COLUMN     "call_status" "CallStatus";
