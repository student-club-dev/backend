/** Moderation lifecycle of a report (C12). Wire values match the Prisma `ReportStatus` enum. */
export enum ReportStatus {
  OPEN = 'OPEN',
  REVIEWED = 'REVIEWED',
  ACTIONED = 'ACTIONED',
  DISMISSED = 'DISMISSED',
}
