import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../../../../common/validation/validation-exception.factory';
import { CompleteUploadDto, InitUploadDto } from './upload-session.dto';

/**
 * `POST /v1/media/upload/{id}/complete` gained a body it never had.
 *
 * That is the one change here capable of breaking a client that is already working: the global pipe
 * runs with `forbidNonWhitelisted: true`, and an existing caller sends no body at all. These run the
 * real pipe, configured exactly as `main.ts` configures it, against the real DTO — the alternative
 * is finding out from a 400 in production.
 */
describe('CompleteUploadDto through the global ValidationPipe', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: validationExceptionFactory,
  });

  const metadata = { type: 'body' as const, metatype: CompleteUploadDto };
  const run = (value: unknown): Promise<unknown> => pipe.transform(value, metadata);

  it('accepts an absent body — what every pre-existing caller sends', async () => {
    // Express hands `{}` to the handler when a POST carries no body at all.
    await expect(run({})).resolves.toMatchObject({});
  });

  it('accepts an explicitly empty JSON body', async () => {
    const result = (await run({})) as CompleteUploadDto;
    expect(result.totalBytes).toBeUndefined();
  });

  it('accepts the real size and coerces the query-style string form', async () => {
    await expect(run({ totalBytes: 512 })).resolves.toMatchObject({ totalBytes: 512 });
    await expect(run({ totalBytes: '512' })).resolves.toMatchObject({ totalBytes: 512 });
  });

  it('rejects a size that is not a number', async () => {
    await expect(run({ totalBytes: 'lots' })).rejects.toBeDefined();
  });

  it('rejects a zero or negative size', async () => {
    await expect(run({ totalBytes: 0 })).rejects.toBeDefined();
    await expect(run({ totalBytes: -1 })).rejects.toBeDefined();
  });

  it('still refuses an unknown field, so the body is genuinely validated', async () => {
    await expect(run({ totalBytes: 512, sneaky: true })).rejects.toBeDefined();
  });
});

/**
 * `parts` is new, and `totalBytes` stopped being required — the two halves of the streaming upload
 * (spec §1–§2). Both change what the global pipe accepts, so both are exercised through the real
 * one rather than by reading the decorators.
 */
describe('the streaming upload fields through the global ValidationPipe', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: validationExceptionFactory,
  });

  const init = (value: unknown): Promise<unknown> =>
    pipe.transform(value, { type: 'body' as const, metatype: InitUploadDto });
  const complete = (value: unknown): Promise<unknown> =>
    pipe.transform(value, { type: 'body' as const, metatype: CompleteUploadDto });

  describe('InitUploadDto', () => {
    it('accepts a session opened with no totalBytes at all — the streaming case', async () => {
      const result = (await init({ kind: 'VIDEO', conversationId: 'cnv_1' })) as InitUploadDto;
      expect(result.totalBytes).toBeUndefined();
    });

    it('still accepts the declared size, unchanged', async () => {
      await expect(
        init({ kind: 'VIDEO', conversationId: 'cnv_1', totalBytes: 1024 }),
      ).resolves.toMatchObject({ totalBytes: 1024 });
    });

    // Absent means "I do not know yet"; zero or a negative number means the client is confused,
    // and silently treating that as "unknown" would hide the bug.
    it('rejects a totalBytes that is present but not a positive integer', async () => {
      await expect(
        init({ kind: 'VIDEO', conversationId: 'cnv_1', totalBytes: 0 }),
      ).rejects.toBeDefined();
      await expect(
        init({ kind: 'VIDEO', conversationId: 'cnv_1', totalBytes: -1 }),
      ).rejects.toBeDefined();
      await expect(
        init({ kind: 'VIDEO', conversationId: 'cnv_1', totalBytes: 'lots' }),
      ).rejects.toBeDefined();
    });
  });

  describe('CompleteUploadDto.parts', () => {
    it('accepts the size and part count together', async () => {
      await expect(complete({ totalBytes: 11534336, parts: 6 })).resolves.toMatchObject({
        totalBytes: 11534336,
        parts: 6,
      });
    });

    it('still accepts an empty body — the pre-existing caller', async () => {
      await expect(complete({})).resolves.toMatchObject({});
    });

    it('coerces the query-style string form', async () => {
      await expect(complete({ parts: '6' })).resolves.toMatchObject({ parts: 6 });
    });

    it('rejects a zero, negative or non-numeric part count', async () => {
      await expect(complete({ parts: 0 })).rejects.toBeDefined();
      await expect(complete({ parts: -2 })).rejects.toBeDefined();
      await expect(complete({ parts: 'six' })).rejects.toBeDefined();
    });
  });
});
