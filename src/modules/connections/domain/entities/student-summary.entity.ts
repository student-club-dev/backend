import { CourseYear } from '../../../profiles/domain/enums/course-year.enum';
import { Gender } from '../../../profiles/domain/enums/gender.enum';
import { LastSeenVisibility } from '../../../profiles/domain/enums/last-seen-visibility.enum';

/**
 * The compact view of a student shown wherever a person appears (search, connections, requests,
 * conversations). The discovery fields (`universityId`, `gender`, `courseYear`) mirror the profile
 * so the client can render and filter a student list without a second call.
 *
 * `online` / `lastSeenAt` are raw here — the reader's visibility is applied by
 * `applyPresenceVisibility` (C7), which is why `lastSeenVisibility` travels with the summary. That
 * field is internal: it is never serialised into `StudentSummaryDto`.
 */
export interface StudentSummary {
  id: string;
  username: string | null;
  /** `firstName` + `lastName` joined, or `null` when neither is set. */
  fullName: string | null;
  avatarUrl: string | null;
  universityId: string | null;
  gender: Gender | null;
  courseYear: CourseYear | null;
  online: boolean;
  lastSeenAt: Date | null;
  /** Internal — drives presence masking; not part of the wire contract. */
  lastSeenVisibility: LastSeenVisibility;
}
