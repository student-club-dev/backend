import { ApiProperty } from '@nestjs/swagger';
import { TradeCenterField } from '../../domain/entities/trade-center.entity';
import { TradeCenterFieldType } from '../../domain/enums/trade-center-field-type.enum';

/** TradeCenterFieldDto — one dynamic field a branch fills in for a trade center. */
export class TradeCenterFieldDto {
  @ApiProperty({ example: 'f_qator' })
  id!: string;

  @ApiProperty({ example: 'Qator' })
  label!: string;

  @ApiProperty({ enum: TradeCenterFieldType, enumName: 'TradeCenterFieldTypeDto' })
  type!: TradeCenterFieldType;

  @ApiProperty({ example: true })
  required!: boolean;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  static fromDomain(field: TradeCenterField): TradeCenterFieldDto {
    const dto = new TradeCenterFieldDto();
    dto.id = field.id;
    dto.label = field.label;
    dto.type = field.type;
    dto.required = field.required;
    dto.sortOrder = field.sortOrder;
    return dto;
  }
}
