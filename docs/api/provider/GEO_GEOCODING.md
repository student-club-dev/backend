# Geo Geocoding (Manzil ↔ koordinata) — Design

> Status: **approved, ready to implement** · Date: 2026-07-21 · Level: 1
> Contract impact: the two endpoints below **are already in `elon-uz.json`** — do not change it.
> Adds forward/reverse geocoding to the existing `geo` module (regions/districts already shipped).

## 1. Scope (Level-1)

Exactly two operations, both **proxied to Yandex Geocoder** so the API key never reaches the client:

- **`POST /v1/geo/geocode`** → `200 GeocodeResultDto[]` — free-text address → candidate coordinates, best
  confidence first. No matches → `200 []`.
- **`POST /v1/geo/reverse-geocode`** → `200 ReverseGeocodeResponseDto` — coordinates → address + our
  region/district. Outside Uzbekistan → `422 LOCATION_OUT_OF_BOUNDS`.

Both are used by the **business-owner branch form** (address search + map-pick autofill).

**Explicitly not here (Level-2 / follow-ups):** response caching (design is cache-ready — §4), a live
`nearestMetro` lookup (returns `null` now — §7), and per-user rate limiting.

## 2. Contract (source of truth: `elon-uz.json`)

- `GeocodeRequestDto` — required `query`; optional `regionId` (restrict the search to a region).
- `GeocodeResultDto` — required `lat, lng, formattedAddress`; optional `regionId, districtId,
  confidence` (0..1).
- `ReverseGeocodeRequestDto` — required `lat, lng`.
- `ReverseGeocodeResponseDto` — all optional/nullable: `regionId, districtId, address, nearestMetro`.

DTOs mirror the spec 1:1. `confidence` is `number | null`; coordinates are doubles.

## 3. Architecture — provider port + our-data enrichment

```
GeocodeController → GeocodingService → GeocoderPort → YandexGeocoderAdapter | DevGeocoderAdapter
                          │
                          └── GEO_REPOSITORY (our regions/districts) for region/district resolution
```

Two responsibilities, deliberately separated so the paid/slow part is isolated and cacheable:

- **`GeocoderPort` (domain)** — *pure provider access only*. `geocode(query)` → candidate matches;
  `reverseGeocode(lat, lng)` → a formatted address. It knows nothing about our regions/districts,
  our bounds, or `nearestMetro`. Same input → same output, no side effects, plain-serializable
  returns. Bound to a concrete adapter via the `GEOCODER` token (mirrors the SMS provider pattern).
- **`GeocodingService` (application)** — orchestration and *our-data* logic: bounds check, region
  restriction, and resolving our `regionId`/`districtId` from coordinates. Depends on the `GEOCODER`
  token and `GEO_REPOSITORY` only.

**Provider selection (mirrors `SMS_PROVIDER`):** a `geocoderFactory` picks the adapter from
`GEOCODER_PROVIDER` (`dev` | `yandex`). `dev` returns empty matches / null address so the app boots
and tests run **without a key**; `yandex` requires `YANDEX_GEOCODER_API_KEY` (a request fails with
`GEOCODER_UNAVAILABLE` if it is missing, the way the Eskiz SMS provider checks its credentials at
send-time). Adapter uses **Node 20 native `fetch`** — no new dependency.

## 4. Cache-readiness (design now, implement later)

The `Controller → GeocodingService → (Cache) → GeocoderPort → Adapter` seam is honoured **without
writing any cache today**. Because `GeocodingService` depends on the `GEOCODER` *token*, caching is
added later as a **decorator**:

```ts
// FUTURE — no change to GeocodingService or the controller:
class CachingGeocoderDecorator implements GeocoderPort {
  constructor(private inner: GeocoderPort, private cache: Cache) {}
  // check cache → miss → this.inner.geocode(query) → store → return
}
// module binding changes from  { provide: GEOCODER, useFactory: geocoderFactory }
//                        to a decorator wrapping the factory-built adapter.
```

Enabling constraints, all satisfied by this design:

- The port is **pure and idempotent**, so a wrapped result is always safe to replay.
- We cache the **provider call** (the Yandex round-trip), **not** the downstream region/district
  enrichment (cheap local compute that re-runs on a cache hit) — exactly where the cache line is drawn.
- **Defined cache keys** for the future decorator: `geocode:<normalized query>` (trim, lower-case,
  collapse internal whitespace) and `reverse:<lat.toFixed(5)>,<lng.toFixed(5)>` (~1 m). Rounding
  affects the key only; geocoding is approximate by contract, so near-identical requests dedupe.

## 5. Region / district resolution — **our data, not the provider's**

We never trust Yandex's admin-area names. Both endpoints resolve `regionId`/`districtId` from
coordinates against **our own** dataset, so a geocoded point resolves to the *same* district the
Branch module validates against:

