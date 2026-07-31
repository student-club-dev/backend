import { ProfilePhoto } from './entities/profile-photo.entity';

/** Injection token for the profile-photo repository port. */
export const PROFILE_PHOTO_REPOSITORY = Symbol('PROFILE_PHOTO_REPOSITORY');

/** The media fields a new photo copies off its asset. */
export interface NewProfilePhoto {
  studentId: string;
  mediaId: string;
  url: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Profile-photo storage.
 *
 * Three of these four writes have to keep `Student.avatarUrl` equal to the `sortOrder = 0` photo, so
 * each is a transaction in the implementation rather than something the service stitches together —
 * a crash between "reorder the set" and "update the avatar" would leave the two permanently
 * disagreeing, and nothing would ever notice.
 */
export interface ProfilePhotoRepository {
  /** One student's photos, `sortOrder` ascending. */
  listFor(studentId: string): Promise<ProfilePhoto[]>;

  /** The same, for many students at once — the student-list read. */
  listForMany(studentIds: string[]): Promise<Map<string, ProfilePhoto[]>>;

  /** How many the student already has (the `MAX_PROFILE_PHOTOS` check). */
  countFor(studentId: string): Promise<number>;

  /** Adds a photo at `sortOrder = 0`, pushing the rest down, and syncs `avatarUrl`. */
  addAsMain(photo: NewProfilePhoto): Promise<ProfilePhoto>;

  /** Moves an existing photo to `sortOrder = 0`, resequences the rest, and syncs `avatarUrl`. */
  makeMain(studentId: string, photoId: string): Promise<ProfilePhoto | null>;

  /**
   * Removes a photo, closes the gap in `sortOrder`, and syncs `avatarUrl` to whatever is first
   * afterwards — `null` when the set is now empty. Returns false when the id is not this student's.
   */
  remove(studentId: string, photoId: string): Promise<boolean>;
}
