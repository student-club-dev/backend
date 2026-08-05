import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body of the account-deletion endpoints (admin-panel 15-deletion.md). Optional — an empty body is
 * valid, so the panel can offer a plain "close account" without forcing the admin to type something.
 *
 * Unlike `AdminBanUserDto.reason`, which is required: a ban is a verdict the user may appeal, so it
 * has to be explainable. A closure is usually administrative — the account holder asked, or it is a
 * duplicate — and demanding prose for it only produces "asdf".
 */
export class AdminDeleteAccountDto {
  @ApiPropertyOptional({
    maxLength: 500,
    example: 'Foydalanuvchi so‘rovi bo‘yicha',
    description:
      'Recorded on the row for support to read later. There is no way to reopen the account, so ' +
      'this is the only lasting record of why it was closed.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
