-- CreateTable
CREATE TABLE "catalog_groups" (
    "key" TEXT NOT NULL,
    "name_uz" TEXT NOT NULL,
    "name_ru" TEXT,
    "emoji" TEXT,
    "icon" TEXT,
    "accent_color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_groups_pkey" PRIMARY KEY ("key")
);

-- Seed the 8 groups (STUDENT_FEED.md, Ilova). The seed script keeps these in sync afterwards.
INSERT INTO "catalog_groups" ("key", "name_uz", "emoji", "icon", "accent_color", "sort_order", "updated_at") VALUES
  ('FOOD',          'Ovqatlanish',           '🍽', 'cafe',    '#F97316', 1, CURRENT_TIMESTAMP),
  ('SPORT',         'Sport',                 '⚽', 'ball',    '#16A34A', 2, CURRENT_TIMESTAMP),
  ('GAMES',         'O''yin va bo''sh vaqt', '🎮', 'gamepad', '#7C5CFF', 3, CURRENT_TIMESTAMP),
  ('ENTERTAINMENT', 'Ko''ngilochar',         '🎬', 'camera',  '#EF4444', 4, CURRENT_TIMESTAMP),
  ('EDUCATION',     'Ta''lim',               '📚', 'book',    '#3B82F6', 5, CURRENT_TIMESTAMP),
  ('BEAUTY',        'Go''zallik',            '💇', 'star',    '#EC4899', 6, CURRENT_TIMESTAMP),
  ('SHOPPING',      'Savdo va xizmat',       '🛍', 'cart',    '#06B6D4', 7, CURRENT_TIMESTAMP),
  ('HOUSING',       'Ijara',                 '🏠', 'home',    '#14B8A6', 8, CURRENT_TIMESTAMP);

-- AlterTable: add nullable, backfill, then enforce NOT NULL (27 rows already exist).
ALTER TABLE "business_types" ADD COLUMN "group_key" TEXT;

UPDATE "business_types" SET "group_key" = CASE "type"
  WHEN 'NATIONAL_FOOD'      THEN 'FOOD'
  WHEN 'FAST_FOOD'          THEN 'FOOD'
  WHEN 'SOMSA'              THEN 'FOOD'
  WHEN 'TENNIS'             THEN 'SPORT'
  WHEN 'TABLE_TENNIS'       THEN 'SPORT'
  WHEN 'FOOTBALL_FIELD'     THEN 'SPORT'
  WHEN 'FOOTBALL_TRAINING'  THEN 'SPORT'
  WHEN 'BASKETBALL'         THEN 'SPORT'
  WHEN 'VOLLEYBALL'         THEN 'SPORT'
  WHEN 'SWIMMING_POOL'      THEN 'SPORT'
  WHEN 'FITNESS'            THEN 'SPORT'
  WHEN 'BOXING'             THEN 'SPORT'
  WHEN 'WRESTLING_MMA'      THEN 'SPORT'
  WHEN 'PLAYSTATION'        THEN 'GAMES'
  WHEN 'CYBER_CLUB'         THEN 'GAMES'
  WHEN 'BOWLING'            THEN 'GAMES'
  WHEN 'BILLIARDS'          THEN 'GAMES'
  WHEN 'CINEMA'             THEN 'ENTERTAINMENT'
  WHEN 'KARAOKE'            THEN 'ENTERTAINMENT'
  WHEN 'EDUCATION_CENTER'   THEN 'EDUCATION'
  WHEN 'LIBRARY'            THEN 'EDUCATION'
  WHEN 'TUTOR'              THEN 'EDUCATION'
  WHEN 'BARBERSHOP'         THEN 'BEAUTY'
  WHEN 'BEAUTY_SALON'       THEN 'BEAUTY'
  WHEN 'CLOTHING'           THEN 'SHOPPING'
  WHEN 'PRINTING'           THEN 'SHOPPING'
  WHEN 'RENTAL_HOUSE'       THEN 'HOUSING'
  ELSE 'SHOPPING'
END;

ALTER TABLE "business_types" ALTER COLUMN "group_key" SET NOT NULL;

-- CreateIndex
CREATE INDEX "business_types_group_key_idx" ON "business_types"("group_key");

-- AddForeignKey
ALTER TABLE "business_types" ADD CONSTRAINT "business_types_group_key_fkey"
  FOREIGN KEY ("group_key") REFERENCES "catalog_groups"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
