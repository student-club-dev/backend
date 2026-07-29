/** Injection token for the reportable-message lookup port (bound to the Prisma impl in the module). */
export const MESSAGE_DIRECTORY = Symbol('MESSAGE_DIRECTORY');

/** The slice of a message a report needs: its id, and the text to snapshot for moderation. */
export interface ReportableMessage {
  id: string;
  body: string | null;
}

/**
 * Looks up a message the reporter is entitled to report (C12, §17.4).
 *
 * Existence and membership are deliberately one question rather than two: a message in someone
 * else's conversation must be indistinguishable from one that does not exist, or the report
 * endpoint turns into a probe for other people's message ids.
 */
export interface MessageDirectoryRepository {
  /** The message, only when `reporterId` is a member of its conversation; `null` otherwise. */
  findReportable(messageId: string, reporterId: string): Promise<ReportableMessage | null>;
}
