-- Telefoni tasdiqlanmagan hisoblar auditi
--
-- Nima uchun: `register` OTP so'ramas edi, ya'ni istalgan raqam bilan hisob yaratish mumkin edi.
-- `phone_number` @unique bo'lgani uchun bunday qator o'sha raqamning HAQIQIY EGASINI ro'yxatdan
-- o'tishdan butunlay to'sib qo'yadi.
--
-- Bu so'rov hech narsani o'zgartirmaydi — faqat ko'rsatadi. Qaror sizniki.
--
-- Ishlatish:
--   docker compose exec -T db psql -U elonuz -d elonuz -f - < docs/ops/unverified-phone-audit.sql

\echo '=== 1. Umumiy manzara ==='

SELECT 'students' AS tbl,
       COUNT(*)                                                                  AS total,
       COUNT(*) FILTER (WHERE phone_number IS NOT NULL)                          AS with_phone,
       COUNT(*) FILTER (WHERE phone_number IS NOT NULL AND NOT phone_verified)   AS unverified
FROM students
UNION ALL
SELECT 'business_owners',
       COUNT(*),
       COUNT(*) FILTER (WHERE phone_number IS NOT NULL),
       COUNT(*) FILTER (WHERE phone_number IS NOT NULL AND NOT phone_verified)
FROM business_owners;

\echo ''
\echo '=== 2. Talabalar: tasdiqlanmagan raqam + faoliyat bormi? ==='
\echo '    faoliyati YO`Q qatorlar — band qilingan raqamlar, egasi kira olmaydi.'

SELECT s.id,
       s.phone_number,
       s.email,
       s.created_at::date AS created,
       (SELECT COUNT(*) FROM messages m           WHERE m.sender_id = s.id) AS messages,
       (SELECT COUNT(*) FROM student_listings l   WHERE l.owner_id  = s.id) AS listings,
       (SELECT COUNT(*) FROM conversation_members c WHERE c.student_id = s.id) AS conversations
FROM students s
WHERE s.phone_number IS NOT NULL
  AND NOT s.phone_verified
ORDER BY s.created_at
LIMIT 200;

\echo ''
\echo '=== 3. Biznes egalari: tasdiqlanmagan raqam + biznesi bormi? ==='

SELECT o.id,
       o.phone_number,
       o.email,
       o.created_at::date AS created,
       (SELECT COUNT(*) FROM businesses b WHERE b.owner_id = o.id) AS businesses
FROM business_owners o
WHERE o.phone_number IS NOT NULL
  AND NOT o.phone_verified
ORDER BY o.created_at
LIMIT 200;

\echo ''
\echo '=== 4. Bitta raqamga bir nechta urinish bo`lganmi (squat belgisi) ==='
\echo '    Bir xil prefiks ostida ketma-ket yaratilgan hisoblar skript izini bildiradi.'

SELECT created_at::date AS day, COUNT(*) AS accounts_created
FROM students
WHERE phone_number IS NOT NULL AND NOT phone_verified
GROUP BY 1
HAVING COUNT(*) > 5
ORDER BY 1 DESC;
