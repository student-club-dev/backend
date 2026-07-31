/** WebSocket event names for the `/chat` namespace (docs/architecture/chat.md real-time protocol). */
export const CHAT_EVENT = {
  // client → server
  MESSAGE_SEND: 'message:send',
  MESSAGE_READ: 'message:read',
  MESSAGE_DELIVERED: 'message:delivered',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  // server → client
  MESSAGE_NEW: 'message:new',
  MESSAGE_DELETED: 'message:deleted',
  HISTORY_CLEARED: 'history:cleared',
  MEDIA_READY: 'media:ready',
  READ_RECEIPT: 'message:read',
  DELIVERED_RECEIPT: 'message:delivered',
  TYPING: 'typing',
  PRESENCE_UPDATE: 'presence:update',
} as const;

/**
 * `message:send` payload; `clientMsgId` makes retries idempotent (C6). Everything past
 * `conversationId` is optional so a client that only knows about text keeps working unchanged —
 * omitting `type` means `TEXT`.
 */
export interface SendMessagePayload {
  conversationId: string;
  clientMsgId?: string;
  type?: string;
  body?: string;
  mediaId?: string;
  stickerId?: string;
  albumId?: string;
}

/**
 * `message:deleted` — one event per batch, not per message (§A3). Deleting 50 selected messages
 * used to mean 50 events, each triggering its own list re-render on the receiving device.
 *
 * `messageId`/`seq` repeat the first element so clients built against the single-message version
 * keep working untouched; anything new reads `ids`/`seqs`.
 *
 * Audience depends on `scope`: `EVERYONE` reaches both members, `ME` reaches only the deleter's own
 * devices — the message is still there for the other member, and telling them otherwise would erase
 * it from their screen too.
 */
export interface MessageDeletedPayload {
  conversationId: string;
  ids: string[];
  seqs: number[];
  scope: string;
  deletedBy: string;
  /** @deprecated Use `ids`. First element, kept for already-shipped clients. */
  messageId: string;
  /** @deprecated Use `seqs`. First element, kept for already-shipped clients. */
  seq: number;
}

/**
 * `history:cleared` (§B1). Same audience rule as `message:deleted`: `ME` reaches only the clearer's
 * own devices, `EVERYONE` reaches both members. Clients drop everything at or below
 * `clearedBeforeSeq` and keep the conversation in the list with a null last message.
 */
export interface HistoryClearedPayload {
  conversationId: string;
  clearedBeforeSeq: number;
  scope: string;
  by: string;
}

/** `{ conversationId, seq }` — used by both `message:read` and `message:delivered` from the client. */
export interface CursorPayload {
  conversationId: string;
  seq: number;
}

/** `typing:start` / `typing:stop` payload. */
export interface TypingPayload {
  conversationId: string;
}
