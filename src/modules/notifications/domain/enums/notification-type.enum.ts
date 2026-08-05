/**
 * What a notification row looks like in the list — icon and colour, nothing else (spec §1.1).
 *
 * It carries no behaviour on purpose: where a tap leads is `NotificationTargetType`'s job. Keeping
 * the two apart is what lets a `CHAT`-coloured row point at `MY_LISTINGS` when that is what the
 * event actually means, and it is why adding a value here can never change navigation.
 */
export enum NotificationType {
  JOB = 'JOB',
  DISCOUNT = 'DISCOUNT',
  LISTING = 'LISTING',
  CHAT = 'CHAT',
  CONNECTION = 'CONNECTION',
  SYSTEM = 'SYSTEM',
}
