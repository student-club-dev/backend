import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { Env } from '../../../config/env';
import {
  PRESENCE_REPOSITORY,
  PresenceRepository,
} from '../../../infrastructure/presence/presence.repository';
import { StudentSummary } from '../../connections/domain/entities/student-summary.entity';
import { applyPresenceVisibility } from '../../connections/domain/presence-visibility';
import {
  STUDENT_DIRECTORY,
  StudentDirectoryRepository,
} from '../../connections/domain/student-directory.repository';
import { ChatMediaService } from '../../media/application/chat-media.service';
import { MediaAsset } from '../../media/domain/entities/media-asset.entity';
import { MediaKind, MediaStatus } from '../../media/domain/enums/media-kind.enum';
import {
  MEDIA_ASSET_REPOSITORY,
  MediaAssetRepository,
} from '../../media/domain/media-asset.repository';
import {
  MAX_ACTIVE_STORIES,
  MAX_STORIES_PER_DAY,
  MAX_STORY_CAPTION_LENGTH,
  STORY_TTL_MS,
  Story,
  StoryForViewer,
  StoryGroup,
} from '../domain/entities/story.entity';
import { StoryKind } from '../domain/enums/story-kind.enum';
import { STORY_AUDIENCE, StoryAudienceRepository } from '../domain/story-audience.repository';
import { STORY_REPOSITORY, StoryRepository, StoryViewerPage } from '../domain/story.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Story use-cases.
 *
 * Gated by exactly the same relationship as chat — connections only, blocks hide it both ways — so
 * there is one social boundary in the product rather than two that can disagree. Nothing here sends
 * a push: a story is a "whoever looks, looks" format, and a notification per frame is how people end
 * up turning notifications off entirely.
 */
@Injectable()
export class StoriesService {
  private readonly apiBase: string;

  constructor(
    @Inject(STORY_REPOSITORY) private readonly stories: StoryRepository,
    @Inject(STORY_AUDIENCE) private readonly audience: StoryAudienceRepository,
    @Inject(STUDENT_DIRECTORY) private readonly directory: StudentDirectoryRepository,
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly media: MediaAssetRepository,
    // The cleanup pass has to remove the bytes, not just the rows — that is the media module's job,
    // and duplicating its storage handling here is how one of the two ends up out of date.
    private readonly mediaFiles: ChatMediaService,
    @Inject(PRESENCE_REPOSITORY) private readonly presence: PresenceRepository,
    config: ConfigService<Env, true>,
  ) {
    this.apiBase = `/${config.get('API_PREFIX', { infer: true })}`;
  }

  /** Posts a story from an already-uploaded `STORY_IMAGE` / `STORY_VIDEO` asset. */
  async create(user: AuthenticatedUser, mediaId: string, caption: string | null): Promise<Story> {
    const trimmed = caption?.trim() ?? null;
    if (trimmed !== null && trimmed.length > MAX_STORY_CAPTION_LENGTH) {
      throw AppException.validation({
        caption: `Izoh ${MAX_STORY_CAPTION_LENGTH} belgidan oshmasligi kerak`,
      });
    }

    // Both caps, cheapest first. The daily one counts deleted stories as well — otherwise posting
    // and deleting in a loop is an unlimited quota.
    if ((await this.stories.countActive(user.id)) >= MAX_ACTIVE_STORIES) {
      throw new AppException(
        ERROR_CODE.STORY_LIMIT_REACHED,
        422,
        `Bir vaqtda ${MAX_ACTIVE_STORIES} tadan ko'p story bo'lmaydi`,
      );
    }
    if (
      (await this.stories.countPostedSince(user.id, new Date(Date.now() - DAY_MS))) >=
      MAX_STORIES_PER_DAY
    ) {
      throw new AppException(
        ERROR_CODE.STORY_LIMIT_REACHED,
        422,
        `Kuniga ${MAX_STORIES_PER_DAY} tadan ko'p story qo'yib bo'lmaydi`,
      );
    }

    const asset = await this.resolveMedia(user, mediaId);
    const kind = asset.kind === MediaKind.STORY_VIDEO ? StoryKind.VIDEO : StoryKind.IMAGE;

    return this.stories.create({
      authorId: user.id,
      kind,
      mediaId: asset.id,
      url: `${this.apiBase}/media/${asset.id}/raw`,
      thumbUrl:
        asset.thumbStorageKey === null
          ? null
          : `${this.apiBase}/media/${asset.id}/raw?variant=thumb`,
      width: asset.width,
      height: asset.height,
      durationMs: asset.durationMs,
      caption: trimmed === null || trimmed.length === 0 ? null : trimmed,
      // Stored rather than derived. The feed filter and the cleanup sweep both compare against this
      // column, and an indexed column is the only version of that comparison that stays fast.
      expiresAt: new Date(Date.now() + STORY_TTL_MS),
    });
  }

