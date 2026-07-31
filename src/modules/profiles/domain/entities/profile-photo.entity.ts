/**
 * One picture in a student's profile-photo set.
 *
 * The set replaces the single `avatarUrl` on the profile screen — `sortOrder` 0 is the current
 * avatar, and `Student.avatarUrl` is kept equal to its `url` so clients already in the field, which
 * only ever read `avatarUrl`, do not show a stale picture.
 */
export interface ProfilePhoto {
  id: string;
  studentId: string;
  mediaId: string;
  url: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  /** Position in the set; 0 is the current avatar. */
  sortOrder: number;
  createdAt: Date;
}

/** Most pictures one student may keep. Past this, the picker stops being a picker. */
export const MAX_PROFILE_PHOTOS = 6;
