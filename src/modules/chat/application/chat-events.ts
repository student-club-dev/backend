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
  READ_RECEIPT: 'message:read',
  DELIVERED_RECEIPT: 'message:delivered',
  TYPING: 'typing',
  PRESENCE_UPDATE: 'presence:update',
} as const;

/** `message:send` payload; `clientMsgId` makes retries idempotent (C6). */
export interface SendMessagePayload {
  conversationId: string;
  clientMsgId: string;
  body: string;
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
