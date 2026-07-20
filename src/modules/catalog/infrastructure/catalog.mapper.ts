import type {
  AttributeSpec as AttributeSpecRow,
  BusinessTypeInfo as BusinessTypeInfoRow,
  Category as CategoryRow,
} from '@prisma/client';
import { BusinessType } from '../domain/entities/business-type.entity';
import { AttributeField, AttributeOption, Category } from '../domain/entities/category.entity';
import { AttributeFieldType } from '../domain/enums/attribute-field-type.enum';
import { Gender } from '../domain/enums/gender.enum';
import { PriceUnit } from '../domain/enums/price-unit.enum';

/**
 * Maps Prisma rows to catalog domain entities. The Prisma enums carry the same wire
 * values as the domain enums, so they are looked up by key.
 *
 * Bridge (schema vs OpenAPI): `AttributeSpec.options` is stored as JSON. The seed writes
 * `{ value, label }[]`, but the source data uses `string[]` — {@link toAttributeOptions}
 * normalises both to `{ value, label }[]` to match AttributeFieldDto.options.
 */
export class CatalogMapper {
  static toBusinessType(row: BusinessTypeInfoRow): BusinessType {
    return {
      type: row.type,
      nameUz: row.nameUz,
      nameRu: row.nameRu,
      iconUrl: row.iconUrl,
      emoji: row.emoji,
      accentColor: row.accentColor,
      defaultPriceUnit: PriceUnit[row.defaultPriceUnit],
      priceUnits: row.priceUnits.map((unit) => PriceUnit[unit]),
      availableForGenders: row.availableForGenders.map((gender) => Gender[gender]),
    };
  }

  /**
   * Builds a category with the fields shown when it is selected: the type-level specs
   * (`categoryKey = null`) followed by this category's own specs, each ordered by `sortOrder`.
   */
  static toCategory(row: CategoryRow, specs: AttributeSpecRow[]): Category {
    const fields = specs
      .filter((spec) => spec.categoryKey === null || spec.categoryKey === row.key)
      .sort(compareSpecsForCategory)
      .map((spec) => CatalogMapper.toAttributeField(spec));
    return {
      key: row.key,
      businessType: row.businessType,
      nameUz: row.nameUz,
      nameRu: row.nameRu,
      iconUrl: row.iconUrl,
      sortOrder: row.sortOrder,
      requiresCustomName: row.requiresCustomName,
      fields,
      gender: row.gender === null ? null : Gender[row.gender],
    };
  }

  private static toAttributeField(spec: AttributeSpecRow): AttributeField {
    return {
      key: spec.key,
      label: spec.label,
      type: AttributeFieldType[spec.kind],
      required: spec.required,
      hint: spec.hint,
      suffix: spec.suffix,
      multiple: spec.multiple,
      options: toAttributeOptions(spec.options),
    };
  }
}

/** Type-level fields (categoryKey = null) first, then category-level; each by `sortOrder`. */
function compareSpecsForCategory(a: AttributeSpecRow, b: AttributeSpecRow): number {
  const aRank = a.categoryKey === null ? 0 : 1;
  const bRank = b.categoryKey === null ? 0 : 1;
  return aRank !== bRank ? aRank - bRank : a.sortOrder - b.sortOrder;
}

/** Normalises the stored JSON (`string[]` or `{ value, label }[]`) to `{ value, label }[]`. */
function toAttributeOptions(value: unknown): AttributeOption[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const options: AttributeOption[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      options.push({ value: item, label: item });
    } else if (item !== null && typeof item === 'object' && 'value' in item && 'label' in item) {
      const option = item as { value: unknown; label: unknown };
      if (typeof option.value === 'string' && typeof option.label === 'string') {
        options.push({ value: option.value, label: option.label });
      }
    }
  }
  return options.length > 0 ? options : null;
}
