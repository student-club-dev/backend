import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { CategoryUpdate } from '../../domain/admin-catalog-write.repository';

/**
 * AdminUpdateCategoryDto — admin partial update of a category. Its identity (`businessType`,
 * `gender`, `key`) and `id` are immutable. Only the present keys are written.
 */
export class AdminUpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Pitsa' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  nameUz?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  nameRu?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  iconUrl?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'True for OTHER — the client then requires customCategoryName.',
  })
  @IsOptional()
  @IsBoolean()
  requiresCustomName?: boolean;

  /** Only the present keys — an absent field is left unchanged. */
  toUpdate(): CategoryUpdate {
    const update: CategoryUpdate = {};
    if (this.nameUz !== undefined) {
      update.nameUz = this.nameUz;
    }
    if (this.nameRu !== undefined) {
      update.nameRu = this.nameRu;
    }
    if (this.iconUrl !== undefined) {
      update.iconUrl = this.iconUrl;
    }
    if (this.sortOrder !== undefined) {
      update.sortOrder = this.sortOrder;
    }
    if (this.requiresCustomName !== undefined) {
      update.requiresCustomName = this.requiresCustomName;
    }
    return update;
  }
}
