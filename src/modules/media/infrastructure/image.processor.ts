import { encode } from 'blurhash';
import sharp, { type Sharp } from 'sharp';
import { IMAGE_MAX_SIDE, THUMB_MAX_SIDE } from '../domain/media-limits';

/** A processed image: the display variant, its thumbnail, and the placeholder hash. */
export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  blurHash: string;
}

/**
 * A full-resolution image (parity spec §3).
 *
 * `full` is `null` in the case worth having this kind for: the upload carried no metadata to strip
 * and no orientation to apply, so the sender's own bytes are already what we want to store and the
 * caller moves the file into storage untouched. Re-encoding it would cost quality to change nothing.
 */
export interface OriginalImage {
  full: Buffer | null;
  thumb: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  blurHash: string;
}

/** What sharp calls a format, mapped to what we store and serve it as. */
const FORMATS: Record<string, { mimeType: string; extension: string }> = {
  jpeg: { mimeType: 'image/jpeg', extension: 'jpg' },
  png: { mimeType: 'image/png', extension: 'png' },
  webp: { mimeType: 'image/webp', extension: 'webp' },
  gif: { mimeType: 'image/gif', extension: 'gif' },
  heif: { mimeType: 'image/heic', extension: 'heic' },
};

/**
 * Normalises an uploaded photo for chat.
 *
 * Two things here are not optional. **EXIF is dropped entirely** — a phone photo carries the GPS
 * coordinates of where it was taken, and forwarding that to whoever you are chatting with is a
 * location leak the sender never agreed to. And **orientation is baked into the pixels** first,
 * because the EXIF orientation flag goes with the rest of the metadata; without `rotate()` the
 * image would then display sideways.
 */
export async function processImage(path: string): Promise<ProcessedImage> {
  // `rotate()` with no argument applies the EXIF orientation. sharp drops metadata by default on
  // output, so nothing else is needed to strip it — but be explicit rather than rely on a default.
  const normalised = sharp(path).rotate();

  const full = await normalised
    .clone()
    .resize({
      width: IMAGE_MAX_SIDE,
      height: IMAGE_MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const thumb = await normalised
    .clone()
    .resize({
      width: THUMB_MAX_SIDE,
      height: THUMB_MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 70 })
    .toBuffer();

  return {
    full: full.data,
    thumb,
    mimeType: 'image/webp',
    extension: 'webp',
    width: full.info.width,
    height: full.info.height,
    blurHash: await computeBlurHash(normalised.clone()),
  };
}

/**
 * Prepares an image to be sent at its own resolution (parity spec §3).
 *
 * The pixels are the sender's — no downscale, no WebP conversion. The only thing taken away is
 * metadata, and that is not negotiable: a photo straight off a camera roll carries the GPS
 * coordinates of where it was taken, and "original quality" must not quietly mean "original
 * location" as well.
 *
 * Which leaves a choice, because stripping EXIF from a JPEG means re-compressing it:
 *
 * - **nothing to strip** — no EXIF, no IPTC, no XMP, no orientation flag — and the file is kept
 *   exactly as uploaded. This is the screenshot case, and most images that have already been
 *   through another app, so it is also the common one.
 * - **something to strip**, and it is re-encoded at q95 in the same format, full size, with the
 *   orientation baked into the pixels. Slightly lossy, and the alternative is leaking where the
 *   sender was standing.
 *
 * HEIC is the exception to "same format": sharp can read it but not write it, so one that carries
 * metadata comes back as JPEG. One that does not is passed through as HEIC like anything else.
 */
export async function processOriginalImage(path: string): Promise<OriginalImage> {
  const metadata = await sharp(path).metadata();
  const rotated = sharp(path).rotate();

  const thumb = await rotated
    .clone()
    .resize({
      width: THUMB_MAX_SIDE,
      height: THUMB_MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 70 })
    .toBuffer();
  const blurHash = await computeBlurHash(rotated.clone());

  const source = FORMATS[metadata.format ?? ''] ?? FORMATS.jpeg;
  const carriesMetadata =
    metadata.exif !== undefined ||
    metadata.iptc !== undefined ||
    metadata.xmp !== undefined ||
    (metadata.orientation !== undefined && metadata.orientation > 1);

  if (!carriesMetadata) {
    return {
      full: null,
      thumb,
      mimeType: source.mimeType,
      extension: source.extension,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      blurHash,
    };
  }

  const encoded = await encodeAtFullSize(rotated.clone(), metadata.format);
  return {
    full: encoded.data,
    thumb,
    mimeType: encoded.mimeType,
    extension: encoded.extension,
    width: encoded.width,
    height: encoded.height,
    blurHash,
  };
}

/** Re-encodes at the source format and full resolution, as close to lossless as the format allows. */
async function encodeAtFullSize(
  image: Sharp,
  format: string | undefined,
): Promise<{ data: Buffer; mimeType: string; extension: string; width: number; height: number }> {
  const encoder =
    format === 'png'
      ? image.png()
      : format === 'webp'
        ? image.webp({ quality: 95 })
        : // JPEG covers the rest, including HEIC — sharp decodes that one but cannot write it.
          image.jpeg({ quality: 95, chromaSubsampling: '4:4:4' });

  const output = await encoder.toBuffer({ resolveWithObject: true });
  const target = FORMATS[output.info.format] ?? FORMATS.jpeg;
  return {
    data: output.data,
    mimeType: target.mimeType,
    extension: target.extension,
    width: output.info.width,
    height: output.info.height,
  };
}

/**
 * The 4×3-component hash the client paints while the real image loads. Computed from a 32px raw
 * sample — blurhash is O(pixels × components), so hashing the full image would be pure waste for an
 * output that is deliberately blurry.
 */
export async function computeBlurHash(image: Sharp): Promise<string> {
  const { data, info } = await image
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true });
  return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
}

/** Longest side of an image, for the decompression-bomb check before any decode happens. */
export async function readDimensions(
  path: string,
): Promise<{ width: number; height: number } | null> {
  const metadata = await sharp(path).metadata();
  if (metadata.width === undefined || metadata.height === undefined) {
    return null;
  }
  return { width: metadata.width, height: metadata.height };
}

/** A JPEG thumbnail from a poster frame on disk (used for video/GIF). */
export async function thumbnailFrom(
  framePath: string,
): Promise<{ thumb: Buffer; blurHash: string }> {
  const image = sharp(framePath).rotate();
  const thumb = await image
    .clone()
    .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();
  return { thumb, blurHash: await computeBlurHash(image.clone()) };
}
