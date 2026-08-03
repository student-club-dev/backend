import { ConfigService } from '@nestjs/config';
import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { PresenceRepository } from '../../../infrastructure/presence/presence.repository';
import { StudentSummary } from '../../connections/domain/entities/student-summary.entity';
import { StudentDirectoryRepository } from '../../connections/domain/student-directory.repository';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import { PhoneVisibility } from '../../profiles/domain/enums/phone-visibility.enum';
import { ChatMediaService } from '../../media/application/chat-media.service';
import { MediaAsset } from '../../media/domain/entities/media-asset.entity';
import { MediaKind, MediaStatus } from '../../media/domain/enums/media-kind.enum';
import { MediaAssetRepository } from '../../media/domain/media-asset.repository';
import { MAX_ACTIVE_STORIES, MAX_STORIES_PER_DAY, Story } from '../domain/entities/story.entity';
import { StoryKind } from '../domain/enums/story-kind.enum';
import { StoryAudienceRepository } from '../domain/story-audience.repository';
import { NewStory, StoryRepository, StoryWithSeen } from '../domain/story.repository';
import { StoriesService } from './stories.service';

const me: AuthenticatedUser = { id: 'me', type: AccountType.STUDENT };

/** An `expiresAt` that is still ahead — the default fixture's is already in the past. */
function future(): Date {
  return new Date(Date.now() + 3600_000);
}

function story(overrides: Partial<Story> = {}): Story {
  return {
    id: 'sty_1',
    authorId: 'other',
    kind: StoryKind.IMAGE,
    mediaId: 'med_1',
    url: '/v1/media/med_1/raw',
    thumbUrl: '/v1/media/med_1/raw?variant=thumb',
    width: 1080,
    height: 1920,
    durationMs: null,
    caption: null,
    createdAt: new Date('2026-07-31T08:00:00Z'),
    expiresAt: new Date('2026-08-01T08:00:00Z'),
    viewsCount: 3,
    archivedMediaPurged: false,
    ...overrides,
  };
}

function summary(id: string, overrides: Partial<StudentSummary> = {}): StudentSummary {
  return {
    id,
    username: id,
    fullName: id,
    avatarUrl: null,
    photos: [],
    bio: null,
    universityId: null,
    gender: null,
    courseYear: null,
    online: false,
    lastSeenAt: null,
    phoneNumber: null,
    lastSeenVisibility: LastSeenVisibility.CONNECTIONS,
    phoneVisibility: PhoneVisibility.NOBODY,
    ...overrides,
  };
}

function storyAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'med_1',
    ownerId: 'me',
    conversationId: null,
    kind: MediaKind.STORY_IMAGE,
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
    height: 1920,
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

