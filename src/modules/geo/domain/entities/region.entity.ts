/**
 * An Uzbekistan region (viloyat / city). Pure domain type — the presentation layer
 * projects it to RegionDto and the infrastructure layer maps it from the Prisma row.
 */
export interface Region {
  id: string;
  nameUz: string;
  nameRu: string | null;
  centerLat: number | null;
  centerLng: number | null;
}
