import { ConfigService } from '@nestjs/config';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { MediaAsset } from '../../media/domain/entities/media-asset.entity';
import { MediaKind, MediaStatus } from '../../media/domain/enums/media-kind.enum';
import { MediaAssetRepository } from '../../media/domain/media-asset.repository';
import { MAX_PROFILE_PHOTOS, ProfilePhoto } from '../domain/entities/profile-photo.entity';
import { NewProfilePhoto, ProfilePhotoRepository } from '../domain/profile-photo.repository';
import { ProfilePhotoService } from './profile-photo.service';

const me: AuthenticatedUser = { id: 'me', type: AccountType.STUDENT };

function photo(overrides: Partial<ProfilePhoto> = {}): ProfilePhoto {
  return {
    id: 'pht_1',
    studentId: 'me',
    mediaId: 'med_1',
    url: '/v1/media/med_1/raw',
    thumbUrl: '/v1/media/med_1/raw?variant=thumb',
    width: 1080,
    height: 1080,
    sortOrder: 0,
    createdAt: new Date('2026-07-31T08:00:00Z'),
    ...overrides,
  };
}

function photoAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'med_1',
    ownerId: 'me',
    conversationId: null,
    kind: MediaKind.PROFILE_PHOTO,
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
    sizeBytes: 1000,
    width: 1080,
    height: 1080,
    durationMs: null,
    waveform: [],
    transcript: null,
    variants: null,
    fileName: null,
    blurHash: null,
    messageId: null,
    createdAt: new Date('2026-07-31T08:00:00Z'),
    ...overrides,
  };
}

function makePhotos(overrides: Partial<ProfilePhotoRepository> = {}): ProfilePhotoRepository {
  return {
    listFor: jest.fn().mockResolvedValue([]),
    listForMany: jest.fn().mockResolvedValue(new Map()),
    countFor: jest.fn().mockResolvedValue(0),
    addAsMain: jest.fn(async (input: NewProfilePhoto) => photo({ ...input, id: 'pht_new' })),
    makeMain: jest.fn().mockResolvedValue(photo()),
    remove: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeMedia(asset: MediaAsset | null = photoAsset()): MediaAssetRepository {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(asset),
    findByIds: jest.fn().mockResolvedValue(asset === null ? [] : [asset]),
    bytesUploadedSince: jest.fn().mockResolvedValue(0),
    markProcessed: jest.fn(),
    attachToMessage: jest.fn(),
    findOrphans: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn(),
    clearStorageKeys: jest.fn(),
  };
}

function makeService(
  photos: ProfilePhotoRepository = makePhotos(),
  media: MediaAssetRepository = makeMedia(),
): ProfilePhotoService {
  const config = { get: () => 'v1' } as unknown as ConfigService<never, true>;
  return new ProfilePhotoService(photos, media, config);
}

describe('ProfilePhotoService', () => {
  describe('add', () => {
    it('adds the photo at the front — which is what also moves avatarUrl', async () => {
      const photos = makePhotos();
      await makeService(photos).add(me, 'med_1');
      expect(photos.addAsMain).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 'me',
          mediaId: 'med_1',
          url: '/v1/media/med_1/raw',
          thumbUrl: '/v1/media/med_1/raw?variant=thumb',
        }),
      );
    });

    it('leaves thumbUrl null when the asset has no thumbnail', async () => {
      const photos = makePhotos();
      await makeService(photos, makeMedia(photoAsset({ thumbStorageKey: null }))).add(me, 'med_1');
      expect(photos.addAsMain).toHaveBeenCalledWith(expect.objectContaining({ thumbUrl: null }));
    });

    it(`refuses the ${MAX_PROFILE_PHOTOS + 1}th photo`, async () => {
      const photos = makePhotos({ countFor: jest.fn().mockResolvedValue(MAX_PROFILE_PHOTOS) });
      await expect(makeService(photos).add(me, 'med_1')).rejects.toMatchObject({
        code: ERROR_CODE.PHOTO_LIMIT_REACHED,
        status: 422,
      });
    });

    it('refuses an asset uploaded as something other than a profile photo', async () => {
      await expect(
        makeService(makePhotos(), makeMedia(photoAsset({ kind: MediaKind.IMAGE }))).add(
          me,
          'med_1',
        ),
      ).rejects.toMatchObject({ code: ERROR_CODE.MEDIA_NOT_FOUND, status: 422 });
    });

    it('refuses someone else’s upload', async () => {
      await expect(
        makeService(makePhotos(), makeMedia(photoAsset({ ownerId: 'other' }))).add(me, 'med_1'),
      ).rejects.toMatchObject({ code: ERROR_CODE.MEDIA_NOT_FOUND });
    });

    it('refuses an unknown mediaId with the same error — a guess must not be confirmed', async () => {
      await expect(
        makeService(makePhotos(), makeMedia(null)).add(me, 'med_1'),
      ).rejects.toMatchObject({ code: ERROR_CODE.MEDIA_NOT_FOUND });
    });

    it('refuses an asset that has not finished processing', async () => {
      await expect(
        makeService(makePhotos(), makeMedia(photoAsset({ status: MediaStatus.PROCESSING }))).add(
          me,
          'med_1',
        ),
      ).rejects.toMatchObject({ code: ERROR_CODE.MEDIA_NOT_READY });
    });
  });

  describe('makeMain', () => {
    it('404s for a photo that is not the caller’s', async () => {
      const photos = makePhotos({ makeMain: jest.fn().mockResolvedValue(null) });
      await expect(makeService(photos).makeMain(me, 'pht_9')).rejects.toMatchObject({
        code: ERROR_CODE.PHOTO_NOT_FOUND,
        status: 404,
      });
    });
  });

  describe('remove', () => {
    it('404s for a photo that is not the caller’s', async () => {
      const photos = makePhotos({ remove: jest.fn().mockResolvedValue(false) });
      await expect(makeService(photos).remove(me, 'pht_9')).rejects.toMatchObject({
        code: ERROR_CODE.PHOTO_NOT_FOUND,
        status: 404,
      });
    });
  });
});
