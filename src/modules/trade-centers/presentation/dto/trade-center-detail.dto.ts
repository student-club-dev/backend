import { ApiProperty } from '@nestjs/swagger';
import { TradeCenterWithFields } from '../../domain/entities/trade-center.entity';
import { TradeCenterFieldDto } from './trade-center-field.dto';

/** TradeCenterDetailDto — a trade center with its dynamic fields (the branch form definition). */
export class TradeCenterDetailDto {
  @ApiProperty({ example: 'tc_abusaxiy' })
  id!: string;

  @ApiProperty({ example: 'Abu Saxiy' })
  name!: string;

  @ApiProperty({ example: 'abu-saxiy' })
  slug!: string;

  @ApiProperty({
    type: () => [TradeCenterFieldDto],
    description: 'The dynamic fields, in display order (sortOrder).',
  })
  fields!: TradeCenterFieldDto[];

  static fromDomain(center: TradeCenterWithFields): TradeCenterDetailDto {
    const dto = new TradeCenterDetailDto();
    dto.id = center.id;
    dto.name = center.name;
    dto.slug = center.slug;
    dto.fields = center.fields.map(TradeCenterFieldDto.fromDomain);
    return dto;
  }
}
