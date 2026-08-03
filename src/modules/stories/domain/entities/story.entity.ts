import { StudentSummary } from '../../../connections/domain/entities/student-summary.entity';
import { StoryKind } from '../enums/story-kind.enum';

/** How long a story stays visible in the feed. After this it moves to the author's archive. */
export const STORY_TTL_MS = 24 * 60 * 60 * 1000;

/** Most stories one student may have live at once. */
export const MAX_ACTIVE_STORIES = 10;

/** Most stories one student may post in a rolling day, live or already deleted. */
export const MAX_STORIES_PER_DAY = 20;

/** Longest caption a story may carry. */
export const MAX_STORY_CAPTION_LENGTH = 200;

/** One story. */
export interface Story {
  id: string;
  authorId: string;
  kind: StoryKind;
  mediaId: string;
  url: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  /** Video only; `null` for an image, which the client shows for a fixed few seconds. */
  durationMs: number | null;
  caption: string | null;
  createdAt: Date;
  expiresAt: Date;
  viewsCount: number;
  /**
   * Whether the archive retention window passed and the bytes were reclaimed. The row is still the
   * author's post — only the file behind `url` is gone, which is why this is a flag rather than a
   * deletion.
   */
  archivedMediaPurged: boolean;
}

/** A story plus the two things that depend on who is looking at it. */
export interface StoryForViewer {
  story: Story;
  /** Whether this viewer has already opened it. Always true for your own. */
  seen: boolean;
  /**
   * The real count for the author, `null` for everyone else. Hiding it is deliberate: a viewer who
   * can see how many people watched can infer the size of someone else's network.
   */
  viewsCount: number | null;
}

/** One author's live stories, as the feed groups them. */
export interface StoryGroup {
  author: StudentSummary;
  stories: StoryForViewer[];
  /** Whether any story in the group is unseen — what lights the ring around the avatar. */
  hasUnseen: boolean;
  /** Newest `createdAt` in the group; the feed's secondary sort. */
  lastCreatedAt: Date;
}
