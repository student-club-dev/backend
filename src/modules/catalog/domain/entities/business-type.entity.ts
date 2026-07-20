import { Gender } from '../enums/gender.enum';
import { PriceUnit } from '../enums/price-unit.enum';

/**
 * A business type (data-driven, not an enum).
 *
 * `availableForGenders` drives the personalised `GET /business/types` filter and is NOT
 * part of the wire DTO — the presentation layer projects this entity to BusinessTypeInfoDto.
 */
export interface BusinessType {
  type: string;
  nameUz: string;
  nameRu: string | null;
  iconUrl: string | null;
  emoji: string | null;
  accentColor: string | null;
  defaultPriceUnit: PriceUnit;
  priceUnits: PriceUnit[];
  availableForGenders: Gender[];
}
