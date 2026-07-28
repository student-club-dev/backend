import { TradeCenterField } from '../../trade-centers/domain/entities/trade-center.entity';
import { TradeCenterFieldType } from '../../trade-centers/domain/enums/trade-center-field-type.enum';
import { AdminTradeCenterDetail } from './entities/admin-trade-center.entity';
import { TradeCenterStatus } from './enums/trade-center-status.enum';

/** Injection token for the admin trade-center write port (bound to the Prisma impl in the module). */
export const ADMIN_TRADE_CENTER_WRITE_REPOSITORY = Symbol('ADMIN_TRADE_CENTER_WRITE_REPOSITORY');

/** Writable fields of a trade center (`id` is generated on create). */
export interface TradeCenterWrite {
  name: string;
  slug: string;
  status: TradeCenterStatus;
  sortOrder: number;
}

/** Writable fields of a trade-center field (`id` is generated, `tradeCenterId` passed separately). */
export interface TradeCenterFieldWrite {
  label: string;
  type: TradeCenterFieldType;
  required: boolean;
  sortOrder: number;
}

/** Unscoped write + admin-read access to the trade-center tables for the admin panel. Prisma-backed. */
export interface AdminTradeCenterWriteRepository {
  // -- centers --------------------------------------------------------------
  /** All centers (any status) with their fields, ordered by sortOrder then name. */
  findAll(): Promise<AdminTradeCenterDetail[]>;

  /** One center (any status) with its fields, or `null` when it does not exist. */
  findByIdWithFields(id: string): Promise<AdminTradeCenterDetail | null>;

  /** The id of the center owning this slug, or `null` when the slug is free (uniqueness guard). */
  findIdBySlug(slug: string): Promise<string | null>;

  /** Inserts a center and returns it with its (empty) fields. */
  create(data: TradeCenterWrite): Promise<AdminTradeCenterDetail>;

  /** Updates a center (only the present keys) and returns it with its fields. Caller ensures it exists. */
  update(id: string, data: Partial<TradeCenterWrite>): Promise<AdminTradeCenterDetail>;

  /** Deletes a center. Caller ensures nothing references it. */
  delete(id: string): Promise<void>;

  /** Number of branches referencing this center (delete guard). */
  countBranches(id: string): Promise<number>;

  // -- fields ---------------------------------------------------------------
  /** The field with this id scoped to `centerId`, or `null` when it does not exist there. */
  findField(centerId: string, fieldId: string): Promise<TradeCenterField | null>;

  /** Inserts a field under `centerId` and returns it. Caller ensures the center exists. */
  createField(centerId: string, data: TradeCenterFieldWrite): Promise<TradeCenterField>;

  /** Updates a field (only the present keys) and returns it. Caller ensures it exists. */
  updateField(fieldId: string, data: Partial<TradeCenterFieldWrite>): Promise<TradeCenterField>;

  /** Deletes a field. Caller ensures no branch has a value for it. */
  deleteField(fieldId: string): Promise<void>;

  /** Number of branch values referencing this field (delete guard). */
  countFieldValues(fieldId: string): Promise<number>;
}