- `resolveRegionDistrict(lat, lng)` → find the **nearest district by centre** (`centerLat/centerLng`
  via the existing `haversineMeters` util); its `regionId` is the region. Districts with a null centre
  are skipped. Resolution is advisory (the app confirms on the map), so it returns the nearest match;
  `{ regionId: null, districtId: null }` only if we have no district centres at all.
- **Forward geocode** — for each Yandex match, resolve region/district from the match's coordinates.
  If the request carried `regionId`, it is validated (`regionExists`; unknown → `422
  VALIDATION_ERROR`), used to bias the query text sent to the port, and results are **filtered** to
  that region.
- **Reverse geocode** — resolve region/district from the requested coordinates; the port supplies only
  the `address` string.

## 6. Bounds & validation

- The Uzbekistan bounding box (`lat 37..46`, `lng 55..74`) currently lives as **private constants in
  `branches.service.ts`**. Extract it to a shared `common/geo/uzbekistan-bounds.ts`
  (`isWithinUzbekistan(lat, lng)` + exported constants) and reuse it in both places — one source of
  truth. Refactor is the single bbox call site in branches; its other constants stay local.
- **Reverse geocode:** coordinates outside the box → `422 LOCATION_OUT_OF_BOUNDS` **before** any
  provider call.
- Request DTOs validate `lat`/`lng` as finite numbers and `query` as a non-empty string
  (class-validator).

## 7. `nearestMetro` — `null` for Level-1

Returned as `null`. The contract allows it, only Tashkent has a metro, and a live lookup would need a
second paid Yandex request. Deferred; the port can expose it later without changing callers.

## 8. Error handling

- Forward geocode, no matches → `200 []`.
- Reverse geocode, in-bounds but the provider has no address → best-effort
  `{ regionId, districtId (ours), address: null, nearestMetro: null }`.
- Provider transport error / timeout / non-200 → `503 GEOCODER_UNAVAILABLE` (client may retry). The
  adapter maps provider failures to this; the service does not swallow it.
- Out of bounds (reverse) → `422 LOCATION_OUT_OF_BOUNDS`.

## 9. Config (env, validated in `config/env.ts`)

```
GEOCODER_PROVIDER      = dev | yandex            (default: dev)
YANDEX_GEOCODER_API_KEY = <string>               (optional; required when provider = yandex)
YANDEX_GEOCODER_BASE_URL = https://geocode-maps.yandex.ru/1.x   (default)
```

## 10. Module structure (`src/modules/geo/`, extends the existing module)

```
domain/geocoder.port.ts                 GEOCODER token, GeocoderPort, GeocoderMatch, GeocoderReverseResult
application/geocoding.service.ts         bounds + region/district resolution + region filter
infrastructure/geocoding/
  yandex-geocoder.adapter.ts             native fetch → Yandex; maps failures to GEOCODER_UNAVAILABLE
  dev-geocoder.adapter.ts                empty/stub results; boots + tests without a key
  geocoder.factory.ts                    dev | yandex by env
presentation/geocode.controller.ts       @Controller('geo'): POST geocode, POST reverse-geocode (JwtAuthGuard)
presentation/dto/                         4 DTOs, 1:1 with elon-uz.json
common/geo/uzbekistan-bounds.ts           shared bbox (also used by branches)
```

`geo.module.ts` gains the `GEOCODER` binding (factory), `GeocodingService`, and `GeocodeController`.

## 11. Auth

Both endpoints require **`JwtAuthGuard`** (unlike public `regions`/`districts` reference data). They
proxy a paid third-party service inside authenticated business workflows; the backend must not become
an open geocoding proxy.

## 12. Error codes

Reuse: `LOCATION_OUT_OF_BOUNDS`, `VALIDATION_ERROR`.
**Add** to `src/common/errors/error-code.ts`: `GEOCODER_UNAVAILABLE` (503).

## 13. Testing

- `GeocodingService` (mock `GEOCODER` + `GEO_REPOSITORY`): forward happy path + region filter +
  unknown `regionId` → 422; reverse happy path, out-of-bounds → 422, provider-no-address → nulls,
  provider failure → 503; region/district resolution picks the nearest centre and skips null centres.
- `geocoderFactory`: `dev` builds the stub; `yandex` without a key throws.
- `isWithinUzbekistan` boundary cases.

## 14. Phased plan (verify build/tests green + commit after each)

1. **Foundation (provider plumbing)** — port + 4 DTOs + config + `DevGeocoderAdapter` +
   `YandexGeocoderAdapter` (native fetch) + factory + shared bounds util (refactor branches onto it)
   → bind `GEOCODER` in the module. Build + typecheck clean, suite green.
2. **Service** — `GeocodingService` (bounds, region/district resolution, region filter, error
   mapping) + unit tests (mock the port); wire into the module.
3. **Presentation** — `GeocodeController` (JwtAuthGuard) + Swagger + wiring; suite green.

## 15. Out of scope / follow-ups

Response caching (the decorator seam, §4), live `nearestMetro`, per-user rate limiting, caching the
district list for resolution.
