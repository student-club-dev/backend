import { ApiProperty } from '@nestjs/swagger';
import { MetroStation } from '../../domain/entities/metro-station.entity';

/** MetroStationDto — one Tashkent metro station. */
export class MetroStationDto {
  @ApiProperty({ example: 'CHILONZOR' })
  id!: string;

  @ApiProperty({ example: 'Chilonzor' })
  nameUz!: string;

  @ApiProperty({ type: String, required: false, nullable: true, example: 'Чиланзар' })
  nameRu!: string | null;

  @ApiProperty({
    example: 'CHILONZOR',
    description:
      'Line key (CHILONZOR | OZBEKISTON | YUNUSOBOD | HALQA) — group by this, not by name',
  })
  line!: string;

  @ApiProperty({ example: 41.27436 })
  lat!: number;

  @ApiProperty({ example: 69.20497 })
  lng!: number;

  static fromDomain(station: MetroStation): MetroStationDto {
    const dto = new MetroStationDto();
    dto.id = station.id;
    dto.nameUz = station.nameUz;
    dto.nameRu = station.nameRu;
    dto.line = station.line;
    dto.lat = station.lat;
    dto.lng = station.lng;
    return dto;
  }
}
