import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { GeoBox } from '../../../../common/geo/geo-box';
import {
  DEFAULT_MAP_VIEW,
  type MapView,
  type SearchQuery,
} from '../../application/search-query.model';
import { scheduleClock, WEEK_DAYS, type WeekDay } from '../../domain/feed-time';
import type {
  AttributeFilter,
  AttributeOp,
  AttributesMatch,
  AvailabilityFilter,
  DiscountFilter,
  FlagsFilter,
  GeoFilter,
  ListingKind,
  PriceBasis,
  PriceFilter,
  RedemptionFilter,
  SearchFilter,
  SearchMode,
  SortBy,
  SortDirection,
} from '../../domain/search.repository';

const MODES: SearchMode[] = ['LIST', 'COUNT', 'MAP'];
const SORT_BY: SortBy[] = [
  'DISTANCE',
  'DISCOUNT_PERCENT',
  'PRICE_FINAL',
  'PRICE_ORIGINAL',
  'SAVED_AMOUNT',
  'NEWEST',
  'ENDING_SOON',
  'POPULAR',
  'RELEVANCE',
];
const DIRECTIONS: SortDirection[] = ['ASC', 'DESC'];
const LISTING_KINDS: ListingKind[] = ['ALL', 'DISCOUNT', 'REGULAR'];
const PRICE_BASES: PriceBasis[] = ['FINAL', 'ORIGINAL'];
const ATTRIBUTE_MATCHES: AttributesMatch[] = ['ALL', 'ANY'];
const ATTRIBUTE_OPS: AttributeOp[] = [
  'EQ',
  'NEQ',
  'IN',
  'NOT_IN',
  'BETWEEN',
  'GTE',
  'LTE',
  'CONTAINS',
  'ANY',
  'ALL',
  'EXISTS',
];

/** §10 "Chegaralar". `groupKeys`/`types`/`page.size` are checked in the service, which owns the
 * codes the spec names for them (TOO_MANY_GROUPS, TOO_MANY_TYPES, PAGE_SIZE_EXCEEDED). */
const MAX_IDS = 200;
const MAX_CATEGORY_KEYS = 30;
const MAX_ATTRIBUTES = 20;
const MAX_QUERY_LENGTH = 100;
const DEFAULT_RADIUS_METERS = 5000;
const DEFAULT_PAGE_SIZE = 20;
/** Web-Mercator zoom levels a mobile map offers; the clusterer clamps whatever arrives. */
const MAX_ZOOM = 22;

const NO_GEO: GeoFilter = {
  point: null,
  bbox: null,
  regionIds: [],
  districtIds: [],
  onlineOnly: false,
};
const NO_PRICE: PriceFilter = { min: null, max: null, basis: 'FINAL', units: [] };
const NO_DISCOUNT: DiscountFilter = {
  types: [],
  minPercent: null,
  maxPercent: null,
  minSavedAmount: null,
};
const NO_REDEMPTION: RedemptionFilter = { methods: [], hasPromoCode: null, onlyAvailable: false };
const NO_FLAGS: FlagsFilter = {
  withImagesOnly: false,
  favoritesOnly: false,
  hasDeliveryOnly: false,
  newOnly: false,
};
const NO_AVAILABILITY: AvailabilityFilter = {
  openNow: false,
  openAt: null,
  validAt: null,
  endingWithinHours: null,
};

/** `availability.atTime` — `HH:mm` on a 24-hour clock. */
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** A year of hours: past that, "ends within N hours" stops narrowing anything. */
const MAX_ENDING_WITHIN_HOURS = 8760;

/**
 * `filter.geo.bbox` (§4) — the map viewport. The service rejects a box that is inverted or outside
 * Uzbekistan with `422 INVALID_BBOX`; the decorators here only check that four coordinates arrived.
 */
export class SearchBboxDto {
  @ApiProperty({ example: 41.28 })
  @IsLatitude()
  minLat!: number;

  @ApiProperty({ example: 69.2 })
  @IsLongitude()
  minLng!: number;

  @ApiProperty({ example: 41.35 })
  @IsLatitude()
  maxLat!: number;

  @ApiProperty({ example: 69.31 })
  @IsLongitude()
  maxLng!: number;

  toDomain(): GeoBox {
    return {
      minLat: this.minLat,
      minLng: this.minLng,
      maxLat: this.maxLat,
      maxLng: this.maxLng,
    };
  }
}

/**
 * `filter.geo` (§4). `lat`/`lng` come as a pair — one without the other is a client bug, and
 * silently ignoring it would return a nationwide feed to someone who asked for "near me".
 *
 * `bbox` narrows every mode, not only MAP: a filter the request carries is a filter the answer
 * honours. `inTradeCenterOnly` is not accepted by any slice yet.
 */
