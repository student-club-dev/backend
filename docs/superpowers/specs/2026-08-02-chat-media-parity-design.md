# Chat media parity (§1–§7) — design

Source requirement: `docs/api/mobile_questions/CHAT_MEDIA_PARITY_BACKEND.md`.
Scope: all seven sections, one pass. Approved 2026-08-02.

## 0. Foundation — the upload path stops going through RAM

Everything in `ChatMediaService` today reads `file.buffer`, produced by multer `memoryStorage`.
§2 removes the size ceiling, so a single 2 GB upload would be 2 GB of heap. Every other section
depends on fixing this first.

`UploadedChatFile` becomes path-based:

```ts
export interface UploadedChatFile {
  path: string;          // temp file under CHAT_MEDIA_DIR/tmp, removed after the request
  size: number;
  mimetype?: string;
  originalname?: string;
}
```

Consequences, all of them simplifications:

| Consumer | Before | After |
|---|---|---|
| `detectMediaType` | whole buffer | ~8 KB head read from the path |
| `processImage`, `readDimensions` | `sharp(buffer)` | `sharp(path)` — native |
| ffmpeg paths | buffer written to a scratch file first | the temp file *is* the scratch file |
| `ChatMediaStorage` | `save(buffer, ext)` | `saveFile(tempPath, ext)` — `rename()` on the same filesystem, stream-copy across |

`saveBuffer` is kept for **derived** artifacts only (thumbnails, posters, transcoded output), which
are small and already in memory.

The temp directory lives under `CHAT_MEDIA_DIR/tmp` so `rename()` into the media root is an atomic
metadata operation rather than a copy. The service removes the temp file in a `finally`, on every
path including rejection.

This is what makes §1.2 true *by construction*: for `kind = FILE` the temp file is moved into
storage and never read, so the sha256 cannot change.

## 1. `kind = FILE` accepts every type; delivery is hardened

### Accept

- `KindLimits.mimeTypes` becomes `readonly string[] | null`; `null` means "any". Only `FILE` is `null`.
- `BLOCKED_EXTENSIONS` and `hasBlockedExtension` are deleted — `FILE` was their only caller, so this
  change orphans them.
- `detectMediaType` for a `null` allowlist: sniff best-effort, fall back to `application/octet-stream`.
  It never returns `null` for `FILE`, so `FILE_TYPE_NOT_ALLOWED` becomes unreachable for that kind.
- The extension↔type consistency check disappears with the allowlist.
- `sanitizeFileName` stays. Path traversal is not a type restriction.

The sniffed MIME is still **stored** on the row, so the client can pick a document icon. It is never
emitted as a header — §1.3's table constrains the response, not the database.

### Deliver

`GET /v1/media/{id}/raw`:

| Header | Rule |
|---|---|
| `Content-Type` | `application/octet-stream` whenever `kind = FILE`; real type otherwise |
| `Content-Disposition` | `attachment; …` always for `FILE`, even when `fileName` is null (falls back to the id) |
| `X-Content-Type-Options` | `nosniff` — every kind |
| `Content-Security-Policy` | `default-src 'none'; sandbox` — every kind |

`IMAGE`/`GIF`/`VIDEO`/`VOICE`/`VIDEO_NOTE` keep their real `Content-Type` and no `attachment`
disposition: they are decoded and type-checked on upload, so inline is safe and the client needs it.

Serving media from a separate origin is a deployment change, documented in `deploy/nginx/README.md`.

## 2. Limits removed

`maxBytes` is deleted from `KindLimits` outright, along with `MAX_UPLOAD_BYTES`. Remaining ceilings:

| Kind | Bytes | Duration |
|---|---|---|
| `VIDEO_NOTE` | 12 MB | 60 s |
| `STORY_VIDEO` | — | 60 s → `422 STORY_VIDEO_TOO_LONG` |
| everything else | — | — |

`VIDEO_NOTE`'s caps come from §5, which defines the format; §2's table does not list it.

Guards that stay (§2.1 asks for them explicitly — they key off rate and server state, not file size):

- quota **60 uploads/min, 20 GB/day** per account (`CHAT_UPLOADS_PER_MINUTE`,
  `CHAT_UPLOAD_BYTES_PER_DAY`)
- `statfs` before writing bytes; over 85 % used → **`503 STORAGE_FULL`**
- `maxDimension` 8192 → **16384**. This is a decompression-bomb guard, not a product limit: a
  50000×50000 PNG is a small file that OOMs sharp. 16384 is sharp's own default pixel ceiling, and
  anything larger can still be sent as `FILE`, unchanged.
- `deploy/nginx/media-upload.conf`: `client_max_body_size 0; proxy_request_buffering off;`

## 3. `IMAGE_ORIGINAL`

New chat kind. Message type stays `IMAGE`.

- **No EXIF and orientation is normal → the original bytes are stored verbatim.** This is the
  screenshot case and most already-processed images, and it makes "original quality" literally true.
