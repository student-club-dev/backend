import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Story as PrismaStory,
  type StoryKind as PrismaStoryKind,
} from '@prisma/client';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  ConnectionMapper,
  PROFILE_PHOTOS_INCLUDE,
} from '../../connections/infrastructure/connection.mapper';
import { Story } from '../domain/entities/story.entity';
import { StoryKind } from '../domain/enums/story-kind.enum';
import {
  NewStory,
  StoryRepository,
  StoryViewerPage,
  StoryWithSeen,
} from '../domain/story.repository';

/**
 * Prisma implementation of the story port. Prisma is used ONLY here.
 *
 * `LIVE` below is the filter that defines what a story *is* to every reader. It is applied inside
 * each method rather than passed in, because the cleanup cron runs on a ten-minute tick: between a
 * story expiring and the sweep removing it there is always a window where a query without this
 * clause would hand back content that is supposed to have vanished.
 */
@Injectable()
export class StoryPrismaRepository implements StoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(story: NewStory): Promise<Story> {
    try {
      const row = await this.prisma.story.create({
        data: { ...story, kind: story.kind as PrismaStoryKind },
      });
      return toDomain(row);
    } catch (error) {
      // `media_id` is unique: one upload backs one story. A double-tapped post, or a retry after a
      // response the client never saw, lands here — that is a 422 the client can act on, not the
      // 500 an unhandled constraint violation would produce.
      if (isUniqueViolation(error)) {
        throw new AppException(
          ERROR_CODE.MEDIA_ALREADY_USED,
          422,
          "Bu fayl allaqachon story sifatida qo'yilgan",
        );
      }
      throw error;
    }
  }

  async findLive(storyId: string): Promise<Story | null> {
    const row = await this.prisma.story.findFirst({ where: { id: storyId, ...live() } });
    return row === null ? null : toDomain(row);
  }

  countActive(authorId: string): Promise<number> {
    return this.prisma.story.count({ where: { authorId, ...live() } });
  }

  /** Counts deleted stories too — otherwise the daily cap is bypassed by posting and deleting. */
  countPostedSince(authorId: string, since: Date): Promise<number> {
    return this.prisma.story.count({ where: { authorId, createdAt: { gte: since } } });
  }

  async listLiveByAuthors(authorIds: string[], viewerId: string): Promise<StoryWithSeen[]> {
    if (authorIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.story.findMany({
      where: { authorId: { in: authorIds }, ...live() },
      orderBy: [{ authorId: 'asc' }, { createdAt: 'asc' }],
      // One join instead of a second round trip per story: `where` on the relation returns the
      // viewer's row only, so a non-empty array means "seen".
      include: { views: { where: { viewerId }, select: { viewerId: true } } },
    });
    return rows.map((row) => ({ story: toDomain(row), seen: row.views.length > 0 }));
  }

  /**
   * Inserts the view and bumps the counter, or does nothing at all on a repeat.
   *
   * `createMany` + `skipDuplicates` rather than a find-then-insert: this is the most-called endpoint
   * in the feature (every tap through a story fires it), and a check-then-write would still let two
   * concurrent taps both pass the check and double-count. The composite primary key is what makes it
   * idempotent; `count` tells us whether the row was actually new.
   */
  async recordView(storyId: string, viewerId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.storyView.createMany({
        data: [{ storyId, viewerId }],
        skipDuplicates: true,
      });
      if (count === 0) {
        return false;
      }
      await tx.story.update({ where: { id: storyId }, data: { viewsCount: { increment: 1 } } });
      return true;
    });
  }

  async listViewers(storyId: string, page: number, size: number): Promise<StoryViewerPage> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.storyView.findMany({
        where: { storyId },
        orderBy: { viewedAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        include: { viewer: { select: VIEWER_SELECT } },
      }),
      this.prisma.storyView.count({ where: { storyId } }),
    ]);
    return { items: rows.map((row) => ConnectionMapper.toSummary(row.viewer)), total };
  }

  async softDelete(storyId: string, authorId: string): Promise<boolean> {
    const { count } = await this.prisma.story.updateMany({
      where: { id: storyId, authorId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return count > 0;
  }

  async findPurgeable(before: Date, limit: number): Promise<{ id: string; mediaId: string }[]> {
    return this.prisma.story.findMany({
      where: { expiresAt: { lt: before } },
      select: { id: true, mediaId: true },
      take: limit,
    });
  }

  /** The `story_views` rows go with it — the foreign key cascades. */
  async purge(storyIds: string[]): Promise<void> {
    if (storyIds.length === 0) {
      return;
    }
    await this.prisma.story.deleteMany({ where: { id: { in: storyIds } } });
  }
}

/** The student columns a viewer summary needs — the same shape `ConnectionMapper.toSummary` reads. */
const VIEWER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  bio: true,
  universityId: true,
  gender: true,
  courseYear: true,
  lastSeenAt: true,
  lastSeenVisibility: true,
  phoneNumber: true,
  phoneVisibility: true,
  profilePhotos: PROFILE_PHOTOS_INCLUDE,
} satisfies Prisma.StudentSelect;

/** Whether a Prisma error is a unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Not yet expired and not deleted — what "a story exists" means everywhere in this feature. */
function live(): Prisma.StoryWhereInput {
  return { expiresAt: { gt: new Date() }, deletedAt: null };
}

function toDomain(row: PrismaStory): Story {
  return {
    id: row.id,
    authorId: row.authorId,
    kind: StoryKind[row.kind],
    mediaId: row.mediaId,
    url: row.url,
    thumbUrl: row.thumbUrl,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    caption: row.caption,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    viewsCount: row.viewsCount,
  };
}
