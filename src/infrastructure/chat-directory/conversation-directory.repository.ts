export const CONVERSATION_DIRECTORY = Symbol('CONVERSATION_DIRECTORY');

export interface ConversationDirectoryRepository {
  /**
   * Resolve a pair to their 1:1 conversation, creating it if this is their first contact.
   *
   * The conversation is resolved **server-side from the pair** — a client-supplied
   * `conversationId` is ignored. Trusting it would let a caller name a conversation they are not a
   * member of, and the CALL message written when the call ends would land in two strangers' chat,
   * shifting their `seq` and their unread count (design §6.1.2).
   */
  findOrCreateDirect(a: string, b: string): Promise<string>;
}
