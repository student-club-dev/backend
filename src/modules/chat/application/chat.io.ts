import { Message } from '../domain/entities/message.entity';

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
