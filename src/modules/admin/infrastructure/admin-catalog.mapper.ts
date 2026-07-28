import {
  Prisma,
  AttributeKind as PrismaAttributeKind,
  Gender as PrismaGender,
  type AttributeSpec as AttributeSpecRow,
  type Category as CategoryRow,
} from '@prisma/client';
import { AttributeOption } from '../../catalog/domain/entities/category.entity';
import { AttributeFieldType } from '../../catalog/domain/enums/attribute-field-type.enum';
import { Gender } from '../../catalog/domain/enums/gender.enum';
import {
  AttributeSpecUpdate,
  AttributeSpecWrite,
  CategoryUpdate,
  CategoryWrite,
} from '../domain/admin-catalog-write.repository';
import { AdminAttributeSpec } from '../domain/entities/admin-attribute-spec.entity';
import { AdminCategory } from '../domain/entities/admin-category.entity';

/**
 * Maps Prisma rows to admin catalog domain entities and admin write payloads to Prisma data. The
 * Prisma enums carry the same wire values as the domain enums, so they are looked up by key.
 * Attribute `options` is stored as JSON; it is served as `{ value, label }[]`.
 */
export class AdminCatalogMapper {
  static toAdminCategory(row: CategoryRow): AdminCategory {
    return {
      id: row.id,
      businessType: row.businessType,
      gender: row.gender === null ? null : Gender[row.gender],
      key: row.key,
      nameUz: row.nameUz,
      nameRu: row.nameRu,
      iconUrl: row.iconUrl,
      sortOrder: row.sortOrder,
      requiresCustomName: row.requiresCustomName,
    };
  }

  static toCategoryCreateData(data: CategoryWrite): Prisma.CategoryUncheckedCreateInput {
    return {
      businessType: data.businessType,
      gender: data.gender === null ? null : PrismaGender[data.gender],
      key: data.key,
      nameUz: data.nameUz,
      nameRu: data.nameRu,
      iconUrl: data.iconUrl,
      sortOrder: data.sortOrder,
      requiresCustomName: data.requiresCustomName,
    };
  }

  static toCategoryUpdateData(data: CategoryUpdate): Prisma.CategoryUpdateInput {
    const update: Prisma.CategoryUpdateInput = {};
    if (data.nameUz !== undefined) {
      update.nameUz = data.nameUz;
    }
    if (data.nameRu !== undefined) {
      update.nameRu = data.nameRu;
    }
    if (data.iconUrl !== undefined) {
      update.iconUrl = data.iconUrl;
    }
    if (data.sortOrder !== undefined) {
      update.sortOrder = data.sortOrder;
    }
    if (data.requiresCustomName !== undefined) {
      update.requiresCustomName = data.requiresCustomName;
    }
    return update;
  }

  static toAdminAttributeSpec(row: AttributeSpecRow): AdminAttributeSpec {
    return {
      id: row.id,
      businessType: row.businessType,
      categoryKey: row.categoryKey,
      key: row.key,
      label: row.label,
      kind: AttributeFieldType[row.kind],
      required: row.required,
      hint: row.hint,
      suffix: row.suffix,
      multiple: row.multiple,
      options: toAttributeOptions(row.options),
      sortOrder: row.sortOrder,
    };
  }

  static toAttributeSpecCreateData(
    data: AttributeSpecWrite,
  ): Prisma.AttributeSpecUncheckedCreateInput {
    return {
      businessType: data.businessType,
      categoryKey: data.categoryKey,
      key: data.key,
      label: data.label,
      kind: PrismaAttributeKind[data.kind],
      required: data.required,
      hint: data.hint,
      suffix: data.suffix,
      multiple: data.multiple,
      options: optionsToJson(data.options),
      sortOrder: data.sortOrder,
    };
  }

  static toAttributeSpecUpdateData(data: AttributeSpecUpdate): Prisma.AttributeSpecUpdateInput {
    const update: Prisma.AttributeSpecUpdateInput = {};
    if (data.label !== undefined) {
      update.label = data.label;
    }
    if (data.kind !== undefined) {
      update.kind = PrismaAttributeKind[data.kind];
    }
    if (data.required !== undefined) {
      update.required = data.required;
    }
    if (data.hint !== undefined) {
      update.hint = data.hint;
    }
    if (data.suffix !== undefined) {
      update.suffix = data.suffix;
    }
    if (data.multiple !== undefined) {
      update.multiple = data.multiple;
    }
    if (data.options !== undefined) {
      update.options = optionsToJson(data.options);
    }
    if (data.sortOrder !== undefined) {
      update.sortOrder = data.sortOrder;
    }
    return update;
  }
}

/** `{ value, label }[]` → JSON column value; `null` clears the column (Prisma `JsonNull`). */
function optionsToJson(
  options: AttributeOption[] | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (options === null) {
    return Prisma.JsonNull;
  }
  return options.map((option) => ({ value: option.value, label: option.label }));
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
