/**
 * A Tashkent metro station. Reference data — the branch form autocompletes `metroStation` from this
 * list, and reverse-geocoding reports the nearest one as a landmark.
 */
export interface MetroStation {
  id: string;
  nameUz: string;
  nameRu: string | null;
  /** Line slug (`CHILONZOR`, `OZBEKISTON`, `YUNUSOBOD`, `HALQA`) — group by this, not by name. */
  line: string;
  lat: number;
  lng: number;
}
