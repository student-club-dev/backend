/** Injection token for the unread-message count the badge needs. */
export const MESSAGE_UNREAD_PORT = Symbol('MESSAGE_UNREAD_PORT');

/**
 * The chat half of the app-icon badge (push catalogue §4.2):
 *
 *     badge = unread messages + unread notifications
 *
 * A port rather than a direct call into chat, because the dependency genuinely runs both ways —
 * chat needs push to reach an offline recipient, and every push needs this number. Naming the seam
 * keeps that mutual need to one interface instead of two modules reaching into each other.
 *
 * It matters that both halves are added. iOS does not compute the badge itself: whatever the server
 * sends is what the user sees, so a push that counted only one of the two would visibly overwrite
 * the other's number every time it arrived.
 */
export interface MessageUnreadPort {
  /** Total unread messages for a student — the same figure `GET /v1/conversations/unread-count` returns. */
  unreadTotalFor(studentId: string): Promise<number>;
}
