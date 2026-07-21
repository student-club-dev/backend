import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { TradeCenter, TradeCenterWithFields } from '../domain/entities/trade-center.entity';
import { TRADE_CENTER_REPOSITORY, TradeCenterRepository } from '../domain/trade-center.repository';

/**
 * Trade-center use-cases. Serves read-only reference data (centers and their dynamic fields).
 * Depends on the repository interface only.
 */
@Injectable()
export class TradeCentersService {
  constructor(
    @Inject(TRADE_CENTER_REPOSITORY) private readonly tradeCenters: TradeCenterRepository,
  ) {}

  /** ACTIVE centers, ordered by sortOrder then name. */
  async list(): Promise<TradeCenter[]> {
    return this.tradeCenters.findActive();
  }

  /** One ACTIVE center with its fields. Unknown / INACTIVE id → 404. */
  async get(id: string): Promise<TradeCenterWithFields> {
    const center = await this.tradeCenters.findActiveByIdWithFields(id);
    if (center === null) {
      throw AppException.notFound(ERROR_CODE.TRADE_CENTER_NOT_FOUND, 'Savdo markazi topilmadi');
    }
    return center;
  }
}
