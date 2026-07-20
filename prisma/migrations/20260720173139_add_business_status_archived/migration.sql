-- Add ARCHIVED to BusinessStatus (soft-delete for Business, matching ListingStatus).
-- NOTE: the manual PostGIS/GIN indexes (branches_geo_point_gist, listings_attributes_gin) live
-- OUTSIDE the Prisma schema; `prisma migrate diff` will keep suggesting they be dropped — never do.
ALTER TYPE "BusinessStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
