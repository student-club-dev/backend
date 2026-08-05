/**
 * Which screen a notification opens (spec §1.2).
 *
 * Paired with `targetId` rather than sent as a finished deep link: the app owns its own navigation,
 * so a route rename there must not become a backend deploy here.
 *
 * `CHAT` and `LISTING` need an id; the rest address a screen and carry none.
 */
export enum NotificationTargetType {
  CHAT = 'CHAT',
  LISTING = 'LISTING',
  CONNECTION_REQUESTS = 'CONNECTION_REQUESTS',
  MY_LISTINGS = 'MY_LISTINGS',
  PROFILE = 'PROFILE',
}
