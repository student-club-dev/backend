import { IsEnum, IsOptional } from 'class-validator';
import { Gender } from '../../domain/enums/gender.enum';

/** Shared `?gender=` query for the catalog endpoints. Documented per route via `@ApiQuery`. */
export class GenderQueryDto {
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}
