import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { TradeCenterFieldType } from '../../../trade-centers/domain/enums/trade-center-field-type.enum';
import { TradeCenterFieldWrite } from '../../domain/admin-trade-center-write.repository';

/**
 * AdminUpdateTradeCenterFieldDto — admin partial update of a dynamic field. Only the present keys
 * are written; an absent field is left unchanged.
 */
export class AdminUpdateTradeCenterFieldDto {
  @ApiPropertyOptional({ example: 'Qator' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string;

  @ApiPropertyOptional({ enum: TradeCenterFieldType, enumName: 'TradeCenterFieldTypeDto' })
  @IsOptional()
  @IsEnum(TradeCenterFieldType)
  type?: TradeCenterFieldType;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** Only the present keys — an absent field is left unchanged. */
  toWrite(): Partial<TradeCenterFieldWrite> {
    const write: Partial<TradeCenterFieldWrite> = {};
    if (this.label !== undefined) {
      write.label = this.label;
    }
    if (this.type !== undefined) {
      write.type = this.type;
    }
    if (this.required !== undefined) {
      write.required = this.required;
    }
    if (this.sortOrder !== undefined) {
      write.sortOrder = this.sortOrder;
    }
    return write;
  }
}
