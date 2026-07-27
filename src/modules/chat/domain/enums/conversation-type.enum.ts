/** Conversation kind. Wire values match the Prisma `ConversationType`. v1 uses DIRECT; GROUP is v3. */
export enum ConversationType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
}
