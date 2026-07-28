import { AttributeOption } from '../../../catalog/domain/entities/category.entity';
import { AttributeFieldType } from '../../../catalog/domain/enums/attribute-field-type.enum';

/**
 * An attribute spec as the admin panel sees it — the full row, including the surrogate `id` (the PK
 * the admin CRUD addresses it by) and the `categoryKey` scope (null = a type-level attribute).
 * `options` is normalised to `{ value, label }[]` (the shape the listing form is served).
 */
export interface AdminAttributeSpec {
  id: string;
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
