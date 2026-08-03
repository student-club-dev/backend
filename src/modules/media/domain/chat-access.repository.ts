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

  /**
   * Whether the story backed by this asset is still live (not expired, not deleted).
   *
   * Story media outlives the story now — an expired story stays in its author's archive — so
   * "connected to the owner" is no longer enough on its own. Past `expiresAt` the audience narrows
   * to the author alone, and this is the question that narrows it. `false` for an asset that backs
   * no story at all, which fails closed.
   */
  isStoryLive(mediaId: string): Promise<boolean>;
}
