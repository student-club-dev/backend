import { ApiProperty } from '@nestjs/swagger';
import { TradeCenterFieldDto } from '../../../trade-centers/presentation/dto/trade-center-field.dto';
import { AdminTradeCenterDetail } from '../../domain/entities/admin-trade-center.entity';
import { TradeCenterStatus } from '../../domain/enums/trade-center-status.enum';

/**
 * AdminTradeCenterDto — a trade center as the admin panel sees it: `status` + `sortOrder` (so
 * INACTIVE centers are visible/manageable) plus its dynamic fields (reusing {@link TradeCenterFieldDto}).
 */
export class AdminTradeCenterDto {
  @ApiProperty({ example: 'tc_abusaxiy' })
  id!: string;

  @ApiProperty({ example: 'Abu Saxiy' })
  name!: string;

  @ApiProperty({ example: 'abu-saxiy' })
  slug!: string;

  @ApiProperty({ enum: TradeCenterStatus, enumName: 'TradeCenterStatusDto' })
  status!: TradeCenterStatus;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty({
    type: () => [TradeCenterFieldDto],
    description: 'The dynamic fields, in display order (sortOrder).',
  })
  fields!: TradeCenterFieldDto[];

  static fromDomain(center: AdminTradeCenterDetail): AdminTradeCenterDto {
    const dto = new AdminTradeCenterDto();
    dto.id = center.id;
    dto.name = center.name;
    dto.slug = center.slug;
    dto.status = center.status;
    dto.sortOrder = center.sortOrder;
    dto.fields = center.fields.map(TradeCenterFieldDto.fromDomain);
    return dto;
  }
}
