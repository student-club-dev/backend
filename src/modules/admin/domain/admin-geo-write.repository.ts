import { District } from '../../geo/domain/entities/district.entity';
import { Region } from '../../geo/domain/entities/region.entity';

/** Injection token for the admin geo write port (bound to the Prisma impl in the module). */
export const ADMIN_GEO_WRITE_REPOSITORY = Symbol('ADMIN_GEO_WRITE_REPOSITORY');

/** Writable fields of a region (`id` — the string PK — is passed separately on create). */
export interface RegionWrite {
  nameUz: string;
  nameRu: string | null;
  centerLat: number | null;
  centerLng: number | null;
}

/** Writable fields of a district (`id` — the string PK — is passed separately on create). */
export interface DistrictWrite {
  regionId: string;
  nameUz: string;
  nameRu: string | null;
  centerLat: number | null;
  centerLng: number | null;
}

/**
 * Unscoped write access to the `regions` / `districts` reference tables for the admin panel. Mirrors
 * the geo module's single reference-data repository (one port for both aggregates). Prisma-backed.
 */
export interface AdminGeoWriteRepository {
  // -- regions --------------------------------------------------------------
  /** The region with this id, or `null` when it does not exist. */
  findRegionById(id: string): Promise<Region | null>;

  /** Inserts a region and returns it. Caller ensures the id is free. */
  createRegion(id: string, data: RegionWrite): Promise<Region>;

  /** Updates a region (only the present keys). Caller ensures it exists. */
  updateRegion(id: string, data: Partial<RegionWrite>): Promise<Region>;

  /** Deletes a region. Caller ensures nothing references it. */
  deleteRegion(id: string): Promise<void>;

  /** Number of districts belonging to this region (delete guard). */
  countDistrictsInRegion(id: string): Promise<number>;

  /** Number of branches located in this region (delete guard). */
  countBranchesInRegion(id: string): Promise<number>;

  // -- districts ------------------------------------------------------------
  /** The district with this id, or `null` when it does not exist. */
  findDistrictById(id: string): Promise<District | null>;

  /** Inserts a district and returns it. Caller ensures the id is free and the region exists. */
  createDistrict(id: string, data: DistrictWrite): Promise<District>;

  /** Updates a district (only the present keys). Caller ensures it exists (and the region, if moved). */
  updateDistrict(id: string, data: Partial<DistrictWrite>): Promise<District>;

  /** Deletes a district. Caller ensures nothing references it. */
  deleteDistrict(id: string): Promise<void>;

  /** Number of branches located in this district (delete guard). */
  countBranchesInDistrict(id: string): Promise<number>;
}
