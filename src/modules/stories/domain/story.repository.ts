import { StudentSummary } from '../../connections/domain/entities/student-summary.entity';
import { Story } from './entities/story.entity';
import { StoryKind } from './enums/story-kind.enum';

/** Injection token for the story repository port. */
export const STORY_REPOSITORY = Symbol('STORY_REPOSITORY');

/** Everything a new story row needs. `expiresAt` is computed by the service, not the database. */
export interface NewStory {
  authorId: string;
  kind: StoryKind;
  mediaId: string;
  url: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  caption: string | null;
  expiresAt: Date;
}

/** A story row joined with the ids of the viewers we asked about. */
export interface StoryWithSeen {
  story: Story;
  seen: boolean;
}

/** A page of story viewers. */
export interface StoryViewerPage {
  items: StudentSummary[];
  total: number;
}

/** A page of the author's own expired stories. */
export interface StoryArchivePage {
  items: Story[];
  total: number;
}

/**
 * Story storage.
 *
 * The `live*` reads here filter on `expiresAt > now() AND deletedAt IS NULL` internally. That is not
 * left to callers on purpose: the cleanup cron runs every ten minutes, so between an expiry and the
 * sweep there is always a window in which an unfiltered query would return stories that are supposed
 * to have left the feed. Making the filter part of the repository means no future caller can forget
 * it.
 *
 * An expired story is not gone, though — it moves to the author's archive, which is what
 * `listArchived` and `findExisting` read. Those two are the only methods that see past `expiresAt`,
 * and both callers are responsible for checking that the caller is the author.
 */
export interface StoryRepository {
  /** Creates a story. */
  create(story: NewStory): Promise<Story>;

  /** A live story by id, or `null` (expired and soft-deleted both read as absent). */
  findLive(storyId: string): Promise<Story | null>;

  /**
   * A story by id that has not been deleted — **expired ones included**. Only for callers that
   * then check authorship themselves: an expired story belongs to its author's archive and must not
   * be handed to anyone else.
   */
  findExisting(storyId: string): Promise<Story | null>;

  /**
   * The author's expired stories, newest first — the archive. Unlike the feed this is a list rather
   * than a playback order, so it reads newest-first while `listLiveByAuthors` reads oldest-first.
   */
  listArchived(authorId: string, page: number, size: number): Promise<StoryArchivePage>;

  /** How many live stories this student has — the concurrent cap. */
  countActive(authorId: string): Promise<number>;

  /** How many stories this student posted since `since`, deleted ones included — the daily cap. */
  countPostedSince(authorId: string, since: Date): Promise<number>;

  /** The live stories of `authorIds`, with `seen` resolved for `viewerId`. Oldest-first per author. */
  listLiveByAuthors(authorIds: string[], viewerId: string): Promise<StoryWithSeen[]>;

  /**
   * Records a view. Idempotent: returns `true` only the first time, which is what the caller uses to
   * decide whether the counter moved. A repeat is not an error — the client re-posts on every open.
   */
  recordView(storyId: string, viewerId: string): Promise<boolean>;

  /** Who has viewed a story, newest first. */
  listViewers(storyId: string, page: number, size: number): Promise<StoryViewerPage>;

  /** Soft-deletes a story the caller authored. `false` when it is not theirs or already gone. */
  softDelete(storyId: string, authorId: string): Promise<boolean>;

  /**
   * Stories the author deleted before `before`, for the cleanup sweep. A deleted story leaves for
   * good — row, views and bytes — which is what separates it from one that merely expired. Returns
   * the media ids so the caller can delete the bytes first.
   */
  findDeletedPurgeable(before: Date, limit: number): Promise<{ id: string; mediaId: string }[]>;

  /**
   * Archived stories that expired before `before` and still have their bytes — the retention sweep.
   * The rows stay; only the files go, so this is deliberately not the same query as above.
   */
  findArchivePurgeable(before: Date, limit: number): Promise<{ id: string; mediaId: string }[]>;

  /** Flags archived stories whose bytes have been reclaimed, so the sweep never revisits them. */
  markArchivedMediaPurged(storyIds: string[]): Promise<void>;

  /** Deletes stories and their views. */
  purge(storyIds: string[]): Promise<void>;
}
