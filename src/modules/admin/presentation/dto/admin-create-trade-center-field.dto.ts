import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { TradeCenterFieldType } from '../../../trade-centers/domain/enums/trade-center-field-type.enum';
import { TradeCenterFieldWrite } from '../../domain/admin-trade-center-write.repository';

/** AdminCreateTradeCenterFieldDto — admin body to add a dynamic field to a trade center. */
export class AdminCreateTradeCenterFieldDto {
  @ApiProperty({ example: 'Qator' })
  @IsString()
  @Length(1, 120)
  label!: string;

  @ApiProperty({
    enum: TradeCenterFieldType,
    enumName: 'TradeCenterFieldTypeDto',
    default: TradeCenterFieldType.TEXT,
  })
  @IsEnum(TradeCenterFieldType)
  type!: TradeCenterFieldType;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** Normalises to the write payload, applying the false / 0 defaults. */
  toWrite(): TradeCenterFieldWrite {
    return {
      label: this.label,
      type: this.type,
      required: this.required ?? false,
      sortOrder: this.sortOrder ?? 0,
    };
  }
}
