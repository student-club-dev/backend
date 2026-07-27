import { Connection as PrismaConnection, Student } from '@prisma/client';
import { Connection } from '../domain/entities/connection.entity';
import { StudentSummary } from '../domain/entities/student-summary.entity';
import { ConnectionStatus } from '../domain/enums/connection-status.enum';

/** The student columns needed to build a StudentSummary — the shared `select` for directory reads. */
export type StudentSummaryRow = Pick<
  Student,
  'id' | 'username' | 'firstName' | 'lastName' | 'avatarUrl'
>;

/** Maps Prisma rows to the connections domain. Prisma enums carry the same wire values as ours. */
export class ConnectionMapper {
  static toDomain(row: PrismaConnection): Connection {
    return {
      id: row.id,
      requesterId: row.requesterId,
      addresseeId: row.addresseeId,
      status: ConnectionStatus[row.status],
      createdAt: row.createdAt,
      respondedAt: row.respondedAt,
    };
  }

  static toSummary(row: StudentSummaryRow): StudentSummary {
    const fullName = [row.firstName, row.lastName].filter((part) => part).join(' ') || null;
    return {
      id: row.id,
      username: row.username,
      fullName,
      avatarUrl: row.avatarUrl,
      online: false,
      lastSeenAt: null,
    };
  }
}
