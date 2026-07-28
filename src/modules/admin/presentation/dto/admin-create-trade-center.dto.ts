import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { TradeCenterWrite } from '../../domain/admin-trade-center-write.repository';
import { TradeCenterStatus } from '../../domain/enums/trade-center-status.enum';

/** AdminCreateTradeCenterDto — admin body to add a trade center (id is generated server-side). */
export class AdminCreateTradeCenterDto {
  @ApiProperty({ example: 'Abu Saxiy' })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiProperty({ description: 'Unique slug (a–z, 0–9, dashes)', example: 'abu-saxiy' })
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug faqat a–z, 0–9 va tire bo‘lishi kerak' })
  slug!: string;

  @ApiPropertyOptional({
    enum: TradeCenterStatus,
    enumName: 'TradeCenterStatusDto',
    default: TradeCenterStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(TradeCenterStatus)
  status?: TradeCenterStatus;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** Normalises to the write payload, applying the ACTIVE / 0 defaults. */
  toWrite(): TradeCenterWrite {
    return {
      name: this.name,
      slug: this.slug,
      status: this.status ?? TradeCenterStatus.ACTIVE,
      sortOrder: this.sortOrder ?? 0,
    };
  }
}
