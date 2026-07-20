import { AttributeFieldType } from '../enums/attribute-field-type.enum';
import { Gender } from '../enums/gender.enum';

/** A single SELECT / MULTI_SELECT option. */
export interface AttributeOption {
  value: string;
  label: string;
}

/** One field of the dynamic listing form, shown when a category is selected. */
export interface AttributeField {
  key: string;
  label: string;
  type: AttributeFieldType;
  required: boolean;
  hint: string | null;
  suffix: string | null;
  multiple: boolean | null;
  options: AttributeOption[] | null;
}

/**
 * A category and the fields shown when it is selected.
 *
 * `gender` distinguishes the type's base list (null) from per-gender lists (CLOTHING).
 * It is used only for filtering and is NOT part of the wire DTO — the presentation layer
 * projects this entity to CategoryDto.
 */
export interface Category {
  key: string;
  businessType: string;
  nameUz: string;
  nameRu: string | null;
  iconUrl: string | null;
  sortOrder: number;
  requiresCustomName: boolean;
  fields: AttributeField[];
  gender: Gender | null;
}
