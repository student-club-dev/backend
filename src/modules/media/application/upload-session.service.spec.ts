import { Readable } from 'stream';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { NewUploadSession, UploadSession } from '../domain/entities/upload-session.entity';
import { MediaKind } from '../domain/enums/media-kind.enum';
import { UploadSessionRepository } from '../domain/upload-session.repository';
import { ChatMediaStorage } from '../infrastructure/chat-media.storage';
import { UploadPartStorage } from '../infrastructure/upload-part.storage';
import { ChatMediaService } from './chat-media.service';
import {
  MAX_OPEN_UPLOADS,
  UPLOAD_CHUNK_SIZE,
  UploadSessionService,
} from './upload-session.service';

const me: AuthenticatedUser = { id: 'std_me', type: AccountType.STUDENT };
const other: AuthenticatedUser = { id: 'std_other', type: AccountType.STUDENT };
const CONVERSATION = 'cnv_1';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'upload-session-spec-'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

// Part state lives on disk by design, so it outlives a test unless it is cleared. Every case below
// reuses the same session id for readability, which without this would let one test's parts count
// towards the next one's.
beforeEach(async () => {
  await rm(join(root, 'incoming'), { recursive: true, force: true });
});

/** Real part storage against a real directory — the concurrency claims are about the filesystem. */
function makeParts(): UploadPartStorage {
  const config = {
    get: () => root,
  } as unknown as ConfigService<never, true>;
  return new UploadPartStorage(config);
}

function makeSessions(seed: UploadSession | null = null): UploadSessionRepository {
  const rows = new Map<string, UploadSession>();
  if (seed !== null) {
    rows.set(seed.id, seed);
  }
  let next = 0;
  return {
    create: jest.fn(async (session: NewUploadSession) => {
      next += 1;
      const created: UploadSession = { ...session, id: `upl_${next}`, createdAt: new Date() };
      rows.set(created.id, created);
      return created;
    }),
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    countOpen: jest.fn(
      async (ownerId: string, now: Date) =>
        [...rows.values()].filter(
          (row) => row.ownerId === ownerId && row.expiresAt.getTime() >= now.getTime(),
        ).length,
    ),
    delete: jest.fn(async (id: string) => {
      rows.delete(id);
    }),
    findExpired: jest.fn(async () =>
      [...rows.values()].filter((row) => row.expiresAt.getTime() < Date.now()),
    ),
  };
}

function makeMedia(overrides: Partial<ChatMediaService> = {}): ChatMediaService {
  return {
    assertMayUpload: jest.fn().mockResolvedValue(undefined),
    assertStorageAvailable: jest.fn().mockResolvedValue(undefined),
    assertWithinQuota: jest.fn().mockResolvedValue(undefined),
    upload: jest.fn().mockResolvedValue({ id: 'med_1', kind: MediaKind.FILE }),
    ...overrides,
  } as unknown as ChatMediaService;
}

function makeService(
  sessions: UploadSessionRepository = makeSessions(),
  media: ChatMediaService = makeMedia(),
): { service: UploadSessionService; parts: UploadPartStorage; sessions: UploadSessionRepository } {
  const parts = makeParts();
  const storage = {
    tempDir: root,
    sweepStaleTemp: jest.fn(async () => 0),
  } as unknown as ChatMediaStorage;
  const config = {
    get: () => 24,
  } as unknown as ConfigService<never, true>;
  return {
    service: new UploadSessionService(sessions, parts, storage, media, config),
    parts,
    sessions,
  };
}

function session(overrides: Partial<UploadSession> = {}): UploadSession {
  return {
    id: 'upl_seed',
    ownerId: me.id,
    conversationId: CONVERSATION,
    kind: MediaKind.FILE,
    quality: null,
    fileName: 'video.mp4',
    totalBytes: 10,
    chunkSize: 4,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ...overrides,
  };
}

function bytes(content: string): Readable {
  return Readable.from([Buffer.from(content)]);
}

