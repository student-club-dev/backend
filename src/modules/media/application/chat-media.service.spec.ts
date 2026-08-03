import { createHash } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { ChatAccessRepository } from '../domain/chat-access.repository';
import { MediaAsset, NewMediaAsset } from '../domain/entities/media-asset.entity';
import { MediaKind, MediaStatus } from '../domain/enums/media-kind.enum';
import { MediaAssetRepository } from '../domain/media-asset.repository';
import { ChatMediaStorage } from '../infrastructure/chat-media.storage';
import { MediaQueuePort, UploadedChatFile } from './chat-media.io';
import { ChatMediaService } from './chat-media.service';

const me: AuthenticatedUser = { id: 'std_me', type: AccountType.STUDENT };
const CONVERSATION = 'cnv_1';
const DAILY_QUOTA = 20 * 1024 * 1024 * 1024;
const DISK_FULL_RATIO = 0.85;

let dir: string;
let counter = 0;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'chat-media-spec-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function jpeg(width = 64, height = 64): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#3b82f6' } })
    .jpeg()
    .toBuffer();
}

/**
 * Writes the bytes to disk and describes them the way multer would.
 *
 * The service takes a path, not a buffer (parity spec §2) — so the fixtures are real files, which
 * also means the byte-identity assertion below is testing the real mechanism.
 */
async function upload(
  bytes: Buffer,
  overrides: Partial<UploadedChatFile> = {},
): Promise<UploadedChatFile> {
  counter += 1;
  const path = join(dir, `upload-${counter}`);
  await writeFile(path, bytes);
  return { path, size: bytes.length, mimetype: 'image/jpeg', ...overrides };
}

