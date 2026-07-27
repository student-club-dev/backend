import type { GeoBox } from '../../../common/geo/geo-box';
import { encodeGeohash } from '../../../common/utils/geohash.util';
import type { MapMarker } from '../domain/map-marker.model';
import type { MapCluster } from './search-query.model';

/**
 * Geohash precision per zoom level (§8.2 "map.zoom ga qarab geohash bo'yicha guruhlanadi").
 *
 * A cluster should cover roughly the width of a pin on screen (~80 px), otherwise it either hides
 * distinct places or fails to thin anything out. At Tashkent's latitude one pixel is
 * `156543 / 2^zoom * cos(41°)` metres, so 80 px is ~1.2 km at zoom 13 — and a geohash cell shrinks
 * by ~8× every two characters:
 *
 *   | zoom  | 80 px ≈ | precision | cell     |
 *   |-------|---------|-----------|----------|
 *   | ≤ 5   | ≥ 300 km| 3         | 156 km   |
 *   | 6–8   | 74–18 km| 4         | 39 km    |
 *   | 9–11  | 9–2 km  | 5         | 4.9 km   |
 *   | 12–14 | 2.3–0.6k| 6         | 1.2 km   |
 *   | 15–17 | 290–72 m| 7         | 153 m    |
 *   | ≥ 18  | ≤ 72 m  | 8         | 38 m     |
 *
 * which is exactly `zoom / 3 + 2`, clamped to the precisions that are useful on a city map.
 */
const MIN_PRECISION = 3;
const MAX_PRECISION = 8;

export function clusterPrecision(zoom: number): number {
  const precision = Math.floor(zoom / 3) + 2;
  return Math.min(MAX_PRECISION, Math.max(MIN_PRECISION, precision));
}

/**
 * Folds markers sharing a geohash cell into clusters (§8.2). A cell holding a single marker stays a
 * marker: collapsing it would hide a place the student can already tap.
 *
 * The caller decides WHETHER to cluster (only when `clusterize` is on and the viewport holds more
 * markers than it asked for) and flags `truncated` — this function only groups.
 */
export function clusterMarkers(
  markers: MapMarker[],
  zoom: number,
): { markers: MapMarker[]; clusters: MapCluster[] } {
  const precision = clusterPrecision(zoom);
  const cells = new Map<string, MapMarker[]>();

  for (const marker of markers) {
    const cell = encodeGeohash(marker.lat, marker.lng, precision);
    const members = cells.get(cell);
    if (members === undefined) {
      cells.set(cell, [marker]);
    } else {
      members.push(marker);
    }
  }

  const single: MapMarker[] = [];
  const clusters: MapCluster[] = [];
  for (const members of cells.values()) {
    if (members.length === 1) {
      single.push(...members);
    } else {
      clusters.push(toCluster(members));
    }
  }
  return { markers: single, clusters };
}

/**
 * The extent of what the response actually carries — markers plus the boxes of every cluster — so
 * the client can fit its camera to the answer rather than to what it happened to request.
 */
export function mapBounds(markers: MapMarker[], clusters: MapCluster[]): GeoBox | null {
  const corners: GeoBox[] = [
    ...markers.map((marker) => pointBox(marker)),
    ...clusters.map((cluster) => cluster.bbox),
  ];
  return corners.reduce<GeoBox | null>(
    (bounds, box) => (bounds === null ? box : merge(bounds, box)),
    null,
  );
}

function toCluster(members: MapMarker[]): MapCluster {
  // No seed: a cluster always has members, and seeding with a world-sized box would survive into
  // the response if that ever stopped being true.
  const bbox = members.map(pointBox).reduce(merge);
  const percents = members
    .map((marker) => marker.discountPercent)
    .filter((percent): percent is number => percent !== null);

  return {
    // The centroid, not the cell's centre: a cluster pin should sit on its offers, and an empty
    // half of the cell would otherwise drag it off them.
    lat: average(members.map((marker) => marker.lat)),
    lng: average(members.map((marker) => marker.lng)),
    count: members.length,
    bbox,
    minPrice: Math.min(...members.map((marker) => marker.finalPrice)),
    // Null, not 0, when every member is a regular listing — 0% would read as "a discount of zero".
    maxDiscountPercent: percents.length === 0 ? null : Math.max(...percents),
  };
}

function pointBox(marker: MapMarker): GeoBox {
  return { minLat: marker.lat, minLng: marker.lng, maxLat: marker.lat, maxLng: marker.lng };
}

function merge(a: GeoBox, b: GeoBox): GeoBox {
  return {
    minLat: Math.min(a.minLat, b.minLat),
    minLng: Math.min(a.minLng, b.minLng),
    maxLat: Math.max(a.maxLat, b.maxLat),
    maxLng: Math.max(a.maxLng, b.maxLng),
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
