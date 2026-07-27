/** Message kind. Wire values match the Prisma `MessageType`. v1 sends TEXT; the rest arrive in v2. */
export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  FILE = 'FILE',
  VOICE = 'VOICE',
  SYSTEM = 'SYSTEM',
}
