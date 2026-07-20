import { District } from './entities/district.entity';
import { Region } from './entities/region.entity';

/** Injection token for the geo repository port (bound to the Prisma impl in the module). */
export const GEO_REPOSITORY = Symbol('GEO_REPOSITORY');

/**
 * Geo data-access port (regions & districts reference data). The application layer depends
 * on this interface only; the Prisma implementation lives in the infrastructure layer.
 */
export interface GeoRepository {
  /** All regions, ordered by nameUz. */
  findRegions(): Promise<Region[]>;

  /** All districts (unfiltered), ordered by nameUz. */
  findDistricts(): Promise<District[]>;

  /** Districts of a single region, ordered by nameUz. */
  findDistrictsByRegion(regionId: string): Promise<District[]>;

  /** Whether a region with this id exists. */
  regionExists(regionId: string): Promise<boolean>;
}
