import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { TradeCenter, TradeCenterWithFields } from '../domain/entities/trade-center.entity';
import { TradeCenterFieldType } from '../domain/enums/trade-center-field-type.enum';
import { TradeCenterRepository } from '../domain/trade-center.repository';
import { TradeCentersService } from './trade-centers.service';

/** ACTIVE centers as the repository returns them: already ordered by sortOrder then name. */
const ACTIVE_CENTERS: TradeCenter[] = [
  { id: 'tc_abusaxiy', name: 'Abu Saxiy', slug: 'abu-saxiy' },
  { id: 'tc_bekbaraka', name: 'Bek Baraka', slug: 'bek-baraka' },
];

/** One center with its fields as the repository returns them: ordered by sortOrder. */
const ABU_SAXIY: TradeCenterWithFields = {
  id: 'tc_abusaxiy',
  name: 'Abu Saxiy',
  slug: 'abu-saxiy',
  fields: [
    {
      id: 'f_qator',
      label: 'Qator',
      type: TradeCenterFieldType.TEXT,
      required: true,
      sortOrder: 0,
    },
    {
      id: 'f_pavilon',
      label: 'Pavilon',
      type: TradeCenterFieldType.TEXT,
      required: true,
      sortOrder: 1,
    },
    {
      id: 'f_qavat',
      label: 'Qavat',
      type: TradeCenterFieldType.NUMBER,
      required: false,
      sortOrder: 2,
    },
  ],
};

function makeRepository(overrides: Partial<TradeCenterRepository> = {}): TradeCenterRepository {
  return {
    findActive: jest.fn().mockResolvedValue(ACTIVE_CENTERS),
    findActiveByIdWithFields: jest.fn().mockResolvedValue(ABU_SAXIY),
    ...overrides,
  };
}

describe('TradeCentersService', () => {
  describe('list', () => {
    it('returns the ACTIVE centers in the repository order (sortOrder then name)', async () => {
      const repository = makeRepository();
      const service = new TradeCentersService(repository);

      const result = await service.list();

      expect(result).toEqual(ACTIVE_CENTERS);
      expect(repository.findActive).toHaveBeenCalledTimes(1);
    });
  });

  describe('get', () => {
    it('returns the center with its fields in sortOrder', async () => {
      const service = new TradeCentersService(makeRepository());

      const result = await service.get('tc_abusaxiy');

      expect(result.id).toBe('tc_abusaxiy');
      expect(result.fields.map((field) => field.id)).toEqual(['f_qator', 'f_pavilon', 'f_qavat']);
    });

    it('throws 404 TRADE_CENTER_NOT_FOUND when the center is unknown or INACTIVE', async () => {
      const repository = makeRepository({
        findActiveByIdWithFields: jest.fn().mockResolvedValue(null),
      });
      const service = new TradeCentersService(repository);

      await expect(service.get('missing')).rejects.toBeInstanceOf(AppException);
      await expect(service.get('missing')).rejects.toMatchObject({
        code: ERROR_CODE.TRADE_CENTER_NOT_FOUND,
        status: 404,
      });
    });
  });
});
