import { ERROR_CODE } from '../../../common/errors/error-code';
import { StoragePort } from '../../../infrastructure/storage/storage.port';
import { UploadedImage } from './media.io';
import { MAX_IMAGE_SIZE_BYTES, MediaService } from './media.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
]);

function file(buffer: Buffer, size = buffer.length): UploadedImage {
  return { buffer, size };
}

function makeStorage(overrides: Partial<StoragePort> = {}): StoragePort {
  return {
    save: jest.fn(async (input) => ({
      key: `${input.purpose}/generated.${input.ext}`,
      url: `http://localhost:3000/uploads/${input.purpose}/generated.${input.ext}`,
    })),
    delete: jest.fn().mockResolvedValue(undefined),
    publicUrl: jest.fn((key: string) => `http://localhost:3000/uploads/${key}`),
    ...overrides,
  };
}

describe('MediaService', () => {
  describe('upload — happy path', () => {
    it.each([
      ['jpeg', JPEG, 'jpg', 'image/jpeg'],
      ['png', PNG, 'png', 'image/png'],
      ['webp', WEBP, 'webp', 'image/webp'],
    ])(
      'accepts a %s, returns the url with null variants and saves it',
      async (_name, buffer, ext, contentType) => {
        const storage = makeStorage();
        const service = new MediaService(storage);

        const result = await service.upload('LISTING', file(buffer));

        expect(result).toEqual({
          url: `http://localhost:3000/uploads/LISTING/generated.${ext}`,
          thumbUrl: null,
          cardUrl: null,
        });
        expect(storage.save).toHaveBeenCalledWith(
          expect.objectContaining({ purpose: 'LISTING', ext, contentType }),
        );
      },
    );

    it.each(['LOGO', 'COVER', 'LISTING'])(
      'passes the %s purpose through to storage',
      async (purpose) => {
        const storage = makeStorage();
        const service = new MediaService(storage);

        await service.upload(purpose, file(JPEG));

        expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ purpose }));
      },
    );
  });

  describe('upload — validation', () => {
    it('rejects an unknown purpose with 422 VALIDATION_ERROR (fields.purpose)', async () => {
      const storage = makeStorage();
      const service = new MediaService(storage);

      await expect(service.upload('AVATAR', file(JPEG))).rejects.toMatchObject({
        code: ERROR_CODE.VALIDATION_ERROR,
        status: 422,
        fields: { purpose: expect.any(String) },
      });
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('rejects a missing file with 422 VALIDATION_ERROR (fields.file)', async () => {
      const storage = makeStorage();
      const service = new MediaService(storage);

      await expect(service.upload('LISTING', undefined)).rejects.toMatchObject({
        code: ERROR_CODE.VALIDATION_ERROR,
        status: 422,
        fields: { file: expect.any(String) },
      });
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('rejects a non-image (mismatched magic bytes) with 422 even if the buffer is large', async () => {
      const storage = makeStorage();
      const service = new MediaService(storage);
      const pdf = Buffer.from('%PDF-1.7 not an image', 'ascii');

      await expect(service.upload('LISTING', file(pdf))).rejects.toMatchObject({
        code: ERROR_CODE.VALIDATION_ERROR,
        status: 422,
        fields: { file: expect.any(String) },
      });
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('rejects an oversized image (> 5 MB) with 413 FILE_TOO_LARGE', async () => {
      const storage = makeStorage();
      const service = new MediaService(storage);
      const big = Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_SIZE_BYTES)]);

      await expect(service.upload('LISTING', file(big))).rejects.toMatchObject({
        code: ERROR_CODE.FILE_TOO_LARGE,
        status: 413,
      });
      expect(storage.save).not.toHaveBeenCalled();
    });
  });
});
