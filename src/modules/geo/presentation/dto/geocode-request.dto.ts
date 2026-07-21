import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** GeocodeRequestDto — free-text address search (matches elon-uz.json). */
export class GeocodeRequestDto {
  @ApiProperty({ example: 'Chilonzor 9-kvartal 42' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  query!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Restrict the search to a region' })
  @IsOptional()
  @IsString()
  regionId?: string;
}
