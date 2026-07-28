import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { TradeCenterWrite } from '../../domain/admin-trade-center-write.repository';
import { TradeCenterStatus } from '../../domain/enums/trade-center-status.enum';

/**
 * AdminUpdateTradeCenterDto — admin partial update of a trade center. `id` is the PK (path param).
 * Only the present keys are written; an absent field is left unchanged.
 */
export class AdminUpdateTradeCenterDto {
  @ApiPropertyOptional({ example: 'Abu Saxiy' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ description: 'Unique slug (a–z, 0–9, dashes)', example: 'abu-saxiy' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug faqat a–z, 0–9 va tire bo‘lishi kerak' })
  slug?: string;

  @ApiPropertyOptional({ enum: TradeCenterStatus, enumName: 'TradeCenterStatusDto' })
  @IsOptional()
  @IsEnum(TradeCenterStatus)
  status?: TradeCenterStatus;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** Only the present keys — an absent field is left unchanged. */
  toWrite(): Partial<TradeCenterWrite> {
    const write: Partial<TradeCenterWrite> = {};
    if (this.name !== undefined) {
      write.name = this.name;
    }
    if (this.slug !== undefined) {
      write.slug = this.slug;
    }
    if (this.status !== undefined) {
      write.status = this.status;
    }
    if (this.sortOrder !== undefined) {
      write.sortOrder = this.sortOrder;
    }
    return write;
  }
}
