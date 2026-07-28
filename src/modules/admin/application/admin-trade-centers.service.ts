import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { TradeCenterField } from '../../trade-centers/domain/entities/trade-center.entity';
import {
  ADMIN_TRADE_CENTER_WRITE_REPOSITORY,
  AdminTradeCenterWriteRepository,
  TradeCenterFieldWrite,
  TradeCenterWrite,
} from '../domain/admin-trade-center-write.repository';
import { AdminTradeCenterDetail } from '../domain/entities/admin-trade-center.entity';

/**
 * Admin CRUD for trade centers (savdo markazlari) and their dynamic fields (Faza 4). Unlike the
 * public read (ACTIVE only), lists/returns centers of any status. Enforces slug-uniqueness (409),
 * existence (404) and referential-integrity (409) rules; both AdminJwtGuard + AdminRoleGuard (ADMIN)
 * authorise the caller. Depends on the trade-center write repository interface only.
 */
@Injectable()
export class AdminTradeCentersService {
  constructor(
    @Inject(ADMIN_TRADE_CENTER_WRITE_REPOSITORY)
    private readonly tradeCenters: AdminTradeCenterWriteRepository,
  ) {}

  // -- centers --------------------------------------------------------------

  /** All centers (any status) with their fields. */
  async list(): Promise<AdminTradeCenterDetail[]> {
    return this.tradeCenters.findAll();
  }

  /** One center (any status) with its fields (404 TRADE_CENTER_NOT_FOUND). */
  async get(id: string): Promise<AdminTradeCenterDetail> {
    return this.assertCenterExists(id);
  }

  /** Creates a center. The `slug` must be free (else 409 TRADE_CENTER_SLUG_EXISTS). */
  async create(data: TradeCenterWrite): Promise<AdminTradeCenterDetail> {
    if ((await this.tradeCenters.findIdBySlug(data.slug)) !== null) {
      throw this.slugExists();
    }
    return this.tradeCenters.create(data);
  }

  /** Updates an existing center (404); a slug change must not collide with another center (409). */
  async update(id: string, data: Partial<TradeCenterWrite>): Promise<AdminTradeCenterDetail> {
    await this.assertCenterExists(id);
    if (data.slug !== undefined) {
      const owner = await this.tradeCenters.findIdBySlug(data.slug);
      if (owner !== null && owner !== id) {
        throw this.slugExists();
      }
    }
    return this.tradeCenters.update(id, data);
  }

  /** Deletes a center — only when no branch references it (else 409 TRADE_CENTER_IN_USE). */
  async delete(id: string): Promise<void> {
    await this.assertCenterExists(id);
    if ((await this.tradeCenters.countBranches(id)) > 0) {
      throw AppException.conflict(
        ERROR_CODE.TRADE_CENTER_IN_USE,
        'Bu savdo markazi ishlatilmoqda, uni o‘chirib bo‘lmaydi',
      );
    }
    await this.tradeCenters.delete(id);
  }

  // -- fields ---------------------------------------------------------------

  /** Adds a field to a center (404 TRADE_CENTER_NOT_FOUND if the center is unknown). */
  async createField(centerId: string, data: TradeCenterFieldWrite): Promise<TradeCenterField> {
    await this.assertCenterExists(centerId);
    return this.tradeCenters.createField(centerId, data);
  }

  /** Updates a field of a center (404 if the center or field is unknown). */
  async updateField(
    centerId: string,
    fieldId: string,
    data: Partial<TradeCenterFieldWrite>,
  ): Promise<TradeCenterField> {
    await this.assertFieldExists(centerId, fieldId);
    return this.tradeCenters.updateField(fieldId, data);
  }

  /**
   * Deletes a field of a center — only when no branch has a value for it (else 409
   * TRADE_CENTER_FIELD_IN_USE). 404 if the center or field is unknown.
   */
  async deleteField(centerId: string, fieldId: string): Promise<void> {
    await this.assertFieldExists(centerId, fieldId);
    if ((await this.tradeCenters.countFieldValues(fieldId)) > 0) {
      throw AppException.conflict(
        ERROR_CODE.TRADE_CENTER_FIELD_IN_USE,
        'Bu maydon ishlatilmoqda, uni o‘chirib bo‘lmaydi',
      );
    }
    await this.tradeCenters.deleteField(fieldId);
  }

  private async assertCenterExists(id: string): Promise<AdminTradeCenterDetail> {
    const center = await this.tradeCenters.findByIdWithFields(id);
    if (center === null) {
      throw AppException.notFound(ERROR_CODE.TRADE_CENTER_NOT_FOUND, 'Savdo markazi topilmadi');
    }
    return center;
  }

  private async assertFieldExists(centerId: string, fieldId: string): Promise<void> {
    if ((await this.tradeCenters.findField(centerId, fieldId)) === null) {
      throw AppException.notFound(ERROR_CODE.TRADE_CENTER_FIELD_NOT_FOUND, 'Maydon topilmadi');
    }
  }

  private slugExists(): AppException {
    return AppException.conflict(ERROR_CODE.TRADE_CENTER_SLUG_EXISTS, 'Bu slug allaqachon band');
  }
}
