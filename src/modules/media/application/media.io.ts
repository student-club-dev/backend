/** The subset of an uploaded multipart file the media use-case reads. A Multer file fits structurally. */
export interface UploadedImage {
  buffer: Buffer;
  size: number;
}

/** Result of a successful upload. `thumbUrl`/`cardUrl` are null in v1 (variants deferred to sharp). */
export interface MediaUploadResult {
  url: string;
  thumbUrl: string | null;
  cardUrl: string | null;
}