- **EXIF present → re-encode at q95, same format, full resolution, orientation baked into pixels.**
  Stripping GPS is the point of the kind; losing a little to do it is the trade §3 asks for.
- HEIC/HEIF with EXIF falls back to JPEG q95 — sharp cannot encode HEIC.
- Thumbnail and blurHash are generated either way.

`requiredKindFor` becomes a set-valued lookup so `MessageType.IMAGE` accepts `IMAGE` **or**
`IMAGE_ORIGINAL`.

## 4. Video

- `quality: AUTO | HIGH | ORIGINAL`, optional on upload, persisted as a `MediaQuality` column so the
  transcoder knows which ladder to use when it runs.
  - `ORIGINAL` — never enqueued. ffprobe metadata and a poster frame, nothing else.
  - `HIGH` — 1080p / crf 21 when a transcode is needed.
  - `AUTO` (default) — today's 1280×720 / crf 24.
  - The *decision* to transcode is unchanged for `AUTO` and `HIGH`: H.264/AAC ⇒ `READY`.
- §4.3: `variants Json?` column and an `AttachmentDto.variants` field, always `null` in v1.

## 5. `VIDEO_NOTE`

New `MediaKind` **and** new `MessageType`.

12 MB · ≤ 60 s · mp4/quicktime · poster from frame 0 · square enforced after ffprobe
(`width !== height` → `422 MEDIA_NOT_SQUARE`) · `body` rejected, which falls out of the existing
`CAPTIONABLE` set without a code change.

Same transcode pipeline as `VIDEO`.

## 6. Voice

- `WAVEFORM_POINTS` 48 → **100**. Existing rows keep their 48 points; the client draws whatever
  length it receives, so no backfill.
- `audio/opus` and `audio/webm` added alongside the existing `audio/ogg` and the m4a/AAC set, so
  every Opus container is accepted. m4a stays — iOS's system recorder cannot produce Opus.
- Duration ceiling removed.
- `transcript String?` column and DTO field, `null` in v1.

## 7. Resumable chunked upload

New `UploadSession` model and `UploadSessionController` under `/v1/media/upload`.

```
POST   /v1/media/upload/init                     → { uploadId, chunkSize, expiresAt }
PUT    /v1/media/upload/{uploadId}/part/{index}  → { received: number[] }
POST   /v1/media/upload/{uploadId}/complete      → AttachmentDto
GET    /v1/media/upload/{uploadId}               → { received, chunkSize, totalBytes, expiresAt }
DELETE /v1/media/upload/{uploadId}
```

**Received-part state lives on the filesystem, not in the database.** Parts are files at
`CHAT_MEDIA_DIR/incoming/{uploadId}/{index}`; `GET` is a `readdir`. Parallel, out-of-order and
repeated PUTs are then correct with no locking at all — idempotence is `write → rename` over the same
path. A `received Int[]` column would lose updates under concurrent PUTs unless every write went
through raw `array_append` SQL.

- `init` runs the same permission and disk checks as `chat-upload`.
- `PUT part` pipes the raw request stream straight to disk. Never buffered. `index` is authoritative;
  `Content-Range` is accepted and ignored.
- `complete` concatenates the parts into one temp file and feeds it to **the same pipeline as
  `chat-upload`** — possible only because of §0.
- Quota is charged at `complete`. Incomplete sessions do not count (§7).
- No `mediaId` exists before `complete`.
- 24 h TTL, swept by a new cron next to `orphan-media.cron.ts`.

`POST /v1/media/chat-upload` is unchanged as an endpoint and stays the fast path for small files.

## 8. Schema migration

One additive migration, no destructive change and no row rewrite:

- `MediaKind += IMAGE_ORIGINAL, VIDEO_NOTE`
- `MessageType += VIDEO_NOTE`
- new enum `MediaQuality { AUTO, HIGH, ORIGINAL }`
- `MediaAsset += quality, transcript, variants`
- new model `UploadSession`

Postgres allows `ALTER TYPE … ADD VALUE` in a transaction on 12+; the new values are not *used* by
the same migration, so there is no ordering hazard.

## 9. New error codes

`STORY_VIDEO_TOO_LONG` (422) · `MEDIA_NOT_SQUARE` (422) · `STORAGE_FULL` (503) ·
`UPLOAD_SESSION_NOT_FOUND` (404) · `UPLOAD_INCOMPLETE` (422) · `UPLOAD_SIZE_MISMATCH` (422)

`FILE_TOO_LARGE` is retained — the listing-image endpoint still uses it — but no chat upload can
return it any more.

## 10. Verification

- `media-limits.spec.ts`, `waveform.spec.ts`, `media-type.detector.spec.ts`, `chat-media.service.spec.ts` updated
- new specs for the upload-session service and the disk-space guard
- byte-identity check for `kind = FILE` (§1.2's acceptance criterion) as a unit test over the
  storage + detector path
- `npm run lint`, `npm run build`, `npm test`
- `npm run openapi:dump` to regenerate `docs/api/generated/student.json`
