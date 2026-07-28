import { Connection as PrismaConnection, Student } from '@prisma/client';
import {
  COURSE_YEAR_TO_DOMAIN,
  GENDER_TO_DOMAIN,
  LAST_SEEN_VISIBILITY_TO_DOMAIN,
} from '../../profiles/infrastructure/profile-enums.mapper';
import { Connection } from '../domain/entities/connection.entity';
import { StudentSummary } from '../domain/entities/student-summary.entity';
import { ConnectionStatus } from '../domain/enums/connection-status.enum';

/** The student columns needed to build a StudentSummary — the shared `select` for directory reads. */
export type StudentSummaryRow = Pick<
  Student,
  | 'id'
  | 'username'
  | 'firstName'
  | 'lastName'
  | 'avatarUrl'
  | 'universityId'
  | 'gender'
  | 'courseYear'
  | 'lastSeenAt'
  | 'lastSeenVisibility'
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

  /**
   * `online` starts `false` — live presence is layered on by the application, which also applies
   * the viewer's `lastSeenVisibility` (see `applyPresenceVisibility`).
   */
  static toSummary(row: StudentSummaryRow): StudentSummary {
    const fullName = [row.firstName, row.lastName].filter((part) => part).join(' ') || null;
    return {
      id: row.id,
      username: row.username,
      fullName,
      avatarUrl: row.avatarUrl,
      universityId: row.universityId,
      gender: row.gender === null ? null : GENDER_TO_DOMAIN[row.gender],
      courseYear: row.courseYear === null ? null : COURSE_YEAR_TO_DOMAIN[row.courseYear],
      online: false,
      lastSeenAt: row.lastSeenAt,
      lastSeenVisibility: LAST_SEEN_VISIBILITY_TO_DOMAIN[row.lastSeenVisibility],
    };
  }
}
