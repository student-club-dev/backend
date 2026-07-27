import { encodeGeohash } from '../../../common/utils/geohash.util';
import type { MapMarker } from '../domain/map-marker.model';
import { clusterMarkers, clusterPrecision, mapBounds } from './marker-cluster.shaper';

function marker(overrides: Partial<MapMarker> = {}): MapMarker {
  return {
    listingId: 'lst_1',
    branchId: 'br_1',
    lat: 41.3,
    lng: 69.24,
    priceLabel: '21k',
    finalPrice: 21000,
    discountBadge: '−30%',
    businessType: 'NATIONAL_FOOD',
    accentColor: '#EA580C',
    isDiscount: true,
    isFavorite: false,
    discountPercent: 30,
    ...overrides,
  };
}

describe('clusterPrecision', () => {
  it('grows with the zoom, so a closer map groups more finely', () => {
    const precisions = [0, 5, 8, 11, 14, 17, 20].map(clusterPrecision);

    expect(precisions).toEqual([...precisions].sort((a, b) => a - b));
  });

  it('picks a cell of roughly a pin width at the zoom levels a city map uses', () => {
    // zoom 13 → ~1.2 km cells, zoom 16 → ~150 m cells.
    expect(clusterPrecision(13)).toBe(6);
    expect(clusterPrecision(16)).toBe(7);
  });

  it('clamps: a world view still groups, a street view never splits into metres', () => {
    expect(clusterPrecision(0)).toBe(3);
    expect(clusterPrecision(22)).toBe(8);
  });
});

describe('clusterMarkers', () => {
  it('folds markers sharing a cell and leaves lone ones alone', () => {
    const near = [
      marker({ branchId: 'br_1', lat: 41.3, lng: 69.24 }),
      marker({ branchId: 'br_2', lat: 41.3001, lng: 69.2401 }),
    ];
    const far = marker({ branchId: 'br_3', lat: 41.34, lng: 69.31 });
    // Guard the fixture itself: the pair must actually share a cell at this zoom.
    expect(encodeGeohash(near[0].lat, near[0].lng, clusterPrecision(13))).toBe(
      encodeGeohash(near[1].lat, near[1].lng, clusterPrecision(13)),
    );

    const result = clusterMarkers([...near, far], 13);

    expect(result.markers).toEqual([far]);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]).toMatchObject({ count: 2 });
  });

  it('aggregates what the cluster pin prints', () => {
    const markers = [
      marker({ lat: 41.3, lng: 69.24, finalPrice: 30000, discountPercent: 10 }),
      marker({
        branchId: 'br_2',
        lat: 41.3002,
        lng: 69.2402,
        finalPrice: 15000,
        discountPercent: 45,
      }),
    ];

    const [cluster] = clusterMarkers(markers, 13).clusters;

    expect(cluster).toMatchObject({ count: 2, minPrice: 15000, maxDiscountPercent: 45 });
    // The centroid sits between its members, and the box holds them both.
    expect(cluster.lat).toBeCloseTo(41.3001, 4);
    expect(cluster.bbox).toEqual({
      minLat: 41.3,
      minLng: 69.24,
      maxLat: 41.3002,
      maxLng: 69.2402,
    });
  });

  it('reports no discount percent when every member is a regular listing (Q0)', () => {
    const markers = [
      marker({ isDiscount: false, discountPercent: null }),
      marker({
        branchId: 'br_2',
        lat: 41.3001,
        lng: 69.2401,
        isDiscount: false,
        discountPercent: null,
      }),
    ];

    const [cluster] = clusterMarkers(markers, 13).clusters;

    expect(cluster.maxDiscountPercent).toBeNull();
  });

  it('splits the same pair once the map is zoomed in far enough to tell them apart', () => {
    const markers = [
      marker({ lat: 41.3, lng: 69.24 }),
      marker({ branchId: 'br_2', lat: 41.3009, lng: 69.2409 }),
    ];

    expect(clusterMarkers(markers, 13).clusters).toHaveLength(1);
    expect(clusterMarkers(markers, 21).clusters).toHaveLength(0);
  });

  it('drops nothing: every marker ends up either on the map or inside a cluster', () => {
    const markers = Array.from({ length: 20 }, (_, index) =>
      marker({ branchId: `br_${index}`, lat: 41.3 + index * 0.0005, lng: 69.24 }),
    );

    const { markers: single, clusters } = clusterMarkers(markers, 13);
    const covered = single.length + clusters.reduce((sum, cluster) => sum + cluster.count, 0);

    expect(covered).toBe(markers.length);
  });
});

describe('mapBounds', () => {
  it('spans markers and clusters alike', () => {
    const markers = [marker({ lat: 41.3, lng: 69.24 })];
    const clusters = clusterMarkers(
      [
        marker({ lat: 41.34, lng: 69.31 }),
        marker({ branchId: 'br_2', lat: 41.3401, lng: 69.3101 }),
      ],
      13,
    ).clusters;

    expect(mapBounds(markers, clusters)).toEqual({
      minLat: 41.3,
      minLng: 69.24,
      maxLat: 41.3401,
      maxLng: 69.3101,
    });
  });

  it('is null when there is nothing to fit the camera to', () => {
    expect(mapBounds([], [])).toBeNull();
  });
});
