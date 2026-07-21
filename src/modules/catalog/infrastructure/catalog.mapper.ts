import {
  Gender as PrismaGender,
  PriceUnit as PrismaPriceUnit,
  type AttributeSpec as AttributeSpecRow,
  type BusinessTypeInfo as BusinessTypeInfoRow,
  type Category as CategoryRow,
  type Prisma,
} from '@prisma/client';
import { AttributeSpec } from '../domain/entities/attribute-spec.entity';
import { BusinessType } from '../domain/entities/business-type.entity';
import { AttributeField, AttributeOption, Category } from '../domain/entities/category.entity';
import { BusinessTypeWrite } from '../domain/catalog.repository';
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

  /** Domain write → Prisma create payload (`type` is the PK). */
  static toBusinessTypeCreateData(
    type: string,
    data: BusinessTypeWrite,
  ): Prisma.BusinessTypeInfoUncheckedCreateInput {
    return {
      type,
      nameUz: data.nameUz,
      nameRu: data.nameRu,
      emoji: data.emoji,
      accentColor: data.accentColor,
      iconUrl: data.iconUrl,
      defaultPriceUnit: PrismaPriceUnit[data.defaultPriceUnit],
      priceUnits: data.priceUnits.map((unit) => PrismaPriceUnit[unit]),
      availableForGenders: data.availableForGenders.map((gender) => PrismaGender[gender]),
    };
  }

  /** Domain write → Prisma update payload (only the present keys). */
  static toBusinessTypeUpdateData(
    data: Partial<BusinessTypeWrite>,
  ): Prisma.BusinessTypeInfoUpdateInput {
    const update: Prisma.BusinessTypeInfoUpdateInput = {};
    if (data.nameUz !== undefined) {
      update.nameUz = data.nameUz;
    }
    if (data.nameRu !== undefined) {
      update.nameRu = data.nameRu;
    }
    if (data.emoji !== undefined) {
      update.emoji = data.emoji;
    }
    if (data.accentColor !== undefined) {
      update.accentColor = data.accentColor;
    }
    if (data.iconUrl !== undefined) {
      update.iconUrl = data.iconUrl;
    }
    if (data.defaultPriceUnit !== undefined) {
      update.defaultPriceUnit = PrismaPriceUnit[data.defaultPriceUnit];
    }
    if (data.priceUnits !== undefined) {
      update.priceUnits = data.priceUnits.map((unit) => PrismaPriceUnit[unit]);
    }
    if (data.availableForGenders !== undefined) {
      update.availableForGenders = data.availableForGenders.map((gender) => PrismaGender[gender]);
    }
    return update;
  }

  /** Prisma row → validation spec (LISTINGS.md §6); `options` normalised to a plain `string[]`. */
  static toAttributeSpec(spec: AttributeSpecRow): AttributeSpec {
    return {
      key: spec.key,
      label: spec.label,
      kind: AttributeFieldType[spec.kind],
      required: spec.required,
      options: toAttributeSpecOptions(spec.options),
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

/** Normalises the stored JSON (`string[]` or `{ value, label }[]`) to the allowed-value `string[]`. */
function toAttributeSpecOptions(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const options: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      options.push(item);
    } else if (item !== null && typeof item === 'object' && 'value' in item) {
      const option = item as { value: unknown };
      if (typeof option.value === 'string') {
        options.push(option.value);
      }
    }
  }
  return options.length > 0 ? options : null;
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
