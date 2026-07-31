/**
 * Who a delete applies to (§A1). `EVERYONE` soft-deletes the row for both members and is allowed
 * only on your own messages; `ME` hides it for the caller and mutates nothing.
 */
export enum DeleteScope {
  ME = 'ME',
  EVERYONE = 'EVERYONE',
}
