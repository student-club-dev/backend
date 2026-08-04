import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../../../../common/validation/validation-exception.factory';
import { CompleteUploadDto } from './upload-session.dto';

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