export class SearchGeoDto {
  @ApiProperty({ required: false, example: 41.3111, description: 'Required together with `lng`.' })
  @ValidateIf((geo: SearchGeoDto) => geo.lat !== undefined || geo.lng !== undefined)
  @IsLatitude()
  lat?: number;

  @ApiProperty({ required: false, example: 69.2797, description: 'Required together with `lat`.' })
  @ValidateIf((geo: SearchGeoDto) => geo.lat !== undefined || geo.lng !== undefined)
  @IsLongitude()
  lng?: number;

  @ApiProperty({ required: false, default: DEFAULT_RADIUS_METERS, minimum: 100, maximum: 50000 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(50_000)
  radiusMeters?: number;

  @ApiProperty({
    required: false,
    type: SearchBboxDto,
    description: 'Map viewport. In `mode: "MAP"` either this or `lat`+`lng` is mandatory.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchBboxDto)
  bbox?: SearchBboxDto;

  @ApiProperty({ required: false, type: [String], maxItems: MAX_IDS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IDS)
  @IsString({ each: true })
  regionIds?: string[];

  @ApiProperty({ required: false, type: [String], maxItems: MAX_IDS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IDS)
  @IsString({ each: true })
  districtIds?: string[];

  @ApiProperty({ required: false, description: 'Only businesses marked online-only.' })
  @IsOptional()
  @IsBoolean()
  onlineOnly?: boolean;

  toDomain(): GeoFilter {
    return {
      point:
        this.lat === undefined || this.lng === undefined
          ? null
          : {
              lat: this.lat,
              lng: this.lng,
              radiusMeters: this.radiusMeters ?? DEFAULT_RADIUS_METERS,
            },
      bbox: this.bbox?.toDomain() ?? null,
      regionIds: this.regionIds ?? [],
      districtIds: this.districtIds ?? [],
      onlineOnly: this.onlineOnly ?? false,
    };
  }
}

/** `filter.price` (§4). Whole so'm, no decimals. */
export class SearchPriceDto {
  @ApiProperty({ required: false, example: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  min?: number;

  @ApiProperty({ required: false, example: 150000, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  max?: number;

  @ApiProperty({
    required: false,
    enum: PRICE_BASES,
    default: 'FINAL',
    description: 'Which price `min`/`max` compare against.',
  })
  @IsOptional()
  @IsIn(PRICE_BASES)
  basis?: PriceBasis;

  @ApiProperty({ required: false, type: [String], example: ['PER_HOUR'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  units?: string[];

  toDomain(): PriceFilter {
    return {
      min: this.min ?? null,
      max: this.max ?? null,
      basis: this.basis ?? 'FINAL',
      units: this.units ?? [],
    };
  }
}

/** `filter.discount` (§4). Regular listings never satisfy these (Q0). */
export class SearchDiscountDto {
  @ApiProperty({ required: false, type: [String], example: ['PERCENT'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  types?: string[];

  @ApiProperty({ required: false, example: 20, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minPercent?: number;

  @ApiProperty({ required: false, example: 90, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  maxPercent?: number;

  @ApiProperty({ required: false, example: 10000, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minSavedAmount?: number;

  toDomain(): DiscountFilter {
    return {
      types: this.types ?? [],
      minPercent: this.minPercent ?? null,
      maxPercent: this.maxPercent ?? null,
      minSavedAmount: this.minSavedAmount ?? null,
    };
  }
}

/** `filter.redemption` (§4). */
export class SearchRedemptionDto {
  @ApiProperty({ required: false, type: [String], example: ['QR', 'PROMO_CODE'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  methods?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  hasPromoCode?: boolean;

  @ApiProperty({ required: false, description: 'Only offers with redemptions left.' })
  @IsOptional()
  @IsBoolean()
  onlyAvailable?: boolean;

  toDomain(): RedemptionFilter {
    return {
      methods: this.methods ?? [],
      hasPromoCode: this.hasPromoCode ?? null,
      onlyAvailable: this.onlyAvailable ?? false,
    };
  }
}

/** `filter.flags` (§4). */
export class SearchFlagsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  withImagesOnly?: boolean;

  @ApiProperty({ required: false, description: 'Requires a student token.' })
  @IsOptional()
  @IsBoolean()
  favoritesOnly?: boolean;

  @ApiProperty({ required: false, description: 'Reads `attributes.hasDelivery` only (D12).' })
  @IsOptional()
  @IsBoolean()
  hasDeliveryOnly?: boolean;

  @ApiProperty({ required: false, description: 'Created within the last 7 days.' })
  @IsOptional()
  @IsBoolean()
  newOnly?: boolean;

  toDomain(): FlagsFilter {
    return {
      withImagesOnly: this.withImagesOnly ?? false,
      favoritesOnly: this.favoritesOnly ?? false,
      hasDeliveryOnly: this.hasDeliveryOnly ?? false,
      newOnly: this.newOnly ?? false,
    };
  }
}

/**
 * `filter.availability` (§4, D11) — opening hours and the validity window.
 *
 * `onDay` and `atTime` come as a pair, the same way `geo.lat`/`geo.lng` do: half a time is a client
 * bug, and answering it with an unfiltered feed (or an empty one) would hide that.
 *
 * `openNow` and the `onDay`/`atTime` pair are two different questions, so both are applied when
 * both arrive. Opening hours are read in Tashkent time (UTC+5), overnight shifts included.
 */
export class SearchAvailabilityDto {
  @ApiProperty({
    required: false,
    description: 'Some branch is open right now, Tashkent time (UTC+5).',
  })
  @IsOptional()
  @IsBoolean()
  openNow?: boolean;

  @ApiProperty({
    required: false,
    enum: WEEK_DAYS,
    example: 'SAT',
    description: 'Required together with `atTime`.',
  })
  @ValidateIf((a: SearchAvailabilityDto) => a.onDay !== undefined || a.atTime !== undefined)
  @IsIn(WEEK_DAYS, { message: 'onDay va atTime birga yuboriladi; onDay hafta kuni bo‘lsin' })
  onDay?: WeekDay;

  @ApiProperty({
    required: false,
    example: '19:30',
    description: '`HH:mm`. Required together with `onDay`.',
  })
  @ValidateIf((a: SearchAvailabilityDto) => a.onDay !== undefined || a.atTime !== undefined)
  @Matches(CLOCK_TIME, { message: 'onDay va atTime birga yuboriladi; atTime HH:mm ko‘rinishida' })
  atTime?: string;

  @ApiProperty({
    required: false,
    example: '2026-07-25T15:00:00Z',
    description: 'ISO-8601. The offer must also be valid at this instant; defaults to now.',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'validAt ISO-8601 sana bo‘lsin' })
  validAt?: string;

  @ApiProperty({
    required: false,
    example: 24,
    minimum: 1,
    maximum: MAX_ENDING_WITHIN_HOURS,
    description: 'Ends within this many hours — the "expires today" filter.',
  })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'endingWithinHours kamida 1 soat bo‘lsin' })
  @Max(MAX_ENDING_WITHIN_HOURS, {
    message: `endingWithinHours ko‘pi bilan ${MAX_ENDING_WITHIN_HOURS} soat`,
  })
  endingWithinHours?: number;

  toDomain(): AvailabilityFilter {
    return {
      openNow: this.openNow ?? false,
      openAt:
        this.onDay === undefined || this.atTime === undefined
          ? null
          : scheduleClock(this.onDay, this.atTime),
      validAt: this.validAt === undefined ? null : new Date(this.validAt),
      endingWithinHours: this.endingWithinHours ?? null,
    };
  }
}

/**
 * One attribute condition (§5). Which operand is read follows from `op`: `EQ`/`NEQ` take
 * `text`/`number`/`boolean`, `IN`/`NOT_IN`/`ANY`/`ALL` take `values`, `BETWEEN` takes `min`/`max`,
 * `GTE`/`LTE` take `number`, `CONTAINS` takes `text`, `EXISTS` takes none.
 */
export class SearchAttributeDto {
  @ApiProperty({ example: 'model' })
  @IsString()
  @MaxLength(64)
  key!: string;

  @ApiProperty({ enum: ATTRIBUTE_OPS, example: 'IN' })
  @IsIn(ATTRIBUTE_OPS)
  op!: AttributeOp;

  @ApiProperty({ required: false, example: 'zara' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  text?: string;

  @ApiProperty({ required: false, example: 30 })
  @IsOptional()
  @IsNumber()
  number?: number;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  boolean?: boolean;

  @ApiProperty({ required: false, type: [String], example: ['PS5', 'PS4 Pro'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  values?: string[];

  @ApiProperty({ required: false, example: 30 })
  @IsOptional()
  @IsNumber()
  min?: number;

  @ApiProperty({ required: false, example: 120 })
  @IsOptional()
  @IsNumber()
  max?: number;

  toDomain(): AttributeFilter {
    return {
      key: this.key,
      op: this.op,
      text: this.text ?? null,
      number: this.number ?? null,
      boolean: this.boolean ?? null,
      values: this.values ?? [],
      min: this.min ?? null,
      max: this.max ?? null,
    };
  }
}

/**
 * `filter` (§4) — shared with `favorites/search`, where `groupKeys`/`types` are optional (Q3's one
 * exception), which is why the Q3 check itself lives in the service and not in a decorator.
 *
 * Fields of §4 that Level 1 does not answer are deliberately absent, so sending one fails
 * validation instead of being silently dropped: `options` (D13), `tradeCenterIds` /
 * `geo.bbox` / `geo.inTradeCenterOnly` (MAP slice), `includeCustomCategories`.
 */
export class SearchFilterDto {
  @ApiProperty({ required: false, type: [String], example: ['FOOD'], maxItems: 3 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupKeys?: string[];

  @ApiProperty({ required: false, type: [String], example: ['NATIONAL_FOOD'], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  types?: string[];

  @ApiProperty({ required: false, type: [String], example: ['PALOV'], maxItems: MAX_CATEGORY_KEYS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CATEGORY_KEYS)
  @IsString({ each: true })
  categoryKeys?: string[];

  @ApiProperty({
    required: false,
    default: true,
    description: 'Whether `categoryKey = "ALL"` listings answer a category request.',
  })
  @IsOptional()
  @IsBoolean()
  includeAllCategory?: boolean;

  @ApiProperty({
    required: false,
    default: true,
    description:
      'Whether listings with a free-text `customCategoryName` (categoryKey "OTHER") answer the request.',
  })
  @IsOptional()
  @IsBoolean()
  includeCustomCategories?: boolean;

  @ApiProperty({ required: false, type: [String], maxItems: MAX_IDS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IDS)
  @IsString({ each: true })
  businessIds?: string[];

  @ApiProperty({ required: false, type: [String], maxItems: MAX_IDS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IDS)
  @IsString({ each: true })
  branchIds?: string[];

  @ApiProperty({ required: false, type: [String], maxItems: MAX_IDS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IDS)
  @IsString({ each: true })
  listingIds?: string[];

  @ApiProperty({ required: false, type: [String], maxItems: MAX_IDS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IDS)
  @IsString({ each: true })
  excludeListingIds?: string[];

  @ApiProperty({
    required: false,
    example: 'ps5 vip',
    maxLength: MAX_QUERY_LENGTH,
    description: 'Prefix, word-boundary match over title, business, category and synonyms (§7).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_QUERY_LENGTH)
  query?: string;

  @ApiProperty({ required: false, type: SearchGeoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchGeoDto)
  geo?: SearchGeoDto;

  @ApiProperty({ required: false, type: SearchPriceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchPriceDto)
  price?: SearchPriceDto;

  @ApiProperty({ required: false, enum: LISTING_KINDS, default: 'ALL' })
  @IsOptional()
  @IsIn(LISTING_KINDS)
  listingKind?: ListingKind;

  @ApiProperty({ required: false, type: SearchDiscountDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchDiscountDto)
  discount?: SearchDiscountDto;

  @ApiProperty({ required: false, type: SearchRedemptionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchRedemptionDto)
  redemption?: SearchRedemptionDto;

  @ApiProperty({ required: false, type: SearchFlagsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchFlagsDto)
  flags?: SearchFlagsDto;

  @ApiProperty({ required: false, type: SearchAvailabilityDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchAvailabilityDto)
  availability?: SearchAvailabilityDto;

  @ApiProperty({ required: false, type: [SearchAttributeDto], maxItems: MAX_ATTRIBUTES })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ATTRIBUTES)
  @ValidateNested({ each: true })
  @Type(() => SearchAttributeDto)
  attributes?: SearchAttributeDto[];

  @ApiProperty({ required: false, enum: ATTRIBUTE_MATCHES, default: 'ALL' })
  @IsOptional()
  @IsIn(ATTRIBUTE_MATCHES)
  attributesMatch?: AttributesMatch;

  toDomain(): SearchFilter & { groupKeys: string[] } {
    const query = this.query?.trim() ?? '';
    return {
      groupKeys: this.groupKeys ?? [],
      types: this.types ?? [],
      categoryKeys: this.categoryKeys ?? [],
      includeAllCategory: this.includeAllCategory ?? true,
      includeCustomCategories: this.includeCustomCategories ?? true,
      businessIds: this.businessIds ?? [],
      branchIds: this.branchIds ?? [],
      listingIds: this.listingIds ?? [],
      excludeListingIds: this.excludeListingIds ?? [],
      query: query === '' ? null : query,
      geo: this.geo?.toDomain() ?? NO_GEO,
      price: this.price?.toDomain() ?? NO_PRICE,
      listingKind: this.listingKind ?? 'ALL',
      discount: this.discount?.toDomain() ?? NO_DISCOUNT,
      redemption: this.redemption?.toDomain() ?? NO_REDEMPTION,
      flags: this.flags?.toDomain() ?? NO_FLAGS,
      availability: this.availability?.toDomain() ?? NO_AVAILABILITY,
      attributes: (this.attributes ?? []).map((attribute) => attribute.toDomain()),
      attributesMatch: this.attributesMatch ?? 'ALL',
    };
  }
}

/** `sort` (§6). */
export class SearchSortDto {
  @ApiProperty({
    enum: SORT_BY,
    default: 'RELEVANCE',
    description: 'RELEVANCE falls back to NEWEST when no `query` is sent.',
  })
  @IsIn(SORT_BY)
  by!: SortBy;

  @ApiProperty({
    required: false,
    enum: DIRECTIONS,
    description: 'Defaults: DISTANCE / PRICE_* / ENDING_SOON ascending, the rest descending.',
  })
  @IsOptional()
  @IsIn(DIRECTIONS)
  direction?: SortDirection;
}

/** `page` (§4) — zero-based, at most 50 rows (the service raises PAGE_SIZE_EXCEEDED above that). */
export class SearchPageDto {
  @ApiProperty({ required: false, default: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  number?: number;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    required: false,
    default: DEFAULT_PAGE_SIZE,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  size?: number;
}

/**
 * `map` (§4) — MAP mode only; LIST and COUNT ignore it. There is no pagination on a map, so
 * `maxMarkers` is the whole of its budget: above 2000 the service answers `422
 * PAGE_SIZE_EXCEEDED`, exactly as `page.size` does above 50.
 */
export class SearchMapDto {
  @ApiProperty({
    required: false,
    default: DEFAULT_MAP_VIEW.zoom,
    minimum: 0,
    maximum: MAX_ZOOM,
    description: 'Decides how coarsely markers are grouped when `clusterize` is on.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_ZOOM)
  zoom?: number;

  @ApiProperty({
    required: false,
    default: DEFAULT_MAP_VIEW.clusterize,
    description:
      'Fold nearby markers into clusters once the viewport holds more than `maxMarkers`.',
  })
  @IsOptional()
  @IsBoolean()
  clusterize?: boolean;

  @ApiProperty({
    required: false,
    default: DEFAULT_MAP_VIEW.maxMarkers,
    minimum: 1,
    description: 'Above 2000 the service answers 422 PAGE_SIZE_EXCEEDED.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxMarkers?: number;

  toDomain(): MapView {
    return {
      zoom: this.zoom ?? DEFAULT_MAP_VIEW.zoom,
      clusterize: this.clusterize ?? DEFAULT_MAP_VIEW.clusterize,
      maxMarkers: this.maxMarkers ?? DEFAULT_MAP_VIEW.maxMarkers,
    };
  }
}

/** `POST /v1/discounts/search` body (STUDENT_FEED.md §4). */
export class SearchRequestDto {
  @ApiProperty({
    enum: MODES,
    example: 'LIST',
    description:
      'LIST returns cards, COUNT the total plus facets, MAP one marker per branch in the viewport.',
  })
  @IsIn(MODES)
  mode!: SearchMode;

  @ApiProperty({ type: SearchFilterDto })
  @ValidateNested()
  @Type(() => SearchFilterDto)
  filter!: SearchFilterDto;

  @ApiProperty({ required: false, type: SearchSortDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchSortDto)
  sort?: SearchSortDto;

  @ApiProperty({ required: false, type: SearchPageDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchPageDto)
  page?: SearchPageDto;

  @ApiProperty({ required: false, type: SearchMapDto, description: '`mode: "MAP"` only.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchMapDto)
  map?: SearchMapDto;

  /** `studentId` is null for an anonymous reader — the feed is public (D5). */
  toQuery(studentId: string | null): SearchQuery {
    return {
      mode: this.mode,
      filter: this.filter.toDomain(),
      // No explicit sort: rank by relevance when there is text to rank against, which the SQL
      // builder turns into NEWEST when there is not (§6). MAP ignores it entirely.
      sort: { by: this.sort?.by ?? 'RELEVANCE', direction: this.sort?.direction ?? null },
      page: { number: this.page?.number ?? 0, size: this.page?.size ?? DEFAULT_PAGE_SIZE },
      map: this.map?.toDomain(),
      studentId,
    };
  }
}
