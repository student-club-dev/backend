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
 * Normalises an uploaded photo for chat.
 *
 * Two things here are not optional. **EXIF is dropped entirely** — a phone photo carries the GPS
 * coordinates of where it was taken, and forwarding that to whoever you are chatting with is a
 * location leak the sender never agreed to. And **orientation is baked into the pixels** first,
 * because the EXIF orientation flag goes with the rest of the metadata; without `rotate()` the
 * image would then display sideways.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  // `rotate()` with no argument applies the EXIF orientation. sharp drops metadata by default on
  // output, so nothing else is needed to strip it — but be explicit rather than rely on a default.
  const normalised = sharp(input).rotate();

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

/** Longest side of an image, for the pre-processing dimension check. */
export async function readDimensions(
  input: Buffer,
): Promise<{ width: number; height: number } | null> {
  const metadata = await sharp(input).metadata();
  if (metadata.width === undefined || metadata.height === undefined) {
    return null;
  }
  return { width: metadata.width, height: metadata.height };
}

/** A JPEG thumbnail from an arbitrary frame buffer (used for video/GIF posters). */
export async function thumbnailFrom(frame: Buffer): Promise<{ thumb: Buffer; blurHash: string }> {
  const image = sharp(frame).rotate();
  const thumb = await image
    .clone()
    .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();
  return { thumb, blurHash: await computeBlurHash(image.clone()) };
}
