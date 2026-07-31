import { Injectable } from '@nestjs/common';
import { Prisma, type ProfilePhoto as PrismaProfilePhoto } from '@prisma/client';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ProfilePhoto } from '../domain/entities/profile-photo.entity';
import { NewProfilePhoto, ProfilePhotoRepository } from '../domain/profile-photo.repository';

/**
 * Prisma implementation of the profile-photo port. Prisma is used ONLY here.
 *
 * Every mutation runs in a transaction that ends by writing `Student.avatarUrl`. That is not
 * belt-and-braces: `avatarUrl` is a derived field that older clients read *instead of* the photo
 * set, so if a crash left it pointing at a picture that is no longer first, the user would change
 * their photo and half their friends would keep seeing the old one — with nothing to indicate why.
 */
@Injectable()
export class ProfilePhotoPrismaRepository implements ProfilePhotoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listFor(studentId: string): Promise<ProfilePhoto[]> {
    const rows = await this.prisma.profilePhoto.findMany({
      where: { studentId },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map(toDomain);
  }

  async listForMany(studentIds: string[]): Promise<Map<string, ProfilePhoto[]>> {
    const byStudent = new Map<string, ProfilePhoto[]>();
    if (studentIds.length === 0) {
      return byStudent;
    }
    const rows = await this.prisma.profilePhoto.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: [{ studentId: 'asc' }, { sortOrder: 'asc' }],
    });
    for (const row of rows) {
      const existing = byStudent.get(row.studentId);
      if (existing === undefined) {
        byStudent.set(row.studentId, [toDomain(row)]);
      } else {
        existing.push(toDomain(row));
      }
    }
    return byStudent;
  }

  countFor(studentId: string): Promise<number> {
    return this.prisma.profilePhoto.count({ where: { studentId } });
  }

  async addAsMain(photo: NewProfilePhoto): Promise<ProfilePhoto> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Everything already there moves down one. Done before the insert so no two rows ever hold
        // `sortOrder = 0`, even briefly.
        await tx.profilePhoto.updateMany({
          where: { studentId: photo.studentId },
          data: { sortOrder: { increment: 1 } },
        });
        const created = await tx.profilePhoto.create({ data: { ...photo, sortOrder: 0 } });
        await setAvatar(tx, photo.studentId, created.url);
        return created;
      });
      return toDomain(row);
    } catch (error) {
      // `media_id` is unique: one upload backs one photo. A double-tapped save, or a retry after a
      // response the client never saw, lands here — that is a 422 the client can act on, not the
      // 500 an unhandled constraint violation would produce. The transaction rolls back with it, so
      // the `sortOrder` shuffle above does not survive a rejected insert.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(ERROR_CODE.MEDIA_ALREADY_USED, 422, "Bu rasm allaqachon qo'shilgan");
      }
      throw error;
    }
  }

  async makeMain(studentId: string, photoId: string): Promise<ProfilePhoto | null> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.profilePhoto.findFirst({ where: { id: photoId, studentId } });
      if (target === null) {
        return null;
      }
      const rest = await tx.profilePhoto.findMany({
        where: { studentId, id: { not: photoId } },
        orderBy: { sortOrder: 'asc' },
        select: { id: true },
      });
      await resequence(tx, [target.id, ...rest.map((row) => row.id)]);
      await setAvatar(tx, studentId, target.url);
      return toDomain({ ...target, sortOrder: 0 });
    });
  }

  async remove(studentId: string, photoId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.profilePhoto.findFirst({
        where: { id: photoId, studentId },
        select: { id: true },
      });
      if (target === null) {
        return false;
      }
      await tx.profilePhoto.delete({ where: { id: photoId } });
      const remaining = await tx.profilePhoto.findMany({
        where: { studentId },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, url: true },
      });
      await resequence(
        tx,
        remaining.map((row) => row.id),
      );
      // Deleting the current avatar promotes the next picture; deleting the last one clears it, and
      // the client falls back to initials.
      await setAvatar(tx, studentId, remaining[0]?.url ?? null);
      return true;
    });
  }
}

/** Transaction client — the subset of PrismaService available inside `$transaction`. */
type Tx = Prisma.TransactionClient;

/**
 * Rewrites `sortOrder` to 0..n-1 in the given order.
 *
 * Two passes with an offset in between, because a single pass can collide: moving photo B to 0 while
 * A still holds 0 is fine today, but the moment a `@@unique([studentId, sortOrder])` is added this
 * would start failing intermittently. Parking the whole set out of range first makes the write order
 * irrelevant.
 */
async function resequence(tx: Tx, orderedIds: string[]): Promise<void> {
  const OFFSET = 1000;
  for (const [index, id] of orderedIds.entries()) {
    await tx.profilePhoto.update({ where: { id }, data: { sortOrder: OFFSET + index } });
  }
  for (const [index, id] of orderedIds.entries()) {
    await tx.profilePhoto.update({ where: { id }, data: { sortOrder: index } });
  }
}

/** Keeps the derived `Student.avatarUrl` equal to the first photo's url. */
async function setAvatar(tx: Tx, studentId: string, url: string | null): Promise<void> {
  await tx.student.update({ where: { id: studentId }, data: { avatarUrl: url } });
}

function toDomain(row: PrismaProfilePhoto): ProfilePhoto {
  return {
    id: row.id,
    studentId: row.studentId,
    mediaId: row.mediaId,
    url: row.url,
    thumbUrl: row.thumbUrl,
    width: row.width,
    height: row.height,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}