function makeAssets(overrides: Partial<MediaAssetRepository> = {}): MediaAssetRepository {
  return {
    create: jest.fn(async (asset: NewMediaAsset) => ({
      ...asset,
      id: 'med_1',
      messageId: null,
      createdAt: new Date('2026-07-29T00:00:00Z'),
    })),
    findById: jest.fn().mockResolvedValue(null),
    findByIds: jest.fn().mockResolvedValue([]),
    bytesUploadedSince: jest.fn().mockResolvedValue(0),
    markProcessed: jest.fn(),
    attachToMessage: jest.fn().mockResolvedValue(undefined),
    findOrphans: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue(undefined),
    clearStorageKeys: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeAccess(
  canSend = true,
  isMember = true,
  areConnected = true,
  isStoryLive = true,
): ChatAccessRepository {
  return {
    isMember: jest.fn().mockResolvedValue(isMember),
    canSend: jest.fn().mockResolvedValue(canSend),
    areConnected: jest.fn().mockResolvedValue(areConnected),
    isStoryLive: jest.fn().mockResolvedValue(isStoryLive),
  };
}

interface StorageMock {
  save: jest.Mock;
  saveFile: jest.Mock;
  delete: jest.Mock;
  usedRatio: jest.Mock;
  tempDir: string;
}

function makeService(
  assets: MediaAssetRepository = makeAssets(),
  access: ChatAccessRepository = makeAccess(),
  queue: MediaQueuePort = { enqueueTranscode: jest.fn().mockResolvedValue(undefined) },
): { service: ChatMediaService; storage: StorageMock } {
  const storage: StorageMock = {
    save: jest.fn(async (): Promise<string> => 'key/abc.webp'),
    saveFile: jest.fn(async (): Promise<string> => 'key/abc.bin'),
    delete: jest.fn(async (): Promise<void> => undefined),
    usedRatio: jest.fn(async (): Promise<number> => 0.1),
    tempDir: dir,
  };
  const config = {
    get: (key: string) =>
      key === 'CHAT_UPLOAD_BYTES_PER_DAY'
        ? DAILY_QUOTA
        : key === 'CHAT_MEDIA_DISK_FULL_RATIO'
          ? DISK_FULL_RATIO
          : key === 'FFMPEG_PATH'
            ? 'ffmpeg'
            : 'ffprobe',
  } as unknown as ConfigService<never, true>;
  const service = new ChatMediaService(
    assets,
    access,
    queue,
    storage as unknown as ChatMediaStorage,
    config,
  );
  return { service, storage };
}

describe('ChatMediaService — permission and quota', () => {
  it('refuses an upload into a conversation you cannot send to', async () => {
    const assets = makeAssets();
    const { service } = makeService(assets, makeAccess(false));

    await expect(
      service.upload(me, {
        kind: MediaKind.IMAGE,
        conversationId: CONVERSATION,
        file: await upload(await jpeg()),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODE.NOT_CONNECTED, status: 403 });

    expect(assets.create).not.toHaveBeenCalled();
  });

  it('checks permission before spending any CPU on the file', async () => {
    const { service, storage } = makeService(makeAssets(), makeAccess(false));

    await expect(
      service.upload(me, {
        kind: MediaKind.IMAGE,
        conversationId: CONVERSATION,
        file: await upload(await jpeg()),
      }),
    ).rejects.toThrow();

    expect(storage.save).not.toHaveBeenCalled();
  });

  it('rejects an upload that would break the daily byte quota', async () => {
    const assets = makeAssets({
      bytesUploadedSince: jest.fn().mockResolvedValue(DAILY_QUOTA - 10),
    });
    const { service } = makeService(assets);

    await expect(
      service.upload(me, {
        kind: MediaKind.IMAGE,
        conversationId: CONVERSATION,
        file: await upload(await jpeg()),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODE.UPLOAD_RATE_LIMIT, status: 429 });
  });

  // Parity spec §2.1: with the per-file ceilings gone, running out of disk is the failure mode that
  // matters, and it has to be reported rather than discovered.
  it('refuses uploads with 503 once the media volume is nearly full', async () => {
    const { service, storage } = makeService();
    storage.usedRatio = jest.fn(async () => 0.92);

    await expect(
      service.upload(me, {
        kind: MediaKind.IMAGE,
        conversationId: CONVERSATION,
        file: await upload(await jpeg()),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODE.STORAGE_FULL, status: 503 });
  });

  it('keeps accepting uploads when the volume cannot report its usage', async () => {
    const { service, storage } = makeService();
    storage.usedRatio = jest.fn().mockRejectedValue(new Error('ENOSYS'));

    await expect(
      service.upload(me, {
        kind: MediaKind.IMAGE,
        conversationId: CONVERSATION,
        file: await upload(await jpeg(40, 40)),
      }),
    ).resolves.toMatchObject({ kind: MediaKind.IMAGE });
  });

  it('requires a file', async () => {
    const { service } = makeService();
    await expect(
      service.upload(me, { kind: MediaKind.IMAGE, conversationId: CONVERSATION }),
    ).rejects.toMatchObject({ code: ERROR_CODE.VALIDATION_ERROR });
  });
});

// Parity spec §1. The whole section is one rule — a document is whatever the sender said it was, and
// it comes back unchanged — so these tests are about what no longer happens.
describe('ChatMediaService — kind = FILE takes anything', () => {
  it('accepts an ordinary JPEG sent as a document', async () => {
    const { service } = makeService();

    const asset = await service.upload(me, {
      kind: MediaKind.FILE,
      conversationId: CONVERSATION,
      file: await upload(await jpeg(), {
        mimetype: 'image/jpeg',
        originalname: 'Screenshot_20260727_102908_Telegram.jpg',
      }),
    });

    expect(asset.kind).toBe(MediaKind.FILE);
    expect(asset.fileName).toBe('Screenshot_20260727_102908_Telegram.jpg');
  });

  it('accepts an APK, which the old extension blocklist refused', async () => {
    const { service } = makeService();
    const apk = Buffer.concat([Buffer.from('PK'), Buffer.alloc(128)]);

    const asset = await service.upload(me, {
      kind: MediaKind.FILE,
      conversationId: CONVERSATION,
      file: await upload(apk, {
        mimetype: 'application/vnd.android.package-archive',
        originalname: 'app-release.apk',
      }),
    });

    expect(asset.fileName).toBe('app-release.apk');
  });

  it('accepts an ELF binary, which the magic-byte check refused', async () => {
    const { service } = makeService();
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(128)]);

    await expect(
      service.upload(me, {
        kind: MediaKind.FILE,
        conversationId: CONVERSATION,
        file: await upload(elf, { mimetype: 'application/octet-stream', originalname: 'tool' }),
      }),
    ).resolves.toMatchObject({ kind: MediaKind.FILE });
  });

  /**
   * The acceptance criterion parity spec §1.2 gave the backend team, run against the real mechanism:
   * the upload is *moved* into storage rather than read, so the stored bytes cannot differ.
   */
  it('stores the uploaded file byte for byte', async () => {
    const { service, storage } = makeService();
    const original = Buffer.concat([
      Buffer.from([0x00, 0xff, 0x7f, 0x80]),
      await jpeg(),
      Buffer.from('trailing-bytes'),
    ]);
    const file = await upload(original, {
      mimetype: 'application/octet-stream',
      originalname: 'original.bin',
    });
    const beforeHash = createHash('sha256').update(original).digest('hex');

    // The mock stands in for the real `rename` by copying the source it is handed, which is the only
    // thing the service tells it about the bytes.
    const stored = join(dir, 'stored.bin');
    storage.saveFile = jest.fn(async (source: string) => {
      await writeFile(stored, await readFile(source));
      return 'key/stored.bin';
    });

    await service.upload(me, {
      kind: MediaKind.FILE,
      conversationId: CONVERSATION,
      file,
    });

    const afterHash = createHash('sha256')
      .update(await readFile(stored))
      .digest('hex');
    expect(afterHash).toBe(beforeHash);
  });

  it('still sanitises a traversing filename — that was never a type check', async () => {
    const { service } = makeService();
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

    const asset = await service.upload(me, {
      kind: MediaKind.FILE,
      conversationId: CONVERSATION,
      file: await upload(pdf, {
        mimetype: 'application/pdf',
        originalname: '../../Diplom ishi.pdf',
      }),
    });

    expect(asset.fileName).toBe('Diplom ishi.pdf');
    expect(asset.mimeType).toBe('application/pdf');
  });
});

describe('ChatMediaService — images', () => {
  it('rejects bytes that are not what a type-checked kind allows', async () => {
    const { service } = makeService();
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(64)]);

    await expect(
      service.upload(me, {
        kind: MediaKind.IMAGE,
        conversationId: CONVERSATION,
        file: await upload(elf, { mimetype: 'image/jpeg' }),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODE.FILE_TYPE_NOT_ALLOWED });
  });

  it('rejects an image past the decompression-bomb ceiling', async () => {
    const { service } = makeService();
    const wide = await jpeg(20000, 10);

    await expect(
      service.upload(me, {
        kind: MediaKind.IMAGE,
        conversationId: CONVERSATION,
        file: await upload(wide),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODE.MEDIA_TOO_LARGE_DIMENSIONS, status: 422 });
  });

  it('accepts an image that would have failed the old 8192px ceiling', async () => {
    const { service } = makeService();

    await expect(
      service.upload(me, {
        kind: MediaKind.IMAGE,
        conversationId: CONVERSATION,
        file: await upload(await jpeg(9000, 10)),
      }),
    ).resolves.toMatchObject({ kind: MediaKind.IMAGE });
  });

  it('stores an image as WebP with a thumbnail and a blurHash', async () => {
    const { service, storage } = makeService();

    const asset = await service.upload(me, {
      kind: MediaKind.IMAGE,
      conversationId: CONVERSATION,
      file: await upload(await jpeg(200, 100)),
    });

    expect(storage.save).toHaveBeenCalledTimes(2); // full + thumb
    expect(asset).toMatchObject({
      kind: MediaKind.IMAGE,
      status: MediaStatus.READY,
      mimeType: 'image/webp',
      width: 200,
      height: 100,
    });
    expect(asset.blurHash).toEqual(expect.any(String));
    expect(asset.waveform).toEqual([]);
  });

  // Parity spec §3.
  describe('IMAGE_ORIGINAL', () => {
    it('keeps the sender bytes untouched when there is no metadata to strip', async () => {
      const { service, storage } = makeService();
      // sharp writes no EXIF, so this is the passthrough case — which is also the screenshot case.
      const file = await upload(await jpeg(300, 200));

      const asset = await service.upload(me, {
        kind: MediaKind.IMAGE_ORIGINAL,
        conversationId: CONVERSATION,
        file,
      });

      expect(storage.saveFile).toHaveBeenCalledWith(file.path, 'jpg');
      expect(asset).toMatchObject({
        kind: MediaKind.IMAGE_ORIGINAL,
        mimeType: 'image/jpeg',
        width: 300,
        height: 200,
        sizeBytes: file.size,
      });
    });

    it('keeps the full resolution instead of downscaling to 1920', async () => {
      const { service } = makeService();

      const asset = await service.upload(me, {
        kind: MediaKind.IMAGE_ORIGINAL,
        conversationId: CONVERSATION,
        file: await upload(await jpeg(4000, 3000)),
      });

      expect(asset.width).toBe(4000);
      expect(asset.height).toBe(3000);
    });

    it('still produces a thumbnail and a blurHash', async () => {
      const { service } = makeService();

      const asset = await service.upload(me, {
        kind: MediaKind.IMAGE_ORIGINAL,
        conversationId: CONVERSATION,
        file: await upload(await jpeg(300, 200)),
      });

      expect(asset.thumbStorageKey).not.toBeNull();
      expect(asset.blurHash).toEqual(expect.any(String));
    });

    it('re-encodes rather than passing through when the image carries EXIF', async () => {
      const { service, storage } = makeService();
      const withExif = await sharp({
        create: { width: 300, height: 200, channels: 3, background: '#3b82f6' },
      })
        .withExif({ IFD0: { Copyright: 'ElonUz' } })
        .jpeg()
        .toBuffer();

      const asset = await service.upload(me, {
        kind: MediaKind.IMAGE_ORIGINAL,
        conversationId: CONVERSATION,
        file: await upload(withExif),
      });

      // Stripping the metadata means writing new bytes, so the file is saved as a buffer rather
      // than moved. GPS coordinates are not worth keeping the original encode for.
      expect(storage.saveFile).not.toHaveBeenCalled();
      expect(asset.mimeType).toBe('image/jpeg');
      expect(asset.width).toBe(300);
    });
  });
});

describe('ChatMediaService — deleteOrphans', () => {
  const orphan = (id: string): MediaAsset => ({
    id,
    ownerId: 'std_me',
    conversationId: CONVERSATION,
    kind: MediaKind.IMAGE,
    status: MediaStatus.READY,
    quality: null,
    isAnimated: false,
    storageKey: `${id}.webp`,
    thumbStorageKey: `${id}-t.webp`,
    externalUrl: null,
    externalThumbUrl: null,
    provider: null,
    externalId: null,
    mimeType: 'image/webp',
    sizeBytes: 10,
    width: 1,
    height: 1,
    durationMs: null,
    waveform: [],
    transcript: null,
    variants: null,
    fileName: null,
    blurHash: null,
    messageId: null,
    createdAt: new Date('2026-07-20T00:00:00Z'),
  });

  it('deletes the bytes before the rows', async () => {
    const order: string[] = [];
    const assets = makeAssets({
      findOrphans: jest.fn().mockResolvedValue([orphan('a')]),
      deleteMany: jest.fn(async () => {
        order.push('rows');
      }),
    });
    const { service, storage } = makeService(assets);
    storage.delete = jest.fn(async () => {
      order.push('bytes');
    });

    expect(await service.deleteOrphans()).toBe(1);
    // Bytes with no row are a leak nothing can find again; a row with no bytes is harmless noise.
    expect(order[0]).toBe('bytes');
    expect(order[order.length - 1]).toBe('rows');
    expect(storage.delete).toHaveBeenCalledTimes(2); // full + thumb
  });

  it('does nothing when there is nothing to sweep', async () => {
    const assets = makeAssets({ findOrphans: jest.fn().mockResolvedValue([]) });
    const { service } = makeService(assets);
    expect(await service.deleteOrphans()).toBe(0);
    expect(assets.deleteMany).not.toHaveBeenCalled();
  });

  it('still removes the row when the bytes are already gone', async () => {
    const assets = makeAssets({ findOrphans: jest.fn().mockResolvedValue([orphan('a')]) });
    const { service, storage } = makeService(assets);
    storage.delete = jest.fn().mockRejectedValue(new Error('ENOENT'));

    expect(await service.deleteOrphans()).toBe(1);
    expect(assets.deleteMany).toHaveBeenCalledWith(['a']);
  });
});

describe('ChatMediaService — findForMember', () => {
  const stored: MediaAsset = {
    id: 'med_1',
    ownerId: 'std_other',
    conversationId: CONVERSATION,
    kind: MediaKind.IMAGE,
    status: MediaStatus.READY,
    quality: null,
    isAnimated: false,
    storageKey: 'k.webp',
    thumbStorageKey: 't.webp',
    externalUrl: null,
    externalThumbUrl: null,
    provider: null,
    externalId: null,
    mimeType: 'image/webp',
    sizeBytes: 100,
    width: 10,
    height: 10,
    durationMs: null,
    waveform: [],
    transcript: null,
    variants: null,
    fileName: null,
    blurHash: null,
    messageId: null,
    createdAt: new Date('2026-07-29T00:00:00Z'),
  };

  it('lets the recipient open what was sent to them, not just the uploader', async () => {
    const assets = makeAssets({ findById: jest.fn().mockResolvedValue(stored) });
    const { service } = makeService(assets, makeAccess(true, true));

    await expect(service.findForMember('med_1', me.id)).resolves.toBe(stored);
  });

  it('hides an attachment from someone outside the conversation', async () => {
    const assets = makeAssets({ findById: jest.fn().mockResolvedValue(stored) });
    const { service } = makeService(assets, makeAccess(true, false));

    await expect(service.findForMember('med_1', me.id)).rejects.toMatchObject({
      code: ERROR_CODE.MEDIA_NOT_FOUND,
      status: 404,
    });
  });

  it('answers 404 for an unknown id, the same as for a forbidden one', async () => {
    const { service } = makeService();
    await expect(service.findForMember('nope', me.id)).rejects.toMatchObject({
      code: ERROR_CODE.MEDIA_NOT_FOUND,
      status: 404,
    });
  });

  describe('story media', () => {
    const storyAsset: MediaAsset = {
      ...stored,
      conversationId: null,
      kind: MediaKind.STORY_IMAGE,
    };

    it('lets a connection open a live story', async () => {
      const assets = makeAssets({ findById: jest.fn().mockResolvedValue(storyAsset) });
      const { service } = makeService(assets, makeAccess(true, false, true, true));

      await expect(service.findForMember('med_1', me.id)).resolves.toBe(storyAsset);
    });

    it('shuts a connection out once the story is archived', async () => {
      // The whole point of the archive: past `expiresAt` the audience is the author alone, and a
      // direct link to the bytes must not be the way around that.
      const assets = makeAssets({ findById: jest.fn().mockResolvedValue(storyAsset) });
      const { service } = makeService(assets, makeAccess(true, false, true, false));

      await expect(service.findForMember('med_1', me.id)).rejects.toMatchObject({
        code: ERROR_CODE.MEDIA_NOT_FOUND,
        status: 404,
      });
    });

    it('still lets the author open their own archived story', async () => {
      const mine = { ...storyAsset, ownerId: me.id };
      const assets = makeAssets({ findById: jest.fn().mockResolvedValue(mine) });
      const { service } = makeService(assets, makeAccess(true, false, true, false));

      await expect(service.findForMember('med_1', me.id)).resolves.toBe(mine);
    });
  });
});
