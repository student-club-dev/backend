import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../../../../common/validation/validation-exception.factory';
import { MAX_ALBUM_SIZE } from '../../domain/message-composition';
import { SendMessageDto } from './requests.dto';

/**
 * `albumSize` is new, and the reason it had to be added is a validation fact rather than a feature
 * one: the global pipe runs with `forbidNonWhitelisted`, so until the field existed on the DTO the
 * client could not send it at all — every message of the album came back `422` and the send failed
 * outright (mobile 01-QOLGAN_ISHLAR §1).
 *
 * These run the real pipe with `main.ts`'s configuration against the real DTO.
 */
describe('SendMessageDto.albumSize through the global ValidationPipe', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: validationExceptionFactory,
  });

  const metadata = { type: 'body' as const, metatype: SendMessageDto };
  const run = (value: unknown): Promise<unknown> => pipe.transform(value, metadata);

  // `conversationId` is a route parameter, not a body field — sending one would be rejected by
  // `forbidNonWhitelisted` on its own and would mask what these tests are about.
  const album = (extra: object): object => ({
    type: 'IMAGE',
    mediaId: 'med_1',
    albumId: 'alb_1',
    ...extra,
  });

  it('accepts an album carrying its size — the case that used to 422', async () => {
    await expect(run(album({ albumSize: 10 }))).resolves.toMatchObject({ albumSize: 10 });
  });

  it('accepts an album without it, exactly as before', async () => {
    const result = (await run(album({}))) as SendMessageDto;
    expect(result.albumSize).toBeUndefined();
  });

  it('coerces the string form a query-style client sends', async () => {
    await expect(run(album({ albumSize: '3' }))).resolves.toMatchObject({ albumSize: 3 });
  });

  it(`accepts the ${MAX_ALBUM_SIZE}-image ceiling and refuses one more`, async () => {
    await expect(run(album({ albumSize: MAX_ALBUM_SIZE }))).resolves.toBeDefined();
    await expect(run(album({ albumSize: MAX_ALBUM_SIZE + 1 }))).rejects.toBeDefined();
  });

  // An "album" of one is not an album; the single-image wording is already correct for it.
  it('refuses a size below two', async () => {
    await expect(run(album({ albumSize: 1 }))).rejects.toBeDefined();
    await expect(run(album({ albumSize: 0 }))).rejects.toBeDefined();
    await expect(run(album({ albumSize: -3 }))).rejects.toBeDefined();
  });

  it('refuses a non-integer size', async () => {
    await expect(run(album({ albumSize: 2.5 }))).rejects.toBeDefined();
    await expect(run(album({ albumSize: 'ten' }))).rejects.toBeDefined();
  });

  /**
   * The mobile note said either behaviour was acceptable ("ignored, or 422 — makes no difference,
   * we never send it alone"). It is accepted and dropped: the value describes a grouping that does
   * not exist, and failing a send over a harmless stray field is the worse of the two outcomes.
   */
  it('accepts a size sent without an albumId, and the service drops it', async () => {
    await expect(run({ body: 'salom', albumSize: 5 })).resolves.toMatchObject({ albumSize: 5 });
  });
});