  /**
   * The feed: every connection's live stories, grouped by author.
   *
   * Grouping and ordering happen here rather than on the client because the client draws the avatar
   * row straight from this array — two clients sorting it themselves is two chances to disagree.
   * Unseen authors first, then newest activity, which puts what the user has not watched under
   * their thumb.
   */
  async feed(user: AuthenticatedUser): Promise<StoryGroup[]> {
    const authorIds = await this.audience.connectedIds(user.id);
    const rows = await this.stories.listLiveByAuthors(authorIds, user.id);
    if (rows.length === 0) {
      return [];
    }

    const byAuthor = new Map<string, StoryForViewer[]>();
    for (const row of rows) {
      const forViewer: StoryForViewer = {
        story: row.story,
        seen: row.seen,
        // Someone else's story: the count is the author's business. Seeing it would let a viewer
        // measure the size of another student's network.
        viewsCount: null,
      };
      const existing = byAuthor.get(row.story.authorId);
      if (existing === undefined) {
        byAuthor.set(row.story.authorId, [forViewer]);
      } else {
        existing.push(forViewer);
      }
    }

    const authors = await this.summariesFor([...byAuthor.keys()]);
    const groups: StoryGroup[] = [];
    for (const [authorId, stories] of byAuthor) {
      const author = authors.get(authorId);
      // A summary that vanished between the two queries (deleted account) — drop the group rather
      // than ship a story with nobody attached to it.
      if (author === undefined) {
        continue;
      }
      groups.push({
        author,
        stories,
        hasUnseen: stories.some((entry) => !entry.seen),
        lastCreatedAt: stories.reduce(
          (latest, entry) => (entry.story.createdAt > latest ? entry.story.createdAt : latest),
          stories[0].story.createdAt,
        ),
      });
    }

    return groups.sort((a, b) => {
      if (a.hasUnseen !== b.hasUnseen) {
        return a.hasUnseen ? -1 : 1;
      }
      return b.lastCreatedAt.getTime() - a.lastCreatedAt.getTime();
    });
  }

  /** The caller's own live stories, with the real view counts. */
  async mine(user: AuthenticatedUser): Promise<StoryForViewer[]> {
    const rows = await this.stories.listLiveByAuthors([user.id], user.id);
    return rows.map((row) => ({
      story: row.story,
      // Your own story is always "seen": the ring around your avatar should never suggest you have
      // something of your own left to watch.
      seen: true,
      viewsCount: row.story.viewsCount,
    }));
  }

  /**
   * Records that the caller opened a story.
   *
   * The most-called endpoint here — it fires on every tap through the feed — so it does the minimum:
   * one conditional insert, and an update only when that insert was new.
   */
  async markViewed(user: AuthenticatedUser, storyId: string): Promise<void> {
    const story = await this.requireVisible(user, storyId);
    if (story.authorId === user.id) {
      // Watching your own story is not a view. Counting it would make every story open at 1.
      return;
    }
    await this.stories.recordView(storyId, user.id);
  }

