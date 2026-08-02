/** Message kind. Wire values match the Prisma `MessageType`. */
export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  GIF = 'GIF',
  VIDEO = 'VIDEO',
  /** Round video message (parity spec §5) — square, short, and never captioned. */
  VIDEO_NOTE = 'VIDEO_NOTE',
  FILE = 'FILE',
  VOICE = 'VOICE',
  STICKER = 'STICKER',
  SYSTEM = 'SYSTEM',
  CALL = 'CALL',
}
