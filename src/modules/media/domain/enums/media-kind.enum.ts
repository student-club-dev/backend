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

/**
 * Where a GIF came from when the student picked it from search instead of uploading it.
 *
 * Only `KLIPY` is ever written today. `GIPHY` and `TENOR` are kept so this enum stays in lockstep
 * with the Postgres type — dropping a value there needs a migration and fails on any row still
 * holding it, and neither is worth spending one on for two unused labels.
 */
export enum MediaProvider {
  KLIPY = 'KLIPY',
  GIPHY = 'GIPHY',
  TENOR = 'TENOR',
}
