import { ApiProperty } from '@nestjs/swagger';
import { TradeCenterFieldType } from '../../../trade-centers/domain/enums/trade-center-field-type.enum';
import {
  BranchTradeCenter,
  BranchTradeCenterFieldValue,
} from '../../domain/entities/branch.entity';

/** BranchTradeCenterDto — the trade center a branch sits in (id + name). */
export class BranchTradeCenterDto {
  @ApiProperty({ example: 'tc_abusaxiy' })
  id!: string;

  @ApiProperty({ example: 'Abu Saxiy' })
  name!: string;

  static fromDomain(tradeCenter: BranchTradeCenter): BranchTradeCenterDto {
    const dto = new BranchTradeCenterDto();
    dto.id = tradeCenter.id;
    dto.name = tradeCenter.name;
    return dto;
  }
}

/** BranchTradeCenterFieldDto — a resolved trade-center field value on a branch. */
export class BranchTradeCenterFieldDto {
  @ApiProperty({ example: 'Qator' })
  label!: string;

  @ApiProperty({ enum: TradeCenterFieldType, enumName: 'TradeCenterFieldTypeDto' })
  type!: TradeCenterFieldType;

  @ApiProperty({ example: 'A' })
  value!: string;

  static fromDomain(field: BranchTradeCenterFieldValue): BranchTradeCenterFieldDto {
    const dto = new BranchTradeCenterFieldDto();
    dto.label = field.label;
    dto.type = field.type;
    dto.value = field.value;
    return dto;
  }
}
