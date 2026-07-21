import { ApiProperty } from '@nestjs/swagger';
import { TradeCenter } from '../../domain/entities/trade-center.entity';

/** TradeCenterDto — a trade center in the list response. */
export class TradeCenterDto {
  @ApiProperty({ example: 'tc_abusaxiy' })
  id!: string;

  @ApiProperty({ example: 'Abu Saxiy' })
  name!: string;

  @ApiProperty({ example: 'abu-saxiy' })
  slug!: string;

  static fromDomain(center: TradeCenter): TradeCenterDto {
    const dto = new TradeCenterDto();
    dto.id = center.id;
    dto.name = center.name;
    dto.slug = center.slug;
    return dto;
  }
}
