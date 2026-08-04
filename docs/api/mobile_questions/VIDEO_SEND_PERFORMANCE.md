# Video Message Send — Performance Analysis

**Status:** analysis only, no code changed.
**Date:** 2026-08-01
**Branch:** `feature-modularization`
**Symptom:** sending a video message takes minutes; Telegram feels near-instant.

---

## 1. Where the code lives

| Step | File | Key symbols |
|---|---|---|
| **(a) Pick video** | `dev/core/uikit/src/androidMain/kotlin/dev/core/uikit/media/VideoPicker.android.kt` | `rememberVideoPicker`, `launchStaging`, `readVideoMeta`, `stageVideoFile`, `copyToCache` |
| **(a) Record video** | `dev/core/uikit/src/androidMain/kotlin/dev/core/uikit/media/VideoCapture.android.kt` | `rememberVideoCapture`, `newCaptureFile`, `captureUriOrNull` |
| **(b) Compression** | `dev/core/uikit/src/androidMain/kotlin/dev/core/uikit/media/VideoCompressor.android.kt` | `compressVideo` (Media3 `Transformer`) |
| **(b) Compression gate** | `dev/core/uikit/src/androidMain/kotlin/dev/core/uikit/media/VideoPreparer.android.kt`<br>`dev/core/uikit/src/commonMain/kotlin/dev/core/uikit/media/VideoPicker.kt` | `Context.prepare`, `videoNeedsPreparing`, `VideoPreparer` (expect/actual) |
| **(c) Thumbnail / poster** | `VideoPicker.android.kt` | `readVideoMeta` → `retriever.getFrameAtTime(0)` → `Bitmap.toJpegBytes()` (JPEG q=80) |
| **(d) Upload** | `dev/core/network/src/commonMain/kotlin/dev/core/network/media/MediaUploader.kt`<br>`dev/feature/chat/data/src/commonMain/kotlin/dev/feature/chat/data/remote/ChatRemoteDataSource.kt`<br>`dev/feature/chat/data/src/commonMain/kotlin/dev/feature/chat/data/repository/ChatRepositoryImpl.kt` | `chatUploadFile`, `filePart(path, …)`, `uploadAttachmentFile`, `uploadAndDeliverVideo` |
| **(e) Playback** | `dev/core/uikit/src/androidMain/kotlin/dev/core/uikit/media/VideoPlayer.android.kt` | `ScVideoPlayer`, `VideoCache` (512 MB LRU `SimpleCache`), `AlwaysCacheDataSource` |
| **UI entry** | `dev/feature/chat/presentation/src/commonMain/kotlin/dev/feature/chat/presentation/ChatScreen.kt`<br>`…/VideoPreviewSheet.kt`, `…/ChatViewModel.kt` | `videoPicker`, `VideoPreviewSheet`, `PickedVideo.toOutgoing`, `ChatViewModel.sendVideo` |

iOS mirrors exist: `VideoCompressor.ios.kt` uses `AVAssetExportSession` with
`AVAssetExportPreset1920x1080` / `AVAssetExportPreset1280x720`.

---

## 2. Current flow, step by step

### Phase A — before "Send" is even shown

`VideoPicker.android.kt:56`

```kotlin
internal fun CoroutineScope.launchStaging(context: Context, uri: Uri, onResult: (PickedVideo?) -> Unit): Job = launch {
    val picked = withContext(Dispatchers.IO) {
        runCatching {
            val meta = context.readVideoMeta(uri) ?: return@runCatching null   // metadata + frame-0 decode
            context.stageVideoFile(uri, meta)                                   // FULL FILE COPY
        }.getOrNull()
    }
    onResult(picked)
}
```

`copyToCache` (`VideoPicker.android.kt:144`) streams the **entire** source file into `cacheDir`:

```kotlin
val target = File(cacheDir, "outgoing_video_${System.currentTimeMillis()}.${videoExtension(uri)}")
contentResolver.openInputStream(uri)?.use { input -> target.outputStream().use { output -> input.copyTo(output) } }
```

For a camera recording this is a **second** copy — `newCaptureFile()` already wrote the file into
`cacheDir/sc_capture/` (`VideoCapture.android.kt:76`), then `launchStaging` copies it again and the
original is deleted. A 180 MB 4K clip is read + written in full purely to move it one directory over.

Only after that does `previewVideo` get set and `VideoPreviewSheet` open.

### Phase B — user taps Send

`ChatScreen.kt:881`

```kotlin
onSend = { caption ->
    previewVideo = null
    onSendVideo(picked.toOutgoing(caption, videoPreparer))   // compression attached as a lambda, not run yet
}
```

### Phase C — optimistic row

`ChatRepositoryImpl.sendVideo:688` — poster bytes are pushed into `localImages`, the row is inserted
into SQLDelight with `MessageStatus.SENDING`, then `uploadAndDeliverVideo` runs inside `withSendJob`
(so `cancelSend` can kill exactly this send).

### Phase D — compress, then upload, strictly serially

`ChatRepositoryImpl.kt:774`

