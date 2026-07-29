import { MediaAsset } from '../../../media/domain/entities/media-asset.entity';
import { MessageType } from '../enums/message-type.enum';
import { MessageSticker } from '../sticker-directory.repository';

/** A chat message with a per-conversation monotonic `seq` (C4). */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  seq: number;
  type: MessageType;
  body: string | null;
  /** The sender's idempotency key (C6). Null for server/system messages. */
  clientMsgId: string | null;
  /**
   * When the sender deleted it (§18). The row survives so `seq` has no holes; `body` is blanked and
   * the message stops counting as unread. Clients render a "message deleted" tombstone.
   */
  deletedAt: Date | null;
  /** Groups the messages of one multi-image send. Presentation only — each keeps its own `seq`. */
  albumId: string | null;
  /** The uploaded (or provider) attachment, when this message carries one. */
  attachment: MediaAsset | null;
  /** The sticker, for `STICKER` messages. Catalogue content, not an upload. */
  sticker: MessageSticker | null;
  createdAt: Date;
}
