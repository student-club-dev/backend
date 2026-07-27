/**
 * Lifecycle of a connection edge. Wire values match the Prisma `ConnectionStatus` enum. A request
 * starts PENDING; the addressee moves it to ACCEPTED (now connected) or DECLINED.
 */
export enum ConnectionStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
}
