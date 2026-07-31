import { MediaAsset } from '../../../media/domain/entities/media-asset.entity';
import { MessageType } from '../enums/message-type.enum';
import { MessageSticker } from '../sticker-directory.repository';

/** A frozen copy of what a message replied to (§C2). Only `originalDeleted` is read live. */
export interface ReplySnapshot {
  /** `null` once the target row has been purged. */
  id: string | null;
  seq: number;
  senderId: string;
  senderName: string | null;
  type: MessageType;
  /** Shortened target text; `null` for media. */
  preview: string | null;
  quote: { text: string; offset: number } | null;
  originalDeleted: boolean;
}

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
  /** What this message replied to, frozen at send time (§C2). */
  replyTo: ReplySnapshot | null;
  createdAt: Date;
}
