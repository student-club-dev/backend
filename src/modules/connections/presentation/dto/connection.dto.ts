import { ApiProperty } from '@nestjs/swagger';
import { Connection } from '../../domain/entities/connection.entity';
import { ConnectionStatus } from '../../domain/enums/connection-status.enum';

/** A connection edge as returned to a caller (result of send/accept). */
export class ConnectionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  requesterId!: string;

  @ApiProperty()
  addresseeId!: string;

  @ApiProperty({ enum: ConnectionStatus, enumName: 'ConnectionStatusDto' })
  status!: ConnectionStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  respondedAt!: string | null;

  static fromDomain(connection: Connection): ConnectionDto {
    const dto = new ConnectionDto();
    dto.id = connection.id;
    dto.requesterId = connection.requesterId;
    dto.addresseeId = connection.addresseeId;
    dto.status = connection.status;
    dto.createdAt = connection.createdAt.toISOString();
    dto.respondedAt = connection.respondedAt === null ? null : connection.respondedAt.toISOString();
    return dto;
  }
}
