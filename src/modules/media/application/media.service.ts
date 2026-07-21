import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { STORAGE, StoragePort } from '../../../infrastructure/storage/storage.port';
import { MediaUploadResult, UploadedImage } from './media.io';

/** Max image size accepted (5 MB). Enforced here AND as the FileInterceptor `limits.fileSize`. */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_PURPOSES = ['LOGO', 'COVER', 'LISTING'] as const;
type MediaPurpose = (typeof ALLOWED_PURPOSES)[number];

interface DetectedType {
  contentType: string;
  ext: string;
}

/**
 * Stateless image upload use-case. Validates purpose, the real image type (magic bytes — never the
 * client-declared mimetype) and size, then persists via the STORAGE port and returns the public URL.
 * No DB — the returned url is stored later by business/listing/profile. Depends on the port only.
 */
@Injectable()
export class MediaService {
  constructor(@Inject(STORAGE) private readonly storage: StoragePort) {}

  async upload(purpose: string, file?: UploadedImage): Promise<MediaUploadResult> {
    if (!this.isAllowedPurpose(purpose)) {
      throw AppException.validation({ purpose: 'Noto‘g‘ri maqsad: LOGO, COVER yoki LISTING' });
    }
    if (file === undefined) {
      throw AppException.validation({ file: 'Rasm faylini yuklang' });
    }
    const detected = this.detectImageType(file.buffer);
    if (detected === null) {
      throw AppException.validation({ file: 'Faqat JPEG, PNG yoki WebP rasm yuklash mumkin' });
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new AppException(
        ERROR_CODE.FILE_TOO_LARGE,
        413,
        'Fayl hajmi 5 MB dan oshmasligi kerak',
      );
    }

    // TODO(media-v2): generate thumb (200px) / card (800px) WebP variants with `sharp` and enforce
    // the min 600x600 dimension check. For v1 the product owner chose url-only, so both stay null.
    const { url } = await this.storage.save({
      purpose,
      buffer: file.buffer,
      contentType: detected.contentType,
      ext: detected.ext,
    });
    return { url, thumbUrl: null, cardUrl: null };
  }

  private isAllowedPurpose(purpose: string): purpose is MediaPurpose {
    return (ALLOWED_PURPOSES as readonly string[]).includes(purpose);
  }

  /**
   * Detects the real image type from the leading bytes — never trusts the client mimetype.
   * JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WEBP `RIFF....WEBP`. Null for anything else.
   */
  private detectImageType(buffer: Buffer): DetectedType | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { contentType: 'image/jpeg', ext: 'jpg' };
    }
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { contentType: 'image/png', ext: 'png' };
    }
    if (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return { contentType: 'image/webp', ext: 'webp' };
    }
    return null;
  }
}
