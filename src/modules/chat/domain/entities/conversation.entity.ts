import { ConversationType } from '../enums/conversation-type.enum';

/** A conversation aggregate root (unified DIRECT/GROUP, C3). */
export interface Conversation {
  id: string;
  type: ConversationType;
  createdAt: Date;
  lastMessageAt: Date | null;
}

/** A member's row, carrying the per-member read/delivered cursors (C5) and history watermark (§B1). */
export interface ConversationMember {
  conversationId: string;
  studentId: string;
  lastReadSeq: number;
  lastDeliveredSeq: number;
  /** Reads hide `seq <= clearedBeforeSeq` for this member alone. `0` ⇒ nothing cleared. */
  clearedBeforeSeq: number;
}
