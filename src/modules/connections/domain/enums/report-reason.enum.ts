/** Why a user or message is reported (C12). Wire values match the Prisma `ReportReason` enum. */
export enum ReportReason {
  SPAM = 'SPAM',
  SCAM = 'SCAM',
  HARASSMENT = 'HARASSMENT',
  INAPPROPRIATE = 'INAPPROPRIATE',
  OTHER = 'OTHER',
}
