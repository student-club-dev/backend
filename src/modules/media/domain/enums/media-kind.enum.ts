/** What kind of attachment a chat upload is. Wire values match the Prisma `MediaKind`. */
export enum MediaKind {
  IMAGE = 'IMAGE',
  GIF = 'GIF',
  VIDEO = 'VIDEO',
  VOICE = 'VOICE',
  FILE = 'FILE',
}

/** Processing state. `PROCESSING` only ever applies to video, which transcodes on a queue. */
export enum MediaStatus {
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
}

/** Where a GIF came from when the student picked it from search instead of uploading it. */
export enum MediaProvider {
  TENOR = 'TENOR',
  GIPHY = 'GIPHY',
}