describe('UploadSessionService — init', () => {
  it('runs every cheap rejection up front rather than after the bytes arrive', async () => {
    const media = makeMedia();
    const { service } = makeService(makeSessions(), media);

    await service.init(me, {
      kind: MediaKind.VIDEO,
      conversationId: CONVERSATION,
      totalBytes: 100 * 1024 * 1024,
    });

    expect(media.assertMayUpload).toHaveBeenCalled();
    expect(media.assertStorageAvailable).toHaveBeenCalled();
    // Reserved against the promised size — there is no point taking 100 MB from someone with no
    // quota left for it.
    expect(media.assertWithinQuota).toHaveBeenCalledWith(me.id, 100 * 1024 * 1024);
  });

  it('refuses a session with no usable size', async () => {
    const { service } = makeService();
    for (const totalBytes of [0, -1, 1.5]) {
      await expect(
        service.init(me, { kind: MediaKind.FILE, conversationId: CONVERSATION, totalBytes }),
      ).rejects.toMatchObject({ code: ERROR_CODE.VALIDATION_ERROR });
    }
  });

  /**
   * Quota is charged at `complete`, so opening sessions is the one way to put bytes on disk without
   * being billed. Each session is capped at its declared size; this is what caps how many there are.
   */
  it('refuses to open more than the concurrent-upload cap', async () => {
    const sessions = makeSessions();
    const { service } = makeService(sessions);
    for (let i = 0; i < MAX_OPEN_UPLOADS; i += 1) {
      await service.init(me, {
        kind: MediaKind.FILE,
        conversationId: CONVERSATION,
        totalBytes: 10,
      });
    }

    await expect(
      service.init(me, { kind: MediaKind.FILE, conversationId: CONVERSATION, totalBytes: 10 }),
    ).rejects.toMatchObject({ code: ERROR_CODE.UPLOAD_RATE_LIMIT, status: 429 });
  });

  it('does not count another student’s open uploads against you', async () => {
    const sessions = makeSessions();
    const { service } = makeService(sessions);
    for (let i = 0; i < MAX_OPEN_UPLOADS; i += 1) {
      await service.init(other, {
        kind: MediaKind.FILE,
        conversationId: CONVERSATION,
        totalBytes: 10,
      });
    }

    await expect(
      service.init(me, { kind: MediaKind.FILE, conversationId: CONVERSATION, totalBytes: 10 }),
    ).resolves.toMatchObject({ received: [] });
  });

  it('hands back the part size and an expiry at least a day out', async () => {
    const { service } = makeService();

    const progress = await service.init(me, {
      kind: MediaKind.FILE,
      conversationId: CONVERSATION,
      totalBytes: 1024,
    });

    expect(progress.chunkSize).toBe(UPLOAD_CHUNK_SIZE);
    expect(progress.received).toEqual([]);
    // Parity spec §7: long enough that a send interrupted on the metro survives the journey.
    expect(progress.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
  });
});

describe('UploadSessionService — parts', () => {
  it('accepts parts out of order and reports them sorted', async () => {
    const { service } = makeService(makeSessions(session()));

    await service.writePart(me, 'upl_seed', 2, bytes('ab'));
    await service.writePart(me, 'upl_seed', 0, bytes('abcd'));
    const progress = await service.writePart(me, 'upl_seed', 1, bytes('abcd'));

    expect(progress.received).toEqual([0, 1, 2]);
  });

  it('accepts parts sent in parallel', async () => {
    const { service } = makeService(makeSessions(session({ totalBytes: 12, chunkSize: 4 })));

    await Promise.all([
      service.writePart(me, 'upl_seed', 0, bytes('aaaa')),
      service.writePart(me, 'upl_seed', 1, bytes('bbbb')),
      service.writePart(me, 'upl_seed', 2, bytes('cccc')),
    ]);

    expect((await service.status(me, 'upl_seed')).received).toEqual([0, 1, 2]);
  });

  // Idempotence is the property that makes a blind retry safe after a dropped connection.
  it('treats a re-sent part as a replacement, not an error', async () => {
    const { service, parts } = makeService(makeSessions(session()));

    await service.writePart(me, 'upl_seed', 0, bytes('xxxx'));
    await service.writePart(me, 'upl_seed', 0, bytes('yyyy'));

    expect((await service.status(me, 'upl_seed')).received).toEqual([0]);
    expect(await parts.receivedBytes('upl_seed')).toBe(4);
  });

  it('refuses an index outside the range the size implies', async () => {
    const { service } = makeService(makeSessions(session({ totalBytes: 10, chunkSize: 4 })));

    // 10 bytes in 4-byte parts is three parts: 0, 1, 2.
    await expect(service.writePart(me, 'upl_seed', 3, bytes('a'))).rejects.toMatchObject({
      code: ERROR_CODE.VALIDATION_ERROR,
    });
    await expect(service.writePart(me, 'upl_seed', -1, bytes('a'))).rejects.toMatchObject({
      code: ERROR_CODE.VALIDATION_ERROR,
    });
  });

  /**
   * Without this the declared `totalBytes` means nothing: a session promising a kilobyte could put
   * a gigabyte on disk and only be caught at `complete`, long after the disk had paid for it.
   */
  it('cuts off a part that runs past the agreed chunk size', async () => {
    const { service, parts } = makeService(makeSessions(session({ totalBytes: 8, chunkSize: 4 })));

    await expect(
      service.writePart(me, 'upl_seed', 0, bytes('aaaaaaaaaaaaaaaa')),
    ).rejects.toMatchObject({ code: ERROR_CODE.FILE_TOO_LARGE, status: 413 });

    // And it leaves nothing behind — the oversized bytes are not simply truncated onto disk.
    expect(await parts.receivedParts('upl_seed')).toEqual([]);
  });

  it('allows a final part shorter than the chunk size', async () => {
    const { service } = makeService(makeSessions(session({ totalBytes: 10, chunkSize: 4 })));

    await service.writePart(me, 'upl_seed', 2, bytes('ab'));

    expect((await service.status(me, 'upl_seed')).received).toEqual([2]);
  });

  it('re-checks disk space on every part, not only at init', async () => {
    const media = makeMedia();
    const { service } = makeService(makeSessions(session()), media);

    await service.writePart(me, 'upl_seed', 0, bytes('abcd'));

    // A session lives for a day; the volume can fill while it is open.
    expect(media.assertStorageAvailable).toHaveBeenCalled();
  });
});

describe('UploadSessionService — ownership and expiry', () => {
  it('hides someone else’s session behind the same 404 as an unknown one', async () => {
    const { service } = makeService(makeSessions(session()));

    await expect(service.status(other, 'upl_seed')).rejects.toMatchObject({
      code: ERROR_CODE.UPLOAD_SESSION_NOT_FOUND,
      status: 404,
    });
    await expect(service.status(me, 'upl_nope')).rejects.toMatchObject({
      code: ERROR_CODE.UPLOAD_SESSION_NOT_FOUND,
      status: 404,
    });
  });

  it('treats an expired session as gone', async () => {
    const expired = session({ expiresAt: new Date(Date.now() - 1000) });
    const { service } = makeService(makeSessions(expired));

    await expect(service.status(me, 'upl_seed')).rejects.toMatchObject({
      code: ERROR_CODE.UPLOAD_SESSION_NOT_FOUND,
    });
  });
});

describe('UploadSessionService — complete', () => {
  it('refuses to finish while parts are missing', async () => {
    const { service } = makeService(makeSessions(session({ totalBytes: 12, chunkSize: 4 })));
    await service.writePart(me, 'upl_seed', 0, bytes('aaaa'));

    await expect(service.complete(me, 'upl_seed')).rejects.toMatchObject({
      code: ERROR_CODE.UPLOAD_INCOMPLETE,
      status: 422,
    });
  });

  it('refuses when the assembled size is not the size that was promised', async () => {
    const { service } = makeService(makeSessions(session({ totalBytes: 12, chunkSize: 4 })));
    await service.writePart(me, 'upl_seed', 0, bytes('aaaa'));
    await service.writePart(me, 'upl_seed', 1, bytes('bbbb'));
    await service.writePart(me, 'upl_seed', 2, bytes('cc')); // two bytes short

    await expect(service.complete(me, 'upl_seed')).rejects.toMatchObject({
      code: ERROR_CODE.UPLOAD_SIZE_MISMATCH,
      status: 422,
    });
  });

  /**
   * The reason `complete` delegates instead of storing the file itself: a chunked upload has to pass
   * exactly the checks a one-shot upload passes, and two separate code paths would drift.
   */
  it('feeds the assembled file through the ordinary upload pipeline', async () => {
    const media = makeMedia();
    const { service } = makeService(makeSessions(session({ totalBytes: 12, chunkSize: 4 })), media);
    await service.writePart(me, 'upl_seed', 0, bytes('aaaa'));
    await service.writePart(me, 'upl_seed', 1, bytes('bbbb'));
    await service.writePart(me, 'upl_seed', 2, bytes('cccc'));

    await service.complete(me, 'upl_seed');

    expect(media.upload).toHaveBeenCalledWith(
      me,
      expect.objectContaining({
        kind: MediaKind.FILE,
        conversationId: CONVERSATION,
        file: expect.objectContaining({ size: 12, originalname: 'video.mp4' }),
      }),
    );
  });

  it('assembles the parts in index order, whatever order they arrived in', async () => {
    // Read inside the mock: `complete` removes the scratch directory in a `finally`, so the
    // assembled file only exists while the pipeline is being called.
    let assembled = '';
    const media = makeMedia({
      upload: jest.fn(async (_user: AuthenticatedUser, input: { file: { path: string } }) => {
        assembled = (await readFile(input.file.path)).toString();
        return { id: 'med_1', kind: MediaKind.FILE };
      }) as unknown as ChatMediaService['upload'],
    });
    const { service } = makeService(makeSessions(session({ totalBytes: 12, chunkSize: 4 })), media);

    await service.writePart(me, 'upl_seed', 2, bytes('cccc'));
    await service.writePart(me, 'upl_seed', 0, bytes('aaaa'));
    await service.writePart(me, 'upl_seed', 1, bytes('bbbb'));
    await service.complete(me, 'upl_seed');

    expect(assembled).toBe('aaaabbbbcccc');
  });

  it('clears the session and its parts once the asset exists', async () => {
    const { service, parts, sessions } = makeService(
      makeSessions(session({ totalBytes: 8, chunkSize: 4 })),
    );
    await service.writePart(me, 'upl_seed', 0, bytes('aaaa'));
    await service.writePart(me, 'upl_seed', 1, bytes('bbbb'));

    await service.complete(me, 'upl_seed');

    expect(await parts.receivedParts('upl_seed')).toEqual([]);
    expect(sessions.delete).toHaveBeenCalledWith('upl_seed');
  });

  it('keeps the session resumable when the pipeline rejects the finished file', async () => {
    const media = makeMedia({ upload: jest.fn().mockRejectedValue(new Error('bad video')) });
    const { service, parts, sessions } = makeService(
      makeSessions(session({ totalBytes: 8, chunkSize: 4 })),
      media,
    );
    await service.writePart(me, 'upl_seed', 0, bytes('aaaa'));
    await service.writePart(me, 'upl_seed', 1, bytes('bbbb'));

    await expect(service.complete(me, 'upl_seed')).rejects.toThrow('bad video');

    // The parts are the only copy of the upload until the asset exists — throwing them away on a
    // failure would make the user send the whole file again.
    expect(await parts.receivedParts('upl_seed')).toEqual([0, 1]);
    expect(sessions.delete).not.toHaveBeenCalled();
  });
});

describe('UploadSessionService — cleanup', () => {
  it('drops the parts before the row', async () => {
    const { service, parts } = makeService(makeSessions(session()));
    await service.writePart(me, 'upl_seed', 0, bytes('aaaa'));

    await service.cancel(me, 'upl_seed');

    expect(await parts.receivedParts('upl_seed')).toEqual([]);
  });

  it('sweeps sessions that have expired', async () => {
    const expired = session({ id: 'upl_old', expiresAt: new Date(Date.now() - 1000) });
    const { service, sessions } = makeService(makeSessions(expired));

    expect(await service.sweepExpired()).toBe(1);
    expect(sessions.delete).toHaveBeenCalledWith('upl_old');
  });

  it('does nothing when there is nothing expired', async () => {
    const { service } = makeService(makeSessions(session()));
    expect(await service.sweepExpired()).toBe(0);
  });
});