```kotlin
val prepareShare = if (video.needsPreparing && video.prepare != null) PREPARE_SHARE else 0f  // 0.5f
val upload = tracked(localId, video.fileName, video.sizeBytes) { onProgress ->
    val prepared = prepare { fraction -> onProgress(fraction * prepareShare) } ?: return@tracked null
    ready = prepared
    localVideos.update { it + (localId to prepared) }
    remote.uploadAttachmentFile(                                  // ← starts only after encode is 100% done
        conversationId, prepared.path, prepared.sizeBytes, prepared.fileName, ChatMediaKind.VIDEO,
        onProgress = { fraction -> onProgress(prepareShare + fraction * (1f - prepareShare)) },
    )
}
```

### Phase E — deliver

Cache file deleted, `q.setAttachment(...)`, then `deliver(...)` sends `message:send { mediaId }` over the
socket. The server may then hold the video in `PROCESSING` (poster visible, video not yet playable —
handled in `ChatMediaUi.kt:329`).

---

## 3. Compression analysis

**Library:** AndroidX **Media3 `Transformer` 1.5.1** (`gradle/libs.versions.toml:42`), using
`media3-transformer` + `media3-effect`. Not FFmpeg, not raw MediaCodec.

```kotlin
val bitrate = (TARGET_BYTES * BITS_PER_BYTE / seconds).coerceIn(MIN_BITRATE, MAX_BITRATE).toInt()
val height  = if (bitrate >= HD_BITRATE) MAX_HEIGHT else HD_HEIGHT

Transformer.Builder(context)
    .setVideoMimeType(MimeTypes.VIDEO_H264)
    .setAudioMimeType(MimeTypes.AUDIO_AAC)
    .setEncoderFactory(
        DefaultEncoderFactory.Builder(context)
            .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(bitrate).build())
            .setEnableFallback(true).build())
    …
val item = EditedMediaItem.Builder(MediaItem.fromUri(source))
    .setEffects(Effects(emptyList(), listOf(Presentation.createForHeight(height))))
    .build()
```

- **Resolution:** 1080p when the computed bitrate ≥ 2 Mbps, otherwise 720p
  (`MAX_HEIGHT = 1080`, `HD_HEIGHT = 720`).
- **Bitrate:** derived from a 20 MB size target — `20 MB × 8 / durationSeconds`, clamped to
  **600 kbps … 3.5 Mbps**. Anything ≤ 45 s therefore lands on the 3.5 Mbps ceiling at 1080p.
- **Codec:** H.264 video / AAC audio, forced.
- **Frame rate: never configured.** There is no frame-rate cap anywhere, so a 60 fps source is
  re-encoded at **60 fps**. This doubles the encode workload versus 30 fps for no visible benefit
  in a chat bubble.
- **Encoder:** hardware. `DefaultEncoderFactory` picks a `MediaCodec` encoder, preferring hardware;
  `setEnableFallback(true)` lets it substitute the nearest supported settings instead of failing.
  It only drops to a software encoder if no HW encoder supports the format at all.
- **GPU effect forcing a full decode → re-encode: YES.** `Presentation.createForHeight(height)` is
  applied **unconditionally** to every clip that passes the size gate. A non-empty `Effects` video
  list puts Transformer on the decode → OpenGL → encode path; transmux (remux-only, near-instant)
  becomes impossible. There is **no source-resolution check** — a clip that is already 1080p (or
  720p) is still fully decoded, scaled through GL to the same height, and re-encoded.

**Compression gate** (`VideoPicker.kt:106`): `videoNeedsPreparing(size) = size > 12 MB`.
Below 12 MB the file is sent untouched — that path is already fast.

---

## 4. Threading & UI

- **Compression thread:** `withContext(Dispatchers.Main)` inside `compressVideo`. This is *required*
  by `Transformer` (it binds to the calling `Looper`); the actual decode/encode runs on Transformer's
  internal threads. The **main thread is not doing the encoding** — only the `getProgress` poll every
  250 ms runs there. UI stays responsive during compression.
- **Staging copy:** on `Dispatchers.IO` — correct, but the user *is* blocked visually: the preview
  sheet does not open until the copy finishes.
- **Optimistic UI: yes.** `sendVideo` inserts the local row with the poster *before* any compression
  starts, so the bubble appears instantly with the frame-0 JPEG and a progress ring
  (`ChatMediaUi.kt:861-880`). The problem is not that the message appears late — it is that the ring
  sits there for minutes.
- **Upload container:** a plain coroutine in `ChatViewModel.viewModelScope` (`ChatViewModel.kt:707`).
  **No WorkManager, no foreground service** — there are zero references to either anywhere in the
  project. Consequence: navigating away from the chat clears the ViewModel and kills an in-flight
  encode/upload; process death loses it entirely.
- **Progress mapping:** `PREPARE_SHARE = 0.5f` is a fixed 50/50 split between compress and upload
  regardless of clip duration, so the ring's pacing is misleading (it usually stalls in the first half).

---

## 5. Upload analysis

- **Client:** Ktor **3.0.3** with the **OkHttp** engine on Android
  (`HttpClientFactory.android.kt:23`); Darwin on iOS.
