import { ApiProperty } from '@nestjs/swagger';
import type { RefreshTokenSession } from '../../domain/entities/refresh-token.entity';

/** A device/session in the account's session list (D3). The token hash is never exposed. */
export class SessionDto {
  @ApiProperty({ description: 'Session id — pass to DELETE /sessions/:id to revoke it' })
  id!: string;

  @ApiProperty({ nullable: true, example: 'iPhone 15' })
  deviceName!: string | null;

  @ApiProperty({ nullable: true, example: 'iOS' })
  platform!: string | null;

  @ApiProperty({ nullable: true, example: '178.218.201.5' })
  ipAddress!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastUsedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  static fromDomain(session: RefreshTokenSession): SessionDto {
    const dto = new SessionDto();
    dto.id = session.id;
    dto.deviceName = session.deviceName;
    dto.platform = session.platform;
    dto.ipAddress = session.ipAddress;
    dto.lastUsedAt = session.lastUsedAt;
    dto.createdAt = session.createdAt;
    return dto;
  }
}
