-- ============================================================================
-- Fix media URLs stored with the placeholder domain during the PUBLIC_MEDIA_BASE_URL
-- misconfiguration (`https://<sening-domening>/uploads/...`). Replaces the placeholder host
-- with the real public host; the /uploads/... path is preserved.
--
-- SAFE: idempotent (touches only rows containing the placeholder) and wrapped in a transaction
-- with a pre-check and a post-verify. Review the printed counts, then COMMIT (or ROLLBACK).
--
-- Run:  psql "$DATABASE_URL" -f fix-media-urls.sql
-- Adjust :old_base / :new_base below if your domain differs.
-- ============================================================================

\set old_base 'https://<sening-domening>'
\set new_base 'https://api.studentclub.uz'

BEGIN;

-- 1) Pre-check — how many rows will change
SELECT 'students.avatar_url'         AS target, count(*) FROM students        WHERE avatar_url LIKE '%' || :'old_base' || '%'
UNION ALL SELECT 'business_owners.avatar_url', count(*) FROM business_owners  WHERE avatar_url LIKE '%' || :'old_base' || '%'
UNION ALL SELECT 'businesses.logo_url',        count(*) FROM businesses       WHERE logo_url   LIKE '%' || :'old_base' || '%'
UNION ALL SELECT 'businesses.cover_url',       count(*) FROM businesses       WHERE cover_url  LIKE '%' || :'old_base' || '%'
UNION ALL SELECT 'listings.images',            count(*) FROM listings         WHERE array_to_string(images, ',') LIKE '%' || :'old_base' || '%';

-- 2) Apply
UPDATE students        SET avatar_url = replace(avatar_url, :'old_base', :'new_base')
  WHERE avatar_url LIKE '%' || :'old_base' || '%';

UPDATE business_owners SET avatar_url = replace(avatar_url, :'old_base', :'new_base')
  WHERE avatar_url LIKE '%' || :'old_base' || '%';

UPDATE businesses      SET logo_url = replace(logo_url, :'old_base', :'new_base')
  WHERE logo_url LIKE '%' || :'old_base' || '%';

UPDATE businesses      SET cover_url = replace(cover_url, :'old_base', :'new_base')
  WHERE cover_url LIKE '%' || :'old_base' || '%';

UPDATE listings        SET images = ARRAY(
    SELECT replace(img, :'old_base', :'new_base') FROM unnest(images) AS img
  )
  WHERE array_to_string(images, ',') LIKE '%' || :'old_base' || '%';

-- 3) Verify — every count below MUST be 0
SELECT 'REMAINING students.avatar_url'         AS check, count(*) FROM students        WHERE avatar_url LIKE '%' || :'old_base' || '%'
UNION ALL SELECT 'REMAINING business_owners.avatar_url', count(*) FROM business_owners  WHERE avatar_url LIKE '%' || :'old_base' || '%'
UNION ALL SELECT 'REMAINING businesses.logo_url',        count(*) FROM businesses       WHERE logo_url   LIKE '%' || :'old_base' || '%'
UNION ALL SELECT 'REMAINING businesses.cover_url',       count(*) FROM businesses       WHERE cover_url  LIKE '%' || :'old_base' || '%'
UNION ALL SELECT 'REMAINING listings.images',            count(*) FROM listings         WHERE array_to_string(images, ',') LIKE '%' || :'old_base' || '%';

-- Counts look right? Finish with:
COMMIT;
-- Something off? Undo with:  ROLLBACK;
