import FileType from 'file-type';
import { MediaKind } from '../domain/enums/media-kind.enum';
import { MEDIA_LIMITS } from '../domain/media-limits';

/** What the bytes actually are, plus the extension to store them under. */
export interface DetectedType {
  mimeType: string;
  extension: string;
}

/**
 * Types with no magic bytes at all. `file-type` cannot identify these — nothing can, they are just
 * bytes — so they are accepted only when the declared type says so *and* the content survives a
 * UTF-8 round trip with no control characters. That combination is what stops an executable being
 * waved through as `text/plain`.
 */
const TEXT_TYPES: Record<string, string> = {
  'text/plain': 'txt',
  'text/csv': 'csv',
};

/** Office formats are ZIP containers; `file-type` reports the container, not the document. */
const ZIP_BASED: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

/** Printable text (plus tab/CR/LF) only — no NUL, no other control bytes. */
function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8192);
  if (sample.includes(0)) {
    return false;
  }
  const decoded = sample.toString('utf8');
  if (decoded.includes('�')) {
    return false; // invalid UTF-8 — not a text document
  }
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(decoded);
}

/**
 * Identifies an upload from its **content**, never from the `Content-Type` header or the filename —
 * both are attacker-supplied. Returns `null` when the bytes are not something the given `kind`
 * accepts, which the caller turns into `FILE_TYPE_NOT_ALLOWED`.
 */
export async function detectMediaType(
  buffer: Buffer,
  kind: MediaKind,
  declaredMimeType: string | undefined,
): Promise<DetectedType | null> {
  const allowed = MEDIA_LIMITS[kind].mimeTypes;
  const detected = await FileType.fromBuffer(buffer);

  if (detected !== undefined) {
    // An Office document arrives as a ZIP. Trust the declared subtype only when the container really
    // is a ZIP and that subtype is one we accept — the bytes still had to prove they are a ZIP.
    if (detected.mime === 'application/zip' && declaredMimeType !== undefined) {
      const zipExtension = ZIP_BASED[declaredMimeType];
      if (zipExtension !== undefined && allowed.includes(declaredMimeType)) {
        return { mimeType: declaredMimeType, extension: zipExtension };
      }
    }
    if (!allowed.includes(detected.mime)) {
      return null;
    }
    return { mimeType: detected.mime, extension: detected.ext };
  }

  // No signature. Only the text formats are legitimately signature-less.
  if (declaredMimeType === undefined) {
    return null;
  }
  const textExtension = TEXT_TYPES[declaredMimeType];
  if (textExtension === undefined || !allowed.includes(declaredMimeType)) {
    return null;
  }
  return looksLikeText(buffer) ? { mimeType: declaredMimeType, extension: textExtension } : null;
}
