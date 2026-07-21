import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { BranchTradeCenterFieldInput } from '../../domain/entities/branch.entity';

/** One submitted value for a trade-center field (part of BranchRequestDto.tradeCenterFields). */
export class BranchTradeCenterFieldInputDto {
  @ApiProperty({ example: 'f_qator', description: 'A field id of the selected trade center' })
  @IsString()
  @IsNotEmpty()
  fieldId!: string;

  @ApiProperty({ example: 'A' })
  @IsString()
  value!: string;

  toDomain(): BranchTradeCenterFieldInput {
    return { fieldId: this.fieldId, value: this.value };
  }
}
