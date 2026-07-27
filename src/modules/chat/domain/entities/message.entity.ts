import { MessageType } from '../enums/message-type.enum';

/** A chat message with a per-conversation monotonic `seq` (C4). */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  seq: number;
  type: MessageType;
  body: string | null;
  createdAt: Date;
}
