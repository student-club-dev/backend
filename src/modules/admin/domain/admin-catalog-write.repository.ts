import { AttributeOption } from '../../catalog/domain/entities/category.entity';
import { CatalogGroup } from '../../catalog/domain/entities/catalog-group.entity';
import { AttributeFieldType } from '../../catalog/domain/enums/attribute-field-type.enum';
import { Gender } from '../../catalog/domain/enums/gender.enum';
import { AdminAttributeSpec } from './entities/admin-attribute-spec.entity';
import { AdminCategory } from './entities/admin-category.entity';

/** Injection token for the admin catalog write port (bound to the Prisma impl in the module). */
export const ADMIN_CATALOG_WRITE_REPOSITORY = Symbol('ADMIN_CATALOG_WRITE_REPOSITORY');

/** Writable fields of a catalog group (`key` — the string PK — is passed separately on create). */
export interface CatalogGroupWrite {
  nameUz: string;
  nameRu: string | null;
  emoji: string | null;
  icon: string | null;
  accentColor: string | null;
  sortOrder: number;
}

/** Writable fields of a category (`id` is generated on create). Identity is `[businessType, gender, key]`. */
export interface CategoryWrite {
  businessType: string;
  gender: Gender | null;
  key: string;
  nameUz: string;
  nameRu: string | null;
  iconUrl: string | null;
  sortOrder: number;
  requiresCustomName: boolean;
}

/** Updatable fields of a category — its identity (`businessType`, `gender`, `key`) is immutable. */
export interface CategoryUpdate {
  nameUz?: string;
  nameRu?: string | null;
  iconUrl?: string | null;
  sortOrder?: number;
  requiresCustomName?: boolean;
}

/** Writable fields of an attribute spec (`id` is generated). Identity is `[businessType, categoryKey, key]`. */
export interface AttributeSpecWrite {
  businessType: string;
  categoryKey: string | null;
  key: string;
  label: string;
  kind: AttributeFieldType;
  required: boolean;
  hint: string | null;
  suffix: string | null;
  multiple: boolean | null;
  options: AttributeOption[] | null;
  sortOrder: number;
}

/** Updatable fields of an attribute spec — its identity (`businessType`, `categoryKey`, `key`) is immutable. */
export interface AttributeSpecUpdate {
  label?: string;
  kind?: AttributeFieldType;
  required?: boolean;
  hint?: string | null;
  suffix?: string | null;
  multiple?: boolean | null;
  options?: AttributeOption[] | null;
  sortOrder?: number;
}

/**
 * Unscoped write access to the catalog config tables (`catalog_groups`, `categories`,
 * `attribute_specs`) for the admin panel. One port for the three config aggregates, mirroring the
 * geo write port. Prisma-backed; the public catalog reads keep using the catalog module's port.
 */
export interface AdminCatalogWriteRepository {
  /** Whether a business type with this key exists (create guard for categories + attribute specs). */
  businessTypeExists(type: string): Promise<boolean>;

  // -- catalog groups -------------------------------------------------------
  /** The group with this key (incl. its member type keys), or `null` when it does not exist. */
  findGroupByKey(key: string): Promise<CatalogGroup | null>;

  /** Inserts a group and returns it. Caller ensures the key is free. */
  createGroup(key: string, data: CatalogGroupWrite): Promise<CatalogGroup>;

  /** Updates a group (only the present keys). Caller ensures it exists. */
  updateGroup(key: string, data: Partial<CatalogGroupWrite>): Promise<CatalogGroup>;

  /** Deletes a group. Caller ensures no business type references it. */
  deleteGroup(key: string): Promise<void>;

  /** Number of business types belonging to this group (delete guard). */
  countBusinessTypesInGroup(key: string): Promise<number>;

  // -- categories -----------------------------------------------------------
  /** The category with this id, or `null` when it does not exist. */
  findCategoryById(id: string): Promise<AdminCategory | null>;

  /** The category with this `[businessType, gender, key]` identity, or `null` (uniqueness guard). */
  findCategoryByUnique(
    businessType: string,
    gender: Gender | null,
    key: string,
  ): Promise<AdminCategory | null>;

  /** Inserts a category and returns it. Caller ensures the type exists and the identity is free. */
  createCategory(data: CategoryWrite): Promise<AdminCategory>;

  /** Updates a category (only the present keys). Caller ensures it exists. */
  updateCategory(id: string, data: CategoryUpdate): Promise<AdminCategory>;

  /** Deletes a category. Caller ensures no listing references it. */
  deleteCategory(id: string): Promise<void>;

  /** Number of listings under a business of `businessType` using category `key` (delete guard). */
  countListingsUsingCategory(businessType: string, key: string): Promise<number>;

  // -- attribute specs ------------------------------------------------------
  /** The attribute spec with this id, or `null` when it does not exist. */
  findAttributeSpecById(id: string): Promise<AdminAttributeSpec | null>;

  /** The spec with this `[businessType, categoryKey, key]` identity, or `null` (uniqueness guard). */
  findAttributeSpecByUnique(
    businessType: string,
    categoryKey: string | null,
    key: string,
  ): Promise<AdminAttributeSpec | null>;

  /** Inserts an attribute spec and returns it. Caller ensures the type exists and the identity is free. */
  createAttributeSpec(data: AttributeSpecWrite): Promise<AdminAttributeSpec>;

  /** Updates an attribute spec (only the present keys). Caller ensures it exists. */
  updateAttributeSpec(id: string, data: AttributeSpecUpdate): Promise<AdminAttributeSpec>;

  /** Deletes an attribute spec. Attributes are loose JSON on listings — no reliable in-use guard. */
  deleteAttributeSpec(id: string): Promise<void>;
}
