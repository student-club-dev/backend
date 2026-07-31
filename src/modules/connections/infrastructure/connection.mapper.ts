import {
  Connection as PrismaConnection,
  ProfilePhoto as PrismaProfilePhoto,
  Student,
} from '@prisma/client';
import {
  COURSE_YEAR_TO_DOMAIN,
  GENDER_TO_DOMAIN,
  LAST_SEEN_VISIBILITY_TO_DOMAIN,
  PHONE_VISIBILITY_TO_DOMAIN,
} from '../../profiles/infrastructure/profile-enums.mapper';
import { Connection } from '../domain/entities/connection.entity';
import { StudentPhoto, StudentSummary } from '../domain/entities/student-summary.entity';
import { ConnectionStatus } from '../domain/enums/connection-status.enum';

/** The student columns needed to build a StudentSummary — the shared `select` for directory reads. */
export type StudentSummaryRow = Pick<
  Student,
  | 'id'
  | 'username'
  | 'firstName'
  | 'lastName'
  | 'avatarUrl'
  | 'bio'
  | 'universityId'
  | 'gender'
  | 'courseYear'
  | 'lastSeenAt'
  | 'lastSeenVisibility'
  | 'phoneNumber'
  | 'phoneVisibility'
> & { profilePhotos?: ProfilePhotoRow[] };

/** The profile-photo columns a summary carries, already ordered by `sortOrder`. */
export type ProfilePhotoRow = Pick<
  PrismaProfilePhoto,
  'id' | 'url' | 'thumbUrl' | 'width' | 'height'
>;

/**
 * The `include` every summary read uses for the photo set. Shared so the ordering cannot drift
 * between call sites — `photos[0]` is defined to be the avatar, and an unordered read would break
 * that quietly.
 */
export const PROFILE_PHOTOS_INCLUDE = {
  select: { id: true, url: true, thumbUrl: true, width: true, height: true },
  orderBy: { sortOrder: 'asc' },
} as const;

/** Maps the joined photo rows, tolerating a caller that did not load them. */
export function toStudentPhotos(rows: ProfilePhotoRow[] | undefined): StudentPhoto[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    url: row.url,
    thumbUrl: row.thumbUrl,
    width: row.width,
    height: row.height,
  }));
}

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
      photos: toStudentPhotos(row.profilePhotos),
      bio: row.bio,
      universityId: row.universityId,
      gender: row.gender === null ? null : GENDER_TO_DOMAIN[row.gender],
      courseYear: row.courseYear === null ? null : COURSE_YEAR_TO_DOMAIN[row.courseYear],
      online: false,
      lastSeenAt: row.lastSeenAt,
      // Raw — `applyPresenceVisibility` blanks both this and presence for the specific reader.
      phoneNumber: row.phoneNumber,
      lastSeenVisibility: LAST_SEEN_VISIBILITY_TO_DOMAIN[row.lastSeenVisibility],
      phoneVisibility: PHONE_VISIBILITY_TO_DOMAIN[row.phoneVisibility],
    };
  }
}
