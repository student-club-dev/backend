import { IsOptional, IsString } from 'class-validator';

/** Query for GET /districts. `regionId` filters by region; documented per route via `@ApiQuery`. */
export class DistrictQueryDto {
  @IsOptional()
  @IsString()
  regionId?: string;
}
