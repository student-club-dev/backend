import { AppException } from '../../../common/exceptions/app.exception';
import { MediaKind, MediaQuality } from '../domain/enums/media-kind.enum';

/**
 * The `kind` field's Swagger help.
 *
 * Sizes are gone from it because they are gone from the server (parity spec §2) — what is left is
 * the two ceilings that survived, so the text says what is still true rather than repeating limits
 * that no longer exist.
 */
export const CHAT_UPLOAD_KIND_HELP =
  'IMAGE · IMAGE_ORIGINAL · GIF · VIDEO · VIDEO_NOTE (square, ≤ 60 s, ≤ 12 MB) · VOICE · FILE ' +
  '(any type) · PROFILE_PHOTO · STORY_IMAGE · STORY_VIDEO (≤ 60 s). No size limit except VIDEO_NOTE.';

/** Parses the multipart `kind` field, which arrives as a bare string with no DTO to validate it. */
export function parseKind(value: string): MediaKind {
  if (!(Object.values(MediaKind) as string[]).includes(value)) {
    throw AppException.validation({ kind: 'Yuklash turi noto‘g‘ri' });
  }
  return value as MediaKind;
}

/**
 * Parses the optional `quality` field (parity spec §4.2).
 *
 * Absent means `AUTO` — which is exactly what every client sent before the field existed, so an old
 * build keeps the behaviour it already had.
 */
export function parseQuality(value: string | undefined): MediaQuality | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (!(Object.values(MediaQuality) as string[]).includes(value)) {
    throw AppException.validation({ quality: 'Sifat darajasi noto‘g‘ri' });
  }
  return value as MediaQuality;
}
