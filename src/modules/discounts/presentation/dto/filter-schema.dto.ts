import { ApiProperty } from '@nestjs/swagger';
import { AttributeFieldType } from '../../../catalog/domain/enums/attribute-field-type.enum';
import { FilterSchema } from '../../application/filter-schema.service';

class FacetCountDto {
  @ApiProperty({ example: 'PERCENT' })
  key!: string;

  @ApiProperty({ type: 'integer', format: 'int32', example: 188 })
  count!: number;
}

class RangeDto {
  @ApiProperty({ example: 8000 })
  min!: number;

  @ApiProperty({ example: 240000 })
  max!: number;
}

class SchemaTypeDto {
  @ApiProperty({ example: 'NATIONAL_FOOD' })
  key!: string;

  @ApiProperty({ example: 'Milliy taomlar' })
  nameUz!: string;

  @ApiProperty({ type: String, required: false, nullable: true, example: '🍛' })
  emoji!: string | null;

  @ApiProperty({ example: 187 })
  listingsCount!: number;
}

class SchemaCategoryDto {
  @ApiProperty({ example: 'PALOV' })
  key!: string;

  @ApiProperty({ example: 'Osh' })
  label!: string;

  @ApiProperty({ example: 'NATIONAL_FOOD' })
  typeKey!: string;

  @ApiProperty({ type: 'integer', format: 'int32', example: 54 })
  count!: number;
}

class AttributeValueDto {
  @ApiProperty({ example: 'VIP' })
  value!: string;

  @ApiProperty({ type: 'integer', format: 'int32', example: 22 })
  count!: number;
}

class SchemaAttributeDto {
  @ApiProperty({ example: 'spicyLevel' })
  key!: string;

  @ApiProperty({ example: "O'tkirlik" })
  label!: string;

  @ApiProperty({ enum: AttributeFieldType, enumName: 'AttributeFieldTypeDto' })
  kind!: AttributeFieldType;

  @ApiProperty({ type: String, required: false, nullable: true, example: 'gramm' })
  suffix!: string | null;

  @ApiProperty({ type: [String], example: ['NATIONAL_FOOD', 'FAST_FOOD'] })
  appliesToTypes!: string[];

  @ApiProperty({ type: [String], example: ['EQ', 'NEQ', 'IN', 'NOT_IN', 'EXISTS'] })
  operators!: string[];

  @ApiProperty({
    required: false,
    type: [AttributeValueDto],
    description: 'Present for SELECT / BOOLEAN / MULTI_SELECT / TAGS — only values that occur.',
  })
  values?: AttributeValueDto[];

  @ApiProperty({ required: false, type: RangeDto, description: 'Present for NUMBER only.' })
  range?: RangeDto;
}

class SortOptionDto {
  @ApiProperty({ example: 'DISTANCE' })
  key!: string;

  @ApiProperty({ example: 'Yaqinlik' })
  label!: string;

  @ApiProperty({ example: true })
  requiresGeo!: boolean;
}

/** FilterSchemaDto — everything the filter screen is built from (STUDENT_FEED.md §9). */
export class FilterSchemaDto {
  @ApiProperty({ type: [SchemaTypeDto] })
  types!: SchemaTypeDto[];

  @ApiProperty({ type: [SchemaCategoryDto] })
  categories!: SchemaCategoryDto[];

  @ApiProperty({ type: [SchemaAttributeDto] })
  attributes!: SchemaAttributeDto[];

  @ApiProperty({ type: [FacetCountDto], description: 'ALL / DISCOUNT / REGULAR' })
  listingKind!: FacetCountDto[];

  @ApiProperty({ type: [FacetCountDto] })
  priceUnits!: FacetCountDto[];

  @ApiProperty({ required: false, nullable: true, type: RangeDto })
  priceRange!: RangeDto | null;

  @ApiProperty({ type: [FacetCountDto] })
  discountTypes!: FacetCountDto[];

  @ApiProperty({ required: false, nullable: true, type: RangeDto })
  discountPercentRange!: RangeDto | null;

  @ApiProperty({ type: [FacetCountDto] })
  redemptionMethods!: FacetCountDto[];

  @ApiProperty({ type: [FacetCountDto] })
  regions!: FacetCountDto[];

  @ApiProperty({ type: [FacetCountDto] })
  districts!: FacetCountDto[];

  @ApiProperty({ type: [FacetCountDto] })
  tradeCenters!: FacetCountDto[];

  @ApiProperty({ type: [SortOptionDto] })
  sorts!: SortOptionDto[];

  @ApiProperty({ type: 'integer', format: 'int32', example: 312 })
  total!: number;

  static fromDomain(schema: FilterSchema): FilterSchemaDto {
    const dto = new FilterSchemaDto();
    dto.types = schema.types;
    dto.categories = schema.categories;
    dto.attributes = schema.attributes.map((attribute) => ({
      key: attribute.key,
      label: attribute.label,
      kind: attribute.kind,
      suffix: attribute.suffix,
      appliesToTypes: attribute.appliesToTypes,
      operators: attribute.operators,
      values: attribute.values,
      range: attribute.range,
    }));
    dto.listingKind = schema.listingKind;
    dto.priceUnits = schema.priceUnits;
    dto.priceRange = schema.priceRange;
    dto.discountTypes = schema.discountTypes;
    dto.discountPercentRange = schema.discountPercentRange;
    dto.redemptionMethods = schema.redemptionMethods;
    dto.regions = schema.regions;
    dto.districts = schema.districts;
    dto.tradeCenters = schema.tradeCenters;
    dto.sorts = schema.sorts.map((sort) => ({ ...sort }));
    dto.total = schema.total;
    return dto;
  }
}
