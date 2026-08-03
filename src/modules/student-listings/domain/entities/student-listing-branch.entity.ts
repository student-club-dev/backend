/**
 * One map pin on a student listing (§2.4).
 *
 * Unlike the business `Branch`, this is not a shared place a listing points at — a student taps a
 * point on the map, so the address exists only for its listing and dies with it. That is why the
 * coordinate is mandatory and there is no id linking anywhere else.
 */
export interface StudentListingBranch {
  id: string;
  lat: number;
  lng: number;
  /** Reverse-geocoded from the coordinate by the client. */
  address: string;
  name: string | null;
  landmark: string | null;
  /** GeoCatalog slugs, e.g. TOSHKENT_SHAHRI / CHILONZOR. Null until the client sends them. */
  regionId: string | null;
  districtId: string | null;
}
