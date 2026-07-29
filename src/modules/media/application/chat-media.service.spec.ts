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
const DAILY_QUOTA = 500 * 1024 * 1024;

async function jpeg(width = 64, height = 64): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#3b82f6' } })
    .jpeg()
    .toBuffer();
}

function upload(buffer: Buffer, overrides: Partial<UploadedChatFile> = {}): UploadedChatFile {
  return { buffer, size: buffer.length, mimetype: 'image/jpeg', ...overrides };
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
    bytesUploadedSince: jest.fn().mockResolvedValue(0),
    markProcessed: jest.fn(),
    attachToMessage: jest.fn().mockResolvedValue(undefined),
    findOrphans: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeAccess(canSend = true, isMember = true): ChatAccessRepository {
  return {
    isMember: jest.fn().mockResolvedValue(isMember),
    canSend: jest.fn().mockResolvedValue(canSend),
  };
}

function makeService(
  assets: MediaAssetRepository = makeAssets(),
  access: ChatAccessRepository = makeAccess(),
  queue: MediaQueuePort = { enqueueTranscode: jest.fn().mockResolvedValue(undefined) },
): { service: ChatMediaService; storage: { save: jest.Mock; delete: jest.Mock } } {
  const storage = {
    save: jest.fn(async (): Promise<string> => 'key/abc.webp'),
    delete: jest.fn(async (): Promise<void> => undefined),
  };
  const config = {
    get: (key: string) =>
      key === 'CHAT_UPLOAD_BYTES_PER_DAY'
        ? DAILY_QUOTA
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

describe('ChatMediaService — upload', () => {
  it('refuses an upload into a conversation you cannot send to', async () => {
    const assets = makeAssets();
    const { service } = makeService(assets, makeAccess(false));

    await expect(
      service.upload(me, {
        kind: MediaKind.IMAGE,
        conversationId: CONVERSATION,
        file: upload(await jpeg()),
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
        file: upload(await jpeg()),
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
        file: upload(await jpeg()),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODE.UPLOAD_RATE_LIMIT, status: 429 });
  });

  it('rejects a file larger than the limit for its kind', async () => {
    const { service } = makeService();
    const huge = upload(await jpeg(), { size: 20 * 1024 * 1024 });

    await expect(
      service.upload(me, { kind: MediaKind.IMAGE, conversationId: CONVERSATION, file: huge }),
    ).rejects.toMatchObject({ code: ERROR_CODE.FILE_TOO_LARGE, status: 413 });
  });

  it('rejects a blocked extension even when the bytes are a legitimate document', async () => {
    const { service } = makeService();
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

    await expect(
      service.upload(me, {
        kind: MediaKind.FILE,
        conversationId: CONVERSATION,
        file: upload(pdf, { mimetype: 'application/pdf', originalname: 'malware.apk' }),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODE.FILE_TYPE_NOT_ALLOWED, status: 422 });
  });

  it('rejects bytes that are not what the kind allows', async () => {
    const { service } = makeService();
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(64)]);

    await expect(
      service.upload(me, {
        kind: MediaKind.IMAGE,
        conversationId: CONVERSATION,
        file: upload(elf, { mimetype: 'image/jpeg' }),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODE.FILE_TYPE_NOT_ALLOWED });
  });

  it('rejects an image whose longest side is over the pixel ceiling', async () => {
    const { service } = makeService();
    const wide = await jpeg(9000, 10);

    await expect(
      service.upload(me, {
        kind: MediaKind.IMAGE,
        conversationId: CONVERSATION,
        file: upload(wide),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODE.MEDIA_TOO_LARGE_DIMENSIONS, status: 422 });
  });

  it('stores an image as WebP with a thumbnail and a blurHash', async () => {
    const assets = makeAssets();
    const { service, storage } = makeService(assets);

    const asset = await service.upload(me, {
      kind: MediaKind.IMAGE,
      conversationId: CONVERSATION,
      file: upload(await jpeg(200, 100)),
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

  it('keeps the sanitised original name for a document', async () => {
    const { service } = makeService();
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

    const asset = await service.upload(me, {
      kind: MediaKind.FILE,
      conversationId: CONVERSATION,
      file: upload(pdf, { mimetype: 'application/pdf', originalname: '../../Diplom ishi.pdf' }),
    });

    expect(asset.fileName).toBe('Diplom ishi.pdf');
    expect(asset.mimeType).toBe('application/pdf');
  });

  it('requires a file', async () => {
    const { service } = makeService();
    await expect(
      service.upload(me, { kind: MediaKind.IMAGE, conversationId: CONVERSATION }),
    ).rejects.toMatchObject({ code: ERROR_CODE.VALIDATION_ERROR });
  });
});

describe('ChatMediaService — deleteOrphans', () => {
  const orphan = (id: string): MediaAsset => ({
    id,
    ownerId: 'std_me',
    conversationId: CONVERSATION,
    kind: MediaKind.IMAGE,
    status: MediaStatus.READY,
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
});
