/**
 * Who a delete applies to (§A1).
 *
 * `EVERYONE` is the existing soft delete: the row keeps its `seq`, `body` is blanked, and both
 * members see a tombstone. It is only allowed on your own messages.
 *
 * `ME` touches no message row at all — it writes a `message_hidden` tombstone for the caller, so the
 * message disappears on every device they own and stays put for the other member. Because nothing is
 * mutated, it applies to any message in the conversation, the other member's included.
 */
export enum DeleteScope {
  ME = 'ME',
  EVERYONE = 'EVERYONE',
}
