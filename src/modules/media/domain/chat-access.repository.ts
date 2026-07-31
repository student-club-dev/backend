/** Injection token for the conversation-access port used by chat media. */
export const CHAT_ACCESS = Symbol('CHAT_ACCESS');

/**
 * The two questions chat media has to ask about a conversation, kept as a narrow port so the media
 * module never reaches into the chat module's repositories.
 */
export interface ChatAccessRepository {
  /** Whether the student is a member of the conversation. */
  isMember(conversationId: string, studentId: string): Promise<boolean>;

  /**
   * Whether the student may still send here: they are a member, the counterpart is still a
   * connection, and neither has blocked the other. Uploading is gated on this so the server is
   * never used as free file hosting by someone with no one to send to.
   */
  canSend(conversationId: string, studentId: string): Promise<boolean>;

  /**
   * Whether two students have an accepted connection and neither has blocked the other — the same
   * gate chat itself uses. Story media is authorised by this rather than by conversation membership:
   * a story is visible to every connection, including those you have never messaged.
   */
  areConnected(a: string, b: string): Promise<boolean>;
}
