-- AlterEnum
-- KLIPY replaces Tenor as the GIF provider (the Tenor API shut down on 30 June 2026). TENOR is left
-- in place: existing rows still reference it, and dropping an enum value would fail on them.
ALTER TYPE "MediaProvider" ADD VALUE IF NOT EXISTS 'KLIPY';
