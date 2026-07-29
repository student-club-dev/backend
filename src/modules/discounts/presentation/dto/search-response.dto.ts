import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import type { GeoBox } from '../../../../common/geo/geo-box';
import type { CountFacets, MapCluster, SearchResult } from '../../application/search-query.model';
import type { MapMarker } from '../../domain/map-marker.model';
import { DiscountCardDto } from './discount-card.dto';

/**
 * `mode: "LIST"` result — exactly the pagination envelope from CLAUDE.md and nothing else: no
 * `cursor`, no `meta`, no `facets` (D3). `page` is zero-based and echoes the request.
 */
export class SearchListResponseDto {
  @ApiProperty({ type: [DiscountCardDto] })
  items!: DiscountCardDto[];

  @ApiProperty({ type: 'integer', format: 'int32', example: 0 })
  page!: number;

  @ApiProperty({ type: 'integer', format: 'int32', example: 20 })
  size!: number;

  @ApiProperty({ type: 'integer', format: 'int64', example: 137 })
  total!: number;

  @ApiProperty({ example: true })
  hasNext!: boolean;

  static fromResult(result: Extract<SearchResult, { mode: 'LIST' }>): SearchListResponseDto {
    const dto = new SearchListResponseDto();
    dto.items = result.items.map(DiscountCardDto.fromDomain);
    dto.page = result.page;
    dto.size = result.size;
    dto.total = result.total;
    dto.hasNext = result.hasNext;
    return dto;
  }
}

class FacetCountDto {
  @ApiProperty({ example: 'PERCENT' })
  key!: string;

  @ApiProperty({ type: 'integer', format: 'int32', example: 88 })
  count!: number;
}

class CategoryFacetDto {
  @ApiProperty({ example: 'PALOV' })
  key!: string;

  @ApiProperty({ example: 'Osh' })
  label!: string;

  @ApiProperty({ type: 'integer', format: 'int32', example: 54 })
  count!: number;
}

class AttributeValueFacetDto {
  @ApiProperty({ example: 'VIP' })
  value!: string;

  @ApiProperty({ type: 'integer', format: 'int32', example: 22 })
  count!: number;
}

class PriceRangeDto {
  @ApiProperty({ example: 8000 })
  min!: number;

  @ApiProperty({ example: 240000 })
  max!: number;
}

class DiscountRangeDto {
  @ApiProperty({ example: 5 })
  minPercent!: number;

  @ApiProperty({ example: 70 })
  maxPercent!: number;
}

/** Facet buckets (§8.3). Each is counted over the type/category/location scope of the request. */
@ApiExtraModels(AttributeValueFacetDto)
class SearchFacetsDto {
  @ApiProperty({ type: [CategoryFacetDto] })
  byCategory!: CategoryFacetDto[];

  @ApiProperty({ type: [FacetCountDto] })
  byType!: FacetCountDto[];

  @ApiProperty({ type: [FacetCountDto] })
  byDistrict!: FacetCountDto[];

  @ApiProperty({ type: [FacetCountDto] })
  byDiscountType!: FacetCountDto[];

  @ApiProperty({ type: [FacetCountDto], description: 'DISCOUNT + REGULAR = total.' })
  byListingKind!: FacetCountDto[];

  @ApiProperty({
    type: 'object',
    description: 'Attribute key → the values that actually occur, with counts.',
    additionalProperties: {
      type: 'array',
      items: { $ref: getSchemaPath(AttributeValueFacetDto) },
    },
  })
  byAttribute!: Record<string, AttributeValueFacetDto[]>;

  @ApiProperty({ required: false, nullable: true, type: PriceRangeDto })
  priceRange!: PriceRangeDto | null;

  @ApiProperty({ required: false, nullable: true, type: DiscountRangeDto })
  discountRange!: DiscountRangeDto | null;

  static fromDomain(facets: CountFacets): SearchFacetsDto {
    const dto = new SearchFacetsDto();
    Object.assign(dto, facets);
    return dto;
  }
}

/**
 * `mode: "COUNT"` result (§8.3) — aggregates only, never rows. `total` is the very number a LIST
 * with the same body would report (§12.15), which is what the client's "Apply · N offers" button
 * shows.
 */
export class SearchCountResponseDto {
  @ApiProperty({ type: 'integer', format: 'int64', example: 137 })
  total!: number;

  @ApiProperty({ type: SearchFacetsDto })
  facets!: SearchFacetsDto;

  static fromResult(result: Extract<SearchResult, { mode: 'COUNT' }>): SearchCountResponseDto {
    const dto = new SearchCountResponseDto();
    dto.total = result.total;
    dto.facets = SearchFacetsDto.fromDomain(result.facets);
    return dto;
  }
}

/** A latitude/longitude rectangle — a cluster's extent, and the extent of the whole answer. */
class GeoBoxDto {
  @ApiProperty({ example: 41.28 })
  minLat!: number;

  @ApiProperty({ example: 69.2 })
  minLng!: number;

  @ApiProperty({ example: 41.35 })
  maxLat!: number;

  @ApiProperty({ example: 69.31 })
  maxLng!: number;

