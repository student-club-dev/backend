import { CourseYear } from '../../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../../profiles/domain/enums/gender.enum';
import { LastSeenVisibility } from '../../../profiles/domain/enums/last-seen-visibility.enum';
import { PhoneVisibility } from '../../../profiles/domain/enums/phone-visibility.enum';

/**
 * The compact view of a student shown wherever a person appears (search, connections, requests,
 * conversations). The discovery fields (`universityId`, `gender`, `courseYear`) mirror the profile
 * so the client can render and filter a student list without a second call.
 *
 * `online` / `lastSeenAt` are raw here — the reader's visibility is applied by
 * `applyPresenceVisibility` (C7), which is why `lastSeenVisibility` travels with the summary. That
 * field is internal: it is never serialised into `StudentSummaryDto`.
 */
/** One picture from a student's profile-photo set, reduced to what a viewer needs to render it. */
export interface StudentPhoto {
  id: string;
  url: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
}

export interface StudentSummary {
  id: string;
  username: string | null;
  /** `firstName` + `lastName` joined, or `null` when neither is set. */
  fullName: string | null;
  /**
   * Always equal to `photos[0].url` when the set is non-empty — it is derived from the set, not
   * stored independently, so a client that only reads this one still shows the current picture.
   */
  avatarUrl: string | null;
  /** The full set in display order. Empty when the student has never added one. */
  photos: StudentPhoto[];
  /** Short profile blurb, or `null`. Never carries a link or a phone number (see `domain/bio.ts`). */
  bio: string | null;
  universityId: string | null;
  gender: Gender | null;
  courseYear: CourseYear | null;
  online: boolean;
  lastSeenAt: Date | null;
  /**
   * Raw here, like presence — `applyPresenceVisibility` blanks it for a reader who may not see it.
   * Anything that serialises a summary without going through that helper leaks a phone number.
   */
  phoneNumber: string | null;
  /** Internal — drives presence masking; not part of the wire contract. */
  lastSeenVisibility: LastSeenVisibility;
  /** Internal — drives phone masking; not part of the wire contract. */
  phoneVisibility: PhoneVisibility;
}
