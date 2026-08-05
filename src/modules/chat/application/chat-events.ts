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
  CONVERSATION_DELETED: 'conversation:deleted',
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
  /** Album size, first message only (mobile 01-QOLGAN_ISHLAR §1). Mirrors the REST DTO. */
  albumSize?: number;
  /** Reply target (§C1) — same validation as REST. */
  replyToMessageId?: string;
  quote?: { text: string; offset: number };
}

/**
 * `message:deleted` — one event per batch (§A3). `messageId`/`seq` repeat the first element for
 * clients built against the single-message version. `EVERYONE` reaches both members, `ME` only the
 * deleter's own devices.
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
 * `history:cleared` (§B1). Same audience rule as `message:deleted`. Clients drop everything at or
 * below `clearedBeforeSeq` and keep the conversation in the list.
 */
export interface HistoryClearedPayload {
  conversationId: string;
  clearedBeforeSeq: number;
  scope: string;
  by: string;
}

/** `conversation:deleted` (§B2). A later `message:new` for the same id brings it back. */
export interface ConversationDeletedPayload {
  conversationId: string;
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
