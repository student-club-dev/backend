import { open } from 'fs/promises';
import FileType from 'file-type';
import { MediaKind } from '../domain/enums/media-kind.enum';
import { MEDIA_LIMITS } from '../domain/media-limits';

/** What the bytes actually are, plus the extension to store them under. */
export interface DetectedType {
  mimeType: string;
  extension: string;
}

/** What an unidentifiable file is called. Also what `kind = FILE` is always *served* as. */
const OPAQUE_MIME_TYPE = 'application/octet-stream';

/**
 * Types with no magic bytes at all. `file-type` cannot identify these — nothing can, they are just
 * bytes — so they are accepted only when the declared type says so *and* the content survives a
 * UTF-8 round trip with no control characters. That combination is what stops an executable being
 * waved through as `text/plain` into a kind that has an allowlist.
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
  if (buffer.includes(0)) {
    return false;
  }
  const decoded = buffer.toString('utf8');
  if (decoded.includes('�')) {
    return false; // invalid UTF-8 — not a text document
  }
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(decoded);
}

/** First `length` bytes of a file, or fewer if it is shorter. */
async function readHead(path: string, length: number): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Identifies an upload from its **content**, never from the `Content-Type` header or the filename —
 * both are attacker-supplied.
 *
 * Returns `null` when the bytes are not something the given `kind` accepts, which the caller turns
 * into `FILE_TYPE_NOT_ALLOWED`. For a kind with no allowlist — `FILE`, since parity spec §1 — it
 * never returns `null`: every type is acceptable there, and the detected type is kept only so the
 * client can pick a document icon. It is never sent back as a `Content-Type`.
 */
export async function detectMediaType(
  path: string,
  kind: MediaKind,
  declaredMimeType: string | undefined,
): Promise<DetectedType | null> {
  const allowed = MEDIA_LIMITS[kind].mimeTypes;
  const detected = await FileType.fromFile(path);

  // No allowlist: anything at all is fine, and nothing about the bytes can reject the upload.
  if (allowed === null) {
    return detected !== undefined
      ? { mimeType: detected.mime, extension: detected.ext }
      : { mimeType: OPAQUE_MIME_TYPE, extension: 'bin' };
  }

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
  return looksLikeText(await readHead(path, 8192))
    ? { mimeType: declaredMimeType, extension: textExtension }
    : null;
}
