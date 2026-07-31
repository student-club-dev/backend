import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { MediaKind } from '../../media/domain/enums/media-kind.enum';
import { MessageType } from './enums/message-type.enum';

/** Longest caption allowed on a media message. Plain text messages get the full 4000. */
export const MAX_CAPTION_LENGTH = 1024;
export const MAX_TEXT_LENGTH = 4000;

/** Images in one album. Beyond this the grid stops being a grid (chat media spec §3). */
export const MAX_ALBUM_SIZE = 10;

/** Which attachment kind each message type must carry, or `null` when it carries none. */
const REQUIRED_KIND: Record<MessageType, MediaKind | null> = {
  [MessageType.TEXT]: null,
  [MessageType.STICKER]: null,
  [MessageType.SYSTEM]: null,
  [MessageType.IMAGE]: MediaKind.IMAGE,
  [MessageType.GIF]: MediaKind.GIF,
  [MessageType.VIDEO]: MediaKind.VIDEO,
  [MessageType.VOICE]: MediaKind.VOICE,
  [MessageType.FILE]: MediaKind.FILE,
};

/** Types where a caption alongside the attachment makes sense. */
const CAPTIONABLE = new Set([MessageType.IMAGE, MessageType.VIDEO, MessageType.FILE]);

/** The attachment kind a message of this type must reference, or `null`. */
export function requiredKindFor(type: MessageType): MediaKind | null {
  return REQUIRED_KIND[type];
}

/**
 * Normalises and validates the text part of a send (chat media spec §2.1).
 *
 * - `TEXT` — required, 1..4000.
 * - `IMAGE` / `VIDEO` / `FILE` — optional caption, ≤ 1024.
 * - everything else — must be absent. A voice note or a sticker with a caption has nowhere to
 *   render it, so accepting one would silently drop the user's text.
 *
 * Returns the body to store.
 */
export function normalizeBody(type: MessageType, raw: string | null | undefined): string | null {
  const text = typeof raw === 'string' ? raw.trim() : null;

  if (type === MessageType.TEXT) {
    if (text === null || text.length === 0) {
      throw new AppException(ERROR_CODE.MESSAGE_EMPTY, 422, "Xabar bo'sh bo'lishi mumkin emas");
    }
    if (text.length > MAX_TEXT_LENGTH) {
      throw AppException.validation({ body: `Xabar ${MAX_TEXT_LENGTH} belgidan oshmasligi kerak` });
    }
    return text;
  }

  if (text === null || text.length === 0) {
    return null;
  }

  if (!CAPTIONABLE.has(type)) {
    throw AppException.validation({ body: 'Bu turdagi xabarga izoh qo‘shib bo‘lmaydi' });
  }
  if (text.length > MAX_CAPTION_LENGTH) {
    throw AppException.validation({ body: `Izoh ${MAX_CAPTION_LENGTH} belgidan oshmasligi kerak` });
  }
  return text;
}

/** §C1 caps a quote at 300 characters — a longer selection is the whole message, not a quote. */
export const MAX_QUOTE_LENGTH = 300;

/** The reply preview stored on the replying message (§C2) — enough to recognise, not to re-read. */
export const MAX_REPLY_PREVIEW = 120;

/**
 * Checks that a quote really is the slice of the target it claims to be (§C1). Offsets are UTF-16
 * code units, which is what the client counts too.
 */
export function assertQuoteMatches(body: string | null, text: string, offset: number): void {
  if (text.length > MAX_QUOTE_LENGTH) {
    throw new AppException(
      ERROR_CODE.QUOTE_TOO_LONG,
      422,
      `Sitata ${MAX_QUOTE_LENGTH} belgidan oshmasligi kerak`,
    );
  }
  // A negative offset would make `slice` count from the end and pass a check it should not.
  if (body === null || offset < 0 || body.slice(offset, offset + text.length) !== text) {
    throw new AppException(ERROR_CODE.QUOTE_NOT_FOUND, 422, 'Sitata asl xabarda topilmadi');
  }
}
