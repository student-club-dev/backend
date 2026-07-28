import { ApiProperty } from '@nestjs/swagger';
import type { AdminPrincipal } from '../../domain/admin-principal';
import { AdminRole } from '../../domain/enums/admin-role.enum';

/** The authenticated admin's identity (`GET /admin/auth/me`). */
export class AdminMeDto {
  @ApiProperty({ example: 'admin@elon.uz' })
  email!: string;

  @ApiProperty({ enum: AdminRole, enumName: 'AdminRole', example: AdminRole.ADMIN })
  role!: AdminRole;

  static fromPrincipal(principal: AdminPrincipal): AdminMeDto {
    const dto = new AdminMeDto();
    dto.email = principal.email;
    dto.role = principal.role;
    return dto;
  }
}
