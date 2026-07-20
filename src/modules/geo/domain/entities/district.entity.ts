/**
 * An Uzbekistan district (tuman), belonging to a region. Pure domain type — the
 * presentation layer projects it to DistrictDto and the infrastructure layer maps it
 * from the Prisma row.
 */
export interface District {
  id: string;
  regionId: string;
  nameUz: string;
  nameRu: string | null;
  centerLat: number | null;
  centerLng: number | null;
}
