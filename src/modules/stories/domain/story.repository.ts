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

/**
 * Story storage.
 *
 * Every read here filters on `expiresAt > now() AND deletedAt IS NULL` internally. That is not left
 * to callers on purpose: the cleanup cron runs every ten minutes, so between an expiry and the sweep
 * there is always a window in which an unfiltered query would return stories that are supposed to be
 * gone. Making the filter part of the repository means no future caller can forget it.
 */
export interface StoryRepository {
  /** Creates a story. */
  create(story: NewStory): Promise<Story>;

  /** A live story by id, or `null` (expired and soft-deleted both read as absent). */
  findLive(storyId: string): Promise<Story | null>;

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
   * Stories whose grace period has also passed, for the cleanup sweep. Returns the media ids so the
   * caller can delete the bytes before the rows.
   */
  findPurgeable(before: Date, limit: number): Promise<{ id: string; mediaId: string }[]>;

  /** Deletes stories and their views. */
  purge(storyIds: string[]): Promise<void>;
}