  static fromDomain(box: GeoBox): GeoBoxDto {
    const dto = new GeoBoxDto();
    Object.assign(dto, box);
    return dto;
  }
}

/**
 * One pin (§8.2). A listing offered at three branches arrives as three markers with the same
 * `listingId` (§12.11) — tapping any of them opens the same offer.
 */
class MapMarkerDto {
  @ApiProperty({ example: 'lst_01H8X...' })
  listingId!: string;

  @ApiProperty({ example: 'br_01H8X...' })
  branchId!: string;

  @ApiProperty({ example: 41.352 })
  lat!: number;

  @ApiProperty({ example: 69.273 })
  lng!: number;

  @ApiProperty({ example: '21k', description: 'Short label for the pin; rendered server-side.' })
  priceLabel!: string;

  @ApiProperty({ type: 'integer', format: 'int64', example: 21000 })
  finalPrice!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '−30%',
    description: 'Null on a regular listing (Q0).',
  })
  discountBadge!: string | null;

  @ApiProperty({ example: 'PLAYSTATION' })
  businessType!: string;

  @ApiProperty({ type: String, nullable: true, example: '#7C5CFF' })
  accentColor!: string | null;

  @ApiProperty({ example: true })
  isDiscount!: boolean;

  @ApiProperty({ example: false, description: 'Always false for an anonymous reader (D5).' })
  isFavorite!: boolean;

  static fromDomain(marker: MapMarker): MapMarkerDto {
    const dto = new MapMarkerDto();
    dto.listingId = marker.listingId;
    dto.branchId = marker.branchId;
    dto.lat = marker.lat;
    dto.lng = marker.lng;
    dto.priceLabel = marker.priceLabel;
    dto.finalPrice = marker.finalPrice;
    dto.discountBadge = marker.discountBadge;
    dto.businessType = marker.businessType;
    dto.accentColor = marker.accentColor;
    dto.isDiscount = marker.isDiscount;
    dto.isFavorite = marker.isFavorite;
    return dto;
  }
}

/** Markers folded together because the zoom cannot tell them apart (§8.2). */
class MapClusterDto {
  @ApiProperty({ example: 41.31, description: 'Centroid of the markers it holds.' })
  lat!: number;

  @ApiProperty({ example: 69.24 })
  lng!: number;

  @ApiProperty({ type: 'integer', format: 'int32', example: 42 })
  count!: number;

  @ApiProperty({ type: GeoBoxDto })
  bbox!: GeoBoxDto;

  @ApiProperty({ type: 'integer', format: 'int64', example: 15000 })
  minPrice!: number;

  @ApiProperty({
    type: 'integer',
    format: 'int32',
    nullable: true,
    example: 45,
    description: 'Null when no listing in the cluster is discounted.',
  })
  maxDiscountPercent!: number | null;

  static fromDomain(cluster: MapCluster): MapClusterDto {
    const dto = new MapClusterDto();
    dto.lat = cluster.lat;
    dto.lng = cluster.lng;
    dto.count = cluster.count;
    dto.bbox = GeoBoxDto.fromDomain(cluster.bbox);
    dto.minPrice = cluster.minPrice;
    dto.maxDiscountPercent = cluster.maxDiscountPercent;
    return dto;
  }
}

/**
 * `mode: "MAP"` result (§8.2) — no pagination: the viewport is the page.
 *
 * D15 keeps the two counts apart, and they answer different questions: `total` is the LISTINGS a
 * LIST with the same body would report, `markersTotal` the MARKERS on the map. A listing offered at
 * three branches makes the second larger than the first, which is expected, not a bug.
 */
export class SearchMapResponseDto {
  @ApiProperty({ type: [MapMarkerDto] })
  markers!: MapMarkerDto[];

  @ApiProperty({ type: [MapClusterDto], description: 'Empty unless markers were folded.' })
  clusters!: MapClusterDto[];

  @ApiProperty({
    required: false,
    nullable: true,
    type: GeoBoxDto,
    description: 'Extent of what is returned; null when the viewport holds nothing.',
  })
  bounds!: GeoBoxDto | null;

  @ApiProperty({
    type: 'integer',
    format: 'int64',
    example: 137,
    description: 'Listings — equals LIST/COUNT (D15).',
  })
  total!: number;

  @ApiProperty({
    type: 'integer',
    format: 'int64',
    example: 214,
    description: 'Markers (listing × branch); may exceed `total` (D15).',
  })
  markersTotal!: number;

  @ApiProperty({
    example: false,
    description: 'True whenever a marker was dropped or folded into a cluster.',
  })
  truncated!: boolean;

  static fromResult(result: Extract<SearchResult, { mode: 'MAP' }>): SearchMapResponseDto {
    const dto = new SearchMapResponseDto();
    dto.markers = result.markers.map(MapMarkerDto.fromDomain);
    dto.clusters = result.clusters.map(MapClusterDto.fromDomain);
    dto.bounds = result.bounds === null ? null : GeoBoxDto.fromDomain(result.bounds);
    dto.total = result.total;
    dto.markersTotal = result.markersTotal;
    dto.truncated = result.truncated;
    return dto;
  }
}
