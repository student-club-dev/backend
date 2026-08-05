import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../../../../common/validation/validation-exception.factory';
import { MARK_READ_MAX_IDS, MarkNotificationsReadDto } from './mark-read.dto';

/**
 * `POST /v1/notifications/read` takes two mutually exclusive shapes, and "exactly one of them" is
 * not something a plain `@IsOptional()` can express — the case that must fail hardest, an empty
 * body, is precisely the one `@IsOptional()` skips.
 *
 * Run through the real pipe with `main.ts`'s configuration, because `forbidNonWhitelisted` and
 * `transform` both change what reaches the constraint.
 */
describe('MarkNotificationsReadDto through the global ValidationPipe', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: validationExceptionFactory,
  });

  const metadata = { type: 'body' as const, metatype: MarkNotificationsReadDto };
  const run = (value: unknown): Promise<unknown> => pipe.transform(value, metadata);

  it('accepts a list of ids', async () => {
    await expect(run({ ids: ['ntf_1', 'ntf_2'] })).resolves.toMatchObject({
      ids: ['ntf_1', 'ntf_2'],
    });
  });

  it('accepts { all: true }', async () => {
    await expect(run({ all: true })).resolves.toMatchObject({ all: true });
  });

  it('accepts an empty id list — a no-op, not an error', async () => {
    await expect(run({ ids: [] })).resolves.toMatchObject({ ids: [] });
  });

  it('rejects an empty body: neither mode was chosen (§3.1)', async () => {
    await expect(run({})).rejects.toBeDefined();
  });

  it('rejects both modes at once (§3.1)', async () => {
    await expect(run({ ids: ['ntf_1'], all: true })).rejects.toBeDefined();
  });

  it('rejects { all: false } — it selects nothing and is almost certainly a client bug', async () => {
    await expect(run({ all: false })).rejects.toBeDefined();
  });

  it(`accepts exactly ${MARK_READ_MAX_IDS} ids and rejects one more (§3.5)`, async () => {
    const ids = Array.from({ length: MARK_READ_MAX_IDS }, (_, i) => `ntf_${i}`);
    await expect(run({ ids })).resolves.toBeDefined();
    await expect(run({ ids: [...ids, 'ntf_extra'] })).rejects.toBeDefined();
  });

  it('rejects ids that are not strings', async () => {
    await expect(run({ ids: [1, 2] })).rejects.toBeDefined();
  });

  it('refuses an unknown field, so the body is genuinely validated', async () => {
    await expect(run({ all: true, sneaky: 1 })).rejects.toBeDefined();
  });
});
