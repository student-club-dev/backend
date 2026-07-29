/** Message kind. Wire values match the Prisma `MessageType`. */
export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  GIF = 'GIF',
  VIDEO = 'VIDEO',
  FILE = 'FILE',
  VOICE = 'VOICE',
  STICKER = 'STICKER',
  SYSTEM = 'SYSTEM',
}