function makeStories(overrides: Partial<StoryRepository> = {}): StoryRepository {
  return {
    create: jest.fn(async (input: NewStory) => story({ ...input, id: 'sty_new', viewsCount: 0 })),
    findLive: jest.fn().mockResolvedValue(null),
    findExisting: jest.fn().mockResolvedValue(null),
    listArchived: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    countActive: jest.fn().mockResolvedValue(0),
    countPostedSince: jest.fn().mockResolvedValue(0),
    listLiveByAuthors: jest.fn().mockResolvedValue([]),
    recordView: jest.fn().mockResolvedValue(true),
    listViewers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    softDelete: jest.fn().mockResolvedValue(true),
    findDeletedPurgeable: jest.fn().mockResolvedValue([]),
    findArchivePurgeable: jest.fn().mockResolvedValue([]),
    markArchivedMediaPurged: jest.fn().mockResolvedValue(undefined),
    purge: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeAudience(connected = true, ids: string[] = ['other']): StoryAudienceRepository {
  return {
    areConnected: jest.fn().mockResolvedValue(connected),
    connectedIds: jest.fn().mockResolvedValue(ids),
  };
}

function makeDirectory(summaries: StudentSummary[] = []): StudentDirectoryRepository {
  return {
    exists: jest.fn().mockResolvedValue(true),
    findSummary: jest.fn().mockResolvedValue(null),
    findSummaries: jest.fn().mockResolvedValue(summaries),
    list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  };
}

function makeMedia(asset: MediaAsset | null = storyAsset()): MediaAssetRepository {
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

function makePresence(): PresenceRepository {
  return {
    online: jest.fn().mockResolvedValue(undefined),
    offline: jest.fn().mockResolvedValue(true),
    isOnline: jest.fn().mockResolvedValue(false),
    onlineAmong: jest.fn().mockResolvedValue(new Set<string>()),
  };
}

function makeMediaFiles(): ChatMediaService {
  return {
    deleteAssets: jest.fn().mockResolvedValue(0),
    purgeAssetBytes: jest.fn().mockResolvedValue(0),
  } as unknown as ChatMediaService;
}

function makeService(
  stories: StoryRepository = makeStories(),
  audience: StoryAudienceRepository = makeAudience(),
  directory: StudentDirectoryRepository = makeDirectory(),
  media: MediaAssetRepository = makeMedia(),
  mediaFiles: ChatMediaService = makeMediaFiles(),
): StoriesService {
  const config = {
    get: (key: string) => (key === 'STORY_ARCHIVE_RETENTION_DAYS' ? 365 : 'v1'),
  } as unknown as ConfigService<never, true>;
  return new StoriesService(
    stories,
    audience,
    directory,
    media,
    mediaFiles,
    makePresence(),
    config,
  );
}

describe('StoriesService', () => {
  describe('create', () => {
    it('stores expiresAt 24 hours out, as a value rather than a rule', async () => {
      const stories = makeStories();
      const before = Date.now();
      const created = await makeService(stories).create(me, 'med_1', 'Imtihon tugadi');
      const after = Date.now();

      const written = (stories.create as jest.Mock).mock.calls[0][0] as NewStory;
      expect(written.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 24 * 3600_000);
      expect(written.expiresAt.getTime()).toBeLessThanOrEqual(after + 24 * 3600_000);
      expect(created.caption).toBe('Imtihon tugadi');
    });

    it('derives the story kind from the uploaded asset, not from the client', async () => {
      const stories = makeStories();
      await makeService(
        stories,
        makeAudience(),
        makeDirectory(),
        makeMedia(storyAsset({ kind: MediaKind.STORY_VIDEO, durationMs: 12_000 })),
      ).create(me, 'med_1', null);

      const written = (stories.create as jest.Mock).mock.calls[0][0] as NewStory;
      expect(written.kind).toBe(StoryKind.VIDEO);
      expect(written.durationMs).toBe(12_000);
    });

    it('turns a blank caption into null rather than an empty string', async () => {
      const stories = makeStories();
      await makeService(stories).create(me, 'med_1', '   ');
      expect((stories.create as jest.Mock).mock.calls[0][0]).toMatchObject({ caption: null });
    });

    it(`refuses the story past ${MAX_ACTIVE_STORIES} live ones`, async () => {
      const stories = makeStories({
        countActive: jest.fn().mockResolvedValue(MAX_ACTIVE_STORIES),
      });
      await expect(makeService(stories).create(me, 'med_1', null)).rejects.toMatchObject({
        code: ERROR_CODE.STORY_LIMIT_REACHED,
        status: 422,
      });
    });

    it(`refuses the story past ${MAX_STORIES_PER_DAY} in a day, counting deleted ones`, async () => {
      // Counting deleted ones is the point: otherwise post-then-delete is an unlimited quota.
      const stories = makeStories({
        countPostedSince: jest.fn().mockResolvedValue(MAX_STORIES_PER_DAY),
      });
      await expect(makeService(stories).create(me, 'med_1', null)).rejects.toMatchObject({
        code: ERROR_CODE.STORY_LIMIT_REACHED,
      });
    });

    it('refuses an asset uploaded as something other than a story', async () => {
      const service = makeService(
        makeStories(),
        makeAudience(),
        makeDirectory(),
        makeMedia(storyAsset({ kind: MediaKind.IMAGE })),
      );
      await expect(service.create(me, 'med_1', null)).rejects.toMatchObject({
        code: ERROR_CODE.MEDIA_NOT_FOUND,
        status: 422,
      });
    });

    it('refuses someone else’s upload', async () => {
      const service = makeService(
        makeStories(),
        makeAudience(),
        makeDirectory(),
        makeMedia(storyAsset({ ownerId: 'other' })),
      );
      await expect(service.create(me, 'med_1', null)).rejects.toMatchObject({
        code: ERROR_CODE.MEDIA_NOT_FOUND,
      });
    });

    it('refuses a video that is still transcoding', async () => {
      // Posting it now would publish something that plays for nobody until the queue catches up.
      const service = makeService(
        makeStories(),
        makeAudience(),
        makeDirectory(),
        makeMedia(storyAsset({ kind: MediaKind.STORY_VIDEO, status: MediaStatus.PROCESSING })),
      );
      await expect(service.create(me, 'med_1', null)).rejects.toMatchObject({
        code: ERROR_CODE.MEDIA_NOT_READY,
      });
    });
  });

  describe('feed', () => {
    const rows = (entries: StoryWithSeen[]): StoryRepository =>
      makeStories({ listLiveByAuthors: jest.fn().mockResolvedValue(entries) });

    it('puts authors with something unseen first, then newest activity', async () => {
      const service = makeService(
        rows([
          {
            story: story({
              id: 'a',
              authorId: 'seen-old',
              createdAt: new Date('2026-07-31T01:00:00Z'),
            }),
            seen: true,
          },
          {
            story: story({
              id: 'b',
              authorId: 'seen-new',
              createdAt: new Date('2026-07-31T09:00:00Z'),
            }),
            seen: true,
          },
          {
            story: story({
              id: 'c',
              authorId: 'unseen',
              createdAt: new Date('2026-07-31T02:00:00Z'),
            }),
            seen: false,
          },
        ]),
        makeAudience(true, ['seen-old', 'seen-new', 'unseen']),
        makeDirectory([summary('seen-old'), summary('seen-new'), summary('unseen')]),
      );

      const feed = await service.feed(me);
      expect(feed.map((group) => group.author.id)).toEqual(['unseen', 'seen-new', 'seen-old']);
      expect(feed[0].hasUnseen).toBe(true);
    });

    it('groups several stories under one author and reports the newest timestamp', async () => {
      const service = makeService(
        rows([
          { story: story({ id: 'a', createdAt: new Date('2026-07-31T01:00:00Z') }), seen: true },
          { story: story({ id: 'b', createdAt: new Date('2026-07-31T05:00:00Z') }), seen: false },
        ]),
        makeAudience(true, ['other']),
        makeDirectory([summary('other')]),
      );

      const feed = await service.feed(me);
      expect(feed).toHaveLength(1);
      expect(feed[0].stories).toHaveLength(2);
      expect(feed[0].hasUnseen).toBe(true);
      expect(feed[0].lastCreatedAt).toEqual(new Date('2026-07-31T05:00:00Z'));
    });

    it('hides someone else’s view count', async () => {
      // Seeing it would let a viewer measure the size of another student's network.
      const service = makeService(
        rows([{ story: story({ viewsCount: 42 }), seen: false }]),
        makeAudience(true, ['other']),
        makeDirectory([summary('other')]),
      );
      expect((await service.feed(me))[0].stories[0].viewsCount).toBeNull();
    });

    it('is empty for someone with no connections, without querying stories', async () => {
      const stories = makeStories();
      const feed = await makeService(stories, makeAudience(true, [])).feed(me);
      expect(feed).toEqual([]);
      expect(stories.listLiveByAuthors).toHaveBeenCalledWith([], 'me');
    });
  });

  describe('mine', () => {
    it('shows the real counts and never marks your own story unseen', async () => {
      const service = makeService(
        makeStories({
          listLiveByAuthors: jest
            .fn()
            .mockResolvedValue([{ story: story({ authorId: 'me', viewsCount: 7 }), seen: false }]),
        }),
      );
      const [entry] = await service.mine(me);
      expect(entry.viewsCount).toBe(7);
      expect(entry.seen).toBe(true);
    });
  });

  describe('markViewed', () => {
    it('records a connection’s story', async () => {
      const stories = makeStories({ findLive: jest.fn().mockResolvedValue(story()) });
      await makeService(stories).markViewed(me, 'sty_1');
      expect(stories.recordView).toHaveBeenCalledWith('sty_1', 'me');
    });

    it('does not count you viewing your own story', async () => {
      // Otherwise every story you post opens at 1.
      const stories = makeStories({
        findLive: jest.fn().mockResolvedValue(story({ authorId: 'me' })),
      });
      await makeService(stories).markViewed(me, 'sty_1');
      expect(stories.recordView).not.toHaveBeenCalled();
    });

    it('404s for an expired, deleted or unknown story alike', async () => {
      await expect(makeService().markViewed(me, 'gone')).rejects.toMatchObject({
        code: ERROR_CODE.STORY_NOT_FOUND,
        status: 404,
      });
    });

    it('403s when the viewer is not connected to the author', async () => {
      const stories = makeStories({ findLive: jest.fn().mockResolvedValue(story()) });
      await expect(
        makeService(stories, makeAudience(false)).markViewed(me, 'sty_1'),
      ).rejects.toMatchObject({ code: ERROR_CODE.STORY_FORBIDDEN, status: 403 });
    });
  });

  describe('archive', () => {
    it('asks only for the caller’s own expired stories', async () => {
      const stories = makeStories();
      await makeService(stories).archive(me, 2, 30);
      expect(stories.listArchived).toHaveBeenCalledWith('me', 2, 30);
    });

    it('keeps the frozen view count — the profile grid draws it', async () => {
      const archived = story({ authorId: 'me', viewsCount: 12 });
      const stories = makeStories({
        listArchived: jest.fn().mockResolvedValue({ items: [archived], total: 1 }),
      });
      const page = await makeService(stories).archive(me, 1, 30);
      expect(page.items[0].viewsCount).toBe(12);
    });
  });

  describe('viewers', () => {
    it('is author-only', async () => {
      const stories = makeStories({
        findExisting: jest.fn().mockResolvedValue(story({ expiresAt: future() })),
      });
      await expect(makeService(stories).viewers(me, 'sty_1', 1, 30)).rejects.toMatchObject({
        code: ERROR_CODE.STORY_FORBIDDEN,
        status: 403,
      });
    });

    it('returns the list to the author', async () => {
      const stories = makeStories({
        findExisting: jest.fn().mockResolvedValue(story({ authorId: 'me' })),
        listViewers: jest.fn().mockResolvedValue({ items: [summary('viewer')], total: 1 }),
      });
      await expect(makeService(stories).viewers(me, 'sty_1', 1, 30)).resolves.toMatchObject({
        total: 1,
      });
    });

    it('still works once the story is archived — the frozen count stays openable', async () => {
      const stories = makeStories({
        // `expiresAt` is already in the past on the default fixture.
        findExisting: jest.fn().mockResolvedValue(story({ authorId: 'me' })),
        listViewers: jest.fn().mockResolvedValue({ items: [summary('viewer')], total: 1 }),
      });
      await expect(makeService(stories).viewers(me, 'sty_1', 1, 30)).resolves.toMatchObject({
        total: 1,
      });
    });

    it('404s rather than 403s on someone else’s archive — it should not be there at all', async () => {
      const stories = makeStories({ findExisting: jest.fn().mockResolvedValue(story()) });
      await expect(makeService(stories).viewers(me, 'sty_1', 1, 30)).rejects.toMatchObject({
        code: ERROR_CODE.STORY_NOT_FOUND,
        status: 404,
      });
    });
  });

  describe('remove', () => {
    it('404s when the story is not the caller’s', async () => {
      const stories = makeStories({ softDelete: jest.fn().mockResolvedValue(false) });
      await expect(makeService(stories).remove(me, 'sty_1')).rejects.toMatchObject({
        code: ERROR_CODE.STORY_NOT_FOUND,
      });
    });
  });

  describe('purgeDeleted', () => {
    it('deletes the media, which is what cascades the story and its views away', async () => {
      const mediaFiles = makeMediaFiles();
      const stories = makeStories({
        findDeletedPurgeable: jest.fn().mockResolvedValue([{ id: 'sty_1', mediaId: 'med_1' }]),
      });
      await makeService(
        stories,
        makeAudience(),
        makeDirectory(),
        makeMedia(),
        mediaFiles,
      ).purgeDeleted();
      expect(mediaFiles.deleteAssets).toHaveBeenCalledWith(['med_1']);
    });

    it('does nothing when there is nothing to purge', async () => {
      const mediaFiles = makeMediaFiles();
      await makeService(
        makeStories(),
        makeAudience(),
        makeDirectory(),
        makeMedia(),
        mediaFiles,
      ).purgeDeleted();
      expect(mediaFiles.deleteAssets).not.toHaveBeenCalled();
    });

    it('sweeps on the delete timestamp, not on expiry — an expired story is an archive', async () => {
      const stories = makeStories();
      const before = Date.now();
      await makeService(stories).purgeDeleted();

      // The cutoff is `deletedAt < now - 24h`. Were this still driven by `expiresAt`, every
      // archived story in the table would be inside the batch it deletes.
      const [cutoff] = (stories.findDeletedPurgeable as jest.Mock).mock.calls[0] as [Date];
      expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(24 * 3600_000);
      expect(before - cutoff.getTime()).toBeLessThan(24 * 3600_000 + 5_000);
    });
  });

  describe('purgeArchivedMedia', () => {
    it('sweeps at the configured retention boundary', async () => {
      const stories = makeStories();
      const before = Date.now();
      await makeService(stories).purgeArchivedMedia();
      const [cutoff] = (stories.findArchivePurgeable as jest.Mock).mock.calls[0] as [Date];
      // 365 days back, give or take the millisecond the call took.
      expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(365 * 24 * 3600_000);
      expect(before - cutoff.getTime()).toBeLessThan(365 * 24 * 3600_000 + 5_000);
    });

    it('takes the bytes but keeps the row, then flags it', async () => {
      const mediaFiles = makeMediaFiles();
      const stories = makeStories({
        findArchivePurgeable: jest.fn().mockResolvedValue([{ id: 'sty_1', mediaId: 'med_1' }]),
      });
      const purged = await makeService(
        stories,
        makeAudience(),
        makeDirectory(),
        makeMedia(),
        mediaFiles,
      ).purgeArchivedMedia();

      expect(mediaFiles.purgeAssetBytes).toHaveBeenCalledWith(['med_1']);
      // `deleteAssets` would cascade the archived post away with its asset.
      expect(mediaFiles.deleteAssets).not.toHaveBeenCalled();
      expect(stories.markArchivedMediaPurged).toHaveBeenCalledWith(['sty_1']);
      expect(purged).toBe(1);
    });

    it('does nothing when nothing has aged out', async () => {
      const mediaFiles = makeMediaFiles();
      await makeService(
        makeStories(),
        makeAudience(),
        makeDirectory(),
        makeMedia(),
        mediaFiles,
      ).purgeArchivedMedia();
      expect(mediaFiles.purgeAssetBytes).not.toHaveBeenCalled();
    });
  });
});
