-- Restore the two raw-SQL indexes that `prisma migrate dev` dropped while adding the
-- trade-centers tables. Prisma does not model these (geo_point is an Unsupported type and
-- attributes is JSONB), so it emits DROP INDEX for them on every migrate; they must be
-- re-created here. Definitions match the init migration (20260720050004_init).
-- IF NOT EXISTS keeps this idempotent and safe to re-run.

-- proximity index for ST_DWithin / ST_Distance (GET /discounts)
CREATE INDEX IF NOT EXISTS branches_geo_point_gist ON branches USING GIST (geo_point);

-- JSONB attribute filters ("only halal", etc.)
CREATE INDEX IF NOT EXISTS listings_attributes_gin ON listings USING GIN (attributes jsonb_path_ops);
