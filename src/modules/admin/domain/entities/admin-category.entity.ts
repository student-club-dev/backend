import { Gender } from '../../../catalog/domain/enums/gender.enum';

/**
 * A category as the admin panel sees it — the raw row, including the surrogate `id` (the PK the
 * admin CRUD addresses it by) and `gender` (which the public {@link Category} projection hides). No
 * form fields are attached; those are managed as attribute specs.
 */
export interface AdminCategory {
  id: string;
  businessType: string;
  gender: Gender | null;
  key: string;
  nameUz: string;
  nameRu: string | null;
  iconUrl: string | null;
  sortOrder: number;
  requiresCustomName: boolean;
}
