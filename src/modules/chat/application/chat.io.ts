import { Message } from '../domain/entities/message.entity';
import { MessageType } from '../domain/enums/message-type.enum';

/** A page of application results plus the unpaginated total (the controller derives `hasNext`). */
export interface Page<T> {
  items: T[];
  total: number;
}

/**
 * A cursor page of messages plus whether more exist past it, in whichever direction the caller is
 * paging. Unlike an offset page there is no `total` — the history is a `seq` cursor walk (§17.5).
 */
export interface MessagePage {
  items: Message[];
  hasMore: boolean;
}

/** Deterministic key for the DIRECT conversation of a pair — order-independent (C3). */
export function directKeyOf(a: string, b: string): string {
  return [a, b].sort().join(':');
}

/**
 * A send request, already parsed from REST body or WS payload. `type` absent means `TEXT` — the
 * shape an older client sends, which must keep working.
 */
export interface SendMessageInput {
  conversationId: string;
  type?: MessageType;
  body?: string | null;
  mediaId?: string | null;
  albumId?: string | null;
  clientMsgId?: string | null;
}