  /**
   * Who has seen a story — **author only**.
   *
   * Note that this list ignores `lastSeenVisibility`: someone who opens a story has shown themselves
   * to its author, and hiding that would make the count and the list disagree. That is a deliberate
   * exception to the presence rules, and the mobile docs state it so the expectation is set.
   */
  async viewers(
    user: AuthenticatedUser,
    storyId: string,
    page: number,
    size: number,
  ): Promise<StoryViewerPage> {
    const story = await this.stories.findLive(storyId);
    if (story === null) {
      throw AppException.notFound(ERROR_CODE.STORY_NOT_FOUND, 'Story topilmadi');
    }
    if (story.authorId !== user.id) {
      throw new AppException(
        ERROR_CODE.STORY_FORBIDDEN,
        403,
        "Story'ni kim ko'rganini faqat muallif ko'radi",
      );
    }
    return this.stories.listViewers(storyId, page, size);
  }

  /**
   * Deletes the caller's own story.
   *
   * Soft: the row is marked and disappears from every read immediately, but the bytes stay until the
   * cleanup pass. Deleting the file straight away would break the copy already sitting in a CDN or
   * an in-flight client request, which shows up as a broken image rather than a missing one.
   */
  async remove(user: AuthenticatedUser, storyId: string): Promise<void> {
    if (!(await this.stories.softDelete(storyId, user.id))) {
      throw AppException.notFound(ERROR_CODE.STORY_NOT_FOUND, 'Story topilmadi');
    }
  }

  /**
   * Removes stories whose grace period has also passed, bytes and rows.
   *
   * Two stages by design. A story stops being *visible* the moment `expiresAt` passes — every read
   * filters on it, so the cron being late can never resurface one. This pass is about reclaiming
   * disk, and it waits an extra day so a copy still sitting in a CDN or an in-flight request has
   * somewhere to point.
   *
   * Deleting the `MediaAsset` is enough: `Story` cascades from it and `StoryView` cascades from the
   * story. Returns how many went.
   */
  async purgeExpired(gracePeriodMs = STORY_TTL_MS, batch = 500): Promise<number> {
    const stale = await this.stories.findPurgeable(new Date(Date.now() - gracePeriodMs), batch);
    if (stale.length === 0) {
      return 0;
    }
    return this.mediaFiles.deleteAssets(stale.map((story) => story.mediaId));
  }

  /** A live story the caller is allowed to open, or the matching error. */
  private async requireVisible(user: AuthenticatedUser, storyId: string): Promise<Story> {
    const story = await this.stories.findLive(storyId);
    // Expired, deleted and never-existed are one answer: a story that is gone is gone.
    if (story === null) {
      throw AppException.notFound(ERROR_CODE.STORY_NOT_FOUND, 'Story topilmadi');
    }
    if (
      story.authorId !== user.id &&
      !(await this.audience.areConnected(user.id, story.authorId))
    ) {
      // 403 rather than 404: the id came from somewhere, so denying its existence is not credible.
      // A block lands here too, which is what keeps a blocked person out even with a direct link.
      throw new AppException(ERROR_CODE.STORY_FORBIDDEN, 403, "Bu story'ni ko'rib bo'lmaydi");
    }
    return story;
  }

  /** The uploaded asset behind a `mediaId`, checked for owner, kind, readiness and reuse. */
  private async resolveMedia(user: AuthenticatedUser, mediaId: string): Promise<MediaAsset> {
    const asset = await this.media.findById(mediaId);
    if (
      asset === null ||
      asset.ownerId !== user.id ||
      (asset.kind !== MediaKind.STORY_IMAGE && asset.kind !== MediaKind.STORY_VIDEO)
    ) {
      throw new AppException(ERROR_CODE.MEDIA_NOT_FOUND, 422, 'Fayl topilmadi');
    }
    if (asset.status !== MediaStatus.READY) {
      // A story video may still be transcoding. Posting it now would publish something that plays
      // for nobody until the queue catches up.
      throw new AppException(ERROR_CODE.MEDIA_NOT_READY, 422, 'Fayl hali tayyor emas');
    }
    return asset;
  }

  /** Author summaries with presence applied. Authors are connections by construction. */
  private async summariesFor(ids: string[]): Promise<Map<string, StudentSummary>> {
    const summaries = await this.directory.findSummaries(ids);
    const online = await this.presence.onlineAmong(ids);
    return new Map(
      summaries.map((summary) => [
        summary.id,
        applyPresenceVisibility(summary, true, online.has(summary.id)),
      ]),
    );
  }
}
