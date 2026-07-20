import { ApiProperty } from '@nestjs/swagger';

/** Result of a successful password reset (D5). */
export class ResetPasswordResultDto {
  @ApiProperty({ example: true })
  reset!: boolean;

  static done(): ResetPasswordResultDto {
    const dto = new ResetPasswordResultDto();
    dto.reset = true;
    return dto;
  }
}