- **Shape:** one **single sequential** `POST media/chat-upload`, `multipart/form-data`, body streamed
  from disk so memory stays flat:

```kotlin
private fun FormBuilder.filePart(path: String, sizeBytes: Long, fileName: String) =
    append(
        key = "file",
        value = InputProvider(sizeBytes) { SystemFileSystem.source(Path(path)).buffered() },
        headers = Headers.build {
            append(HttpHeaders.ContentType, mimeTypeOf(fileName))
            append(HttpHeaders.ContentDisposition, "filename=\"$fileName\"")
        },
    )
```

  **No chunking, no parallel parts, no range/resume.**
- **Timeouts:** overridden per upload — request timeout infinite, socket timeout 60 s
  (`uploadTimeouts()`). Sensible.
- **HTTP/2 & keep-alive:** not configured explicitly; you get OkHttp's defaults — ALPN-negotiated
  HTTP/2 over TLS and a shared connection pool with keep-alive. Neither helps a single large upload.
- **Retry / resume:** `HttpRequestRetry` is **not installed** in `createHttpClient`
  (`HttpClientFactory.kt:66-123`). The only automatic retry is Ktor `Auth`'s 401-refresh replay.
  App-level retry exists (`localVideos` keeps the file, `prepare = null` so it will not re-compress),
  but a failed upload **restarts from byte 0**.

---

## 6. Bottleneck diagnosis

**The slowest step is compression, by a wide margin, and it is slow for three compounding reasons.**

Worked example — a 30 s clip recorded at 4K/60 (~180 MB):

1. `bitrate = 20 MB × 8 / 30 s = 5.6 Mbps` → clamped to **3.5 Mbps** → `height = 1080`.
2. `Presentation.createForHeight(1080)` forces a **full decode of 4K60 → GL scale → H.264 encode at
   60 fps**: 1,800 frames through a 4K decoder and a 1080p encoder. On a mid-range device this runs
   at roughly real-time or worse — tens of seconds for 30 s of footage. The 3-minute ceiling
   (`MAX_VIDEO_MS`) means 10,800 frames, i.e. literally minutes.
3. **Only then** does the upload begin. Compression and upload are strictly serial
   (`ChatRepositoryImpl.kt:786-807`), zero overlap. Telegram overlaps them.

Secondary but real: before any of this the user already waited through a **full-file copy** in
`copyToCache` — and for camera capture that copy is entirely redundant, since the file is already in
the app's own `cacheDir`.

For comparison: Telegram's default send is roughly 848 px wide at ~1–1.5 Mbps / 30 fps. This code
produces 1080p at 3.5 Mbps at source fps — about **3× the file size and ~4× the encode cost**, then
uploads it serially afterwards.

### Top 3 changes

#### 1. Don't re-encode when you don't have to, and encode far less when you do

`readVideoMeta` already opens a `MediaMetadataRetriever` — read
`METADATA_KEY_VIDEO_WIDTH` / `METADATA_KEY_VIDEO_HEIGHT` / `METADATA_KEY_VIDEO_FRAME_RATE` there and
carry them on `PickedVideo`. Then in `compressVideo`:

- If the source height is already ≤ target and its bitrate is reasonable, pass an **empty effects
  list** so Transformer transmuxes (container remux only — seconds instead of minutes) instead of
  always applying `Presentation`.
- Cap the frame rate at 30 fps when the source is 60 fps. Halves the frames to encode outright.
- Lower the ceiling: target ~720p and `MAX_BITRATE ≈ 1.5–2 Mbps` instead of 1080p @ 3.5 Mbps. Cuts
  encode time and upload bytes at the same time, and is invisible in a chat bubble.

Expect this alone to take the 30 s / 4K case from minutes to a few seconds.

#### 2. Overlap upload with compression instead of running them serially

The clean version needs a chunked/resumable upload endpoint (`Content-Range`, or an
init/part/complete trio) so parts can go out as the muxer writes them, and so a dropped upload
resumes instead of restarting from 0 — which also fixes the missing retry story.

If the backend cannot change soon, the cheap partial win is removing the pre-send `copyToCache`:
feed the picker's `content://` URI straight into `Transformer` (it re-reads the source itself, and
the compressed output already lands in `cacheDir`), and for camera capture use `File.renameTo`
instead of a byte copy.

#### 3. Move the send off `viewModelScope` onto a foreground service or WorkManager

Today, leaving the chat screen cancels an in-flight video. Telegram feels instant partly because
sending is genuinely fire-and-forget — you navigate away immediately and it completes in the
background. Pair this with a real progress split (measure or estimate the encode/upload ratio rather
than the hardcoded `PREPARE_SHARE = 0.5f`) so the ring reflects actual work.

### Also worth doing while in there

- Install `HttpRequestRetry` on the upload path.
- Media3 1.5.1 has `Transformer.Builder.experimentalSetTrimOptimizationEnabled`; the newer 1.6.x /
  1.7.x line has meaningfully better transmux/passthrough heuristics if a version bump is possible.
