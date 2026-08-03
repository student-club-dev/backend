import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ConnectionStatus, MediaKind, MediaStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import type { Env } from '../src/config/env';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { ChatMediaService } from '../src/modules/media/application/chat-media.service';
import { StoriesService } from '../src/modules/stories/application/stories.service';

const AUTHOR_EMAIL = 'e2e-archive-author@example.com';
const FRIEND_EMAIL = 'e2e-archive-friend@example.com';
const OUTSIDER_EMAIL = 'e2e-archive-outsider@example.com';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Story archive — end-to-end against a real database.
 *
 * This exists because the unit tests mock the repository, which means the predicates that *are* the
 * feature — `expiresAt <= now()` for the archive, `expiresAt > now()` for media access, the two
 * purge queries — have no coverage there at all. Every assertion below is one of the acceptance
 * criteria in `STORY_ARCHIVE_BACKEND.md` §6, run against real SQL.
 */
describe('Story archive — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let stories: StoriesService;
  let media: ChatMediaService;
  let authorToken: string;
  let friendToken: string;
  let outsiderToken: string;
  let authorId: string;
  let friendId: string;
  let outsiderId: string;

  const auth = (token: string): string => `Bearer ${token}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    app.setGlobalPrefix(config.get('API_PREFIX', { infer: true }));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);
    stories = app.get(StoriesService);
    media = app.get(ChatMediaService);
    await cleanup();

    authorToken = await register(AUTHOR_EMAIL);
    friendToken = await register(FRIEND_EMAIL);
    outsiderToken = await register(OUTSIDER_EMAIL);
    authorId = await idOf(AUTHOR_EMAIL);
    friendId = await idOf(FRIEND_EMAIL);
    outsiderId = await idOf(OUTSIDER_EMAIL);

    // The author and the friend are connected; the outsider is not. Written directly because the
    // request/accept dance is covered by the connections e2e and is not what this file is about.
    await prisma.connection.create({
      data: {
        requesterId: authorId,
        addresseeId: friendId,
        status: ConnectionStatus.ACCEPTED,
        respondedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function register(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/student/register')
      .send({ email, password: 'password123' })
      .expect(201);
    return res.body.result.accessToken as string;
  }

  async function idOf(email: string): Promise<string> {
    return (await prisma.student.findUniqueOrThrow({ where: { email } })).id;
  }

  async function cleanup(): Promise<void> {
    await prisma.student.deleteMany({
      where: { email: { in: [AUTHOR_EMAIL, FRIEND_EMAIL, OUTSIDER_EMAIL] } },
    });
  }

  /** Posts a story through the real endpoint, over an asset row written straight to the table. */
  async function postStory(caption: string): Promise<{ storyId: string; mediaId: string }> {
    const asset = await prisma.mediaAsset.create({
      data: {
        ownerId: authorId,
        kind: MediaKind.STORY_IMAGE,
        status: MediaStatus.READY,
        storageKey: `e2e/${caption}.webp`,
        thumbStorageKey: `e2e/${caption}-t.webp`,
        mimeType: 'image/webp',
        sizeBytes: 1000,
        width: 1080,
        height: 1920,
      },
    });
    const res = await request(app.getHttpServer())
      .post('/v1/stories')
      .set('Authorization', auth(authorToken))
      .send({ mediaId: asset.id, caption })
      .expect(201);
    return { storyId: res.body.result.id as string, mediaId: asset.id };
  }

  /** Drags a story's expiry into the past — what waiting 24 hours would do. */
  async function expire(storyId: string, agoMs = 60_000): Promise<void> {
    await prisma.story.update({
      where: { id: storyId },
      data: { expiresAt: new Date(Date.now() - agoMs) },
    });
  }

  const archiveOf = async (token: string, query = ''): Promise<request.Response> =>
    request(app.getHttpServer())
      .get(`/v1/stories/archive${query}`)
      .set('Authorization', auth(token))
      .expect(200);

  it('starts empty, and a fresh story goes to /mine rather than the archive', async () => {
    const { storyId } = await postStory('live');

    const mine = await request(app.getHttpServer())
      .get('/v1/stories/mine')
      .set('Authorization', auth(authorToken))
      .expect(200);
    expect(mine.body.result.items.map((s: { id: string }) => s.id)).toContain(storyId);

    const archive = await archiveOf(authorToken);
    expect(archive.body.result.items).toEqual([]);
    expect(archive.body.result.total).toBe(0);
    expect(archive.body.result.hasNext).toBe(false);
  });

  it('moves an expired story out of the feed and /mine and into the archive', async () => {
    const { storyId } = await postStory('expiring');
    await expire(storyId);

    const mine = await request(app.getHttpServer())
      .get('/v1/stories/mine')
      .set('Authorization', auth(authorToken))
      .expect(200);
    expect(mine.body.result.items.map((s: { id: string }) => s.id)).not.toContain(storyId);

    // The friend's feed must not carry it either.
    const feed = await request(app.getHttpServer())
      .get('/v1/stories/feed')
      .set('Authorization', auth(friendToken))
      .expect(200);
    const feedIds = feed.body.result.items.flatMap((g: { stories: { id: string }[] }) =>
      g.stories.map((s) => s.id),
    );
    expect(feedIds).not.toContain(storyId);

    const archive = await archiveOf(authorToken);
    expect(archive.body.result.items.map((s: { id: string }) => s.id)).toContain(storyId);
  });

  it('keeps the view count frozen on an archived story rather than nulling it', async () => {
    const { storyId } = await postStory('counted');
    await request(app.getHttpServer())
      .post(`/v1/stories/${storyId}/view`)
      .set('Authorization', auth(friendToken))
      .expect(200);
    await expire(storyId);

    const archive = await archiveOf(authorToken);
    const entry = archive.body.result.items.find((s: { id: string }) => s.id === storyId);
    expect(entry.viewsCount).toBe(1);
    expect(entry.seen).toBe(true);
    expect(entry.archivedMediaPurged).toBe(false);
    // Past by definition — the client reads it as a date, nothing more.
    expect(new Date(entry.expiresAt).getTime()).toBeLessThan(Date.now());
  });

  it('orders the archive newest first and paginates it', async () => {
    const older = await postStory('page-older');
    await new Promise((resolve) => setTimeout(resolve, 1100)); // distinct createdAt
    const newer = await postStory('page-newer');
    await expire(older.storyId);
    await expire(newer.storyId);

    const all = await archiveOf(authorToken);
    const ids = all.body.result.items.map((s: { id: string }) => s.id);
    expect(ids.indexOf(newer.storyId)).toBeLessThan(ids.indexOf(older.storyId));

    const total = all.body.result.total as number;
    const first = await archiveOf(authorToken, '?page=1&size=1');
    expect(first.body.result.items).toHaveLength(1);
    expect(first.body.result.size).toBe(1);
    expect(first.body.result.hasNext).toBe(true);

    const second = await archiveOf(authorToken, '?page=2&size=1');
    expect(second.body.result.items[0].id).not.toBe(first.body.result.items[0].id);

    const last = await archiveOf(authorToken, `?page=${total}&size=1`);
    expect(last.body.result.hasNext).toBe(false);
  });

  it('shows nobody else’s archive — there is no parameter to ask with', async () => {
    const outsider = await archiveOf(outsiderToken);
    expect(outsider.body.result.items).toEqual([]);

    const friend = await archiveOf(friendToken);
    expect(friend.body.result.items).toEqual([]);
  });

  it('still lists the viewers of an archived story, to its author only', async () => {
    const { storyId } = await postStory('viewers');
    await request(app.getHttpServer())
      .post(`/v1/stories/${storyId}/view`)
      .set('Authorization', auth(friendToken))
      .expect(200);
    await expire(storyId);

    const asAuthor = await request(app.getHttpServer())
      .get(`/v1/stories/${storyId}/views`)
      .set('Authorization', auth(authorToken))
      .expect(200);
    expect(asAuthor.body.result.total).toBe(1);
    expect(asAuthor.body.result.items[0].id).toBe(friendId);

    // 404 rather than 403: an archived story should not be admitted to exist at all.
    for (const token of [friendToken, outsiderToken]) {
      const denied = await request(app.getHttpServer())
        .get(`/v1/stories/${storyId}/views`)
        .set('Authorization', auth(token))
        .expect(404);
      expect(denied.body.error.code).toBe('STORY_NOT_FOUND');
    }
  });

  it('narrows media access to the author the moment the story expires', async () => {
    const { storyId, mediaId } = await postStory('media-gate');

    // Live: the connection may read the bytes.
    await expect(media.findForMember(mediaId, friendId)).resolves.toMatchObject({ id: mediaId });

    await expire(storyId);

    // Archived: the same connection may not, and neither may an outsider.
    await expect(media.findForMember(mediaId, friendId)).rejects.toMatchObject({ status: 404 });
    await expect(media.findForMember(mediaId, outsiderId)).rejects.toMatchObject({ status: 404 });
    // The author keeps it.
    await expect(media.findForMember(mediaId, authorId)).resolves.toMatchObject({ id: mediaId });
  });

  it('refuses a new view on an archived story', async () => {
    const { storyId } = await postStory('no-new-views');
    await expire(storyId);

    await request(app.getHttpServer())
      .post(`/v1/stories/${storyId}/view`)
      .set('Authorization', auth(friendToken))
      .expect(404);
  });

  it('drops an archived story from the archive when the author deletes it', async () => {
    const { storyId } = await postStory('deleted');
    await expire(storyId);

    await request(app.getHttpServer())
      .delete(`/v1/stories/${storyId}`)
      .set('Authorization', auth(authorToken))
      .expect(200);

    const archive = await archiveOf(authorToken);
    expect(archive.body.result.items.map((s: { id: string }) => s.id)).not.toContain(storyId);
  });

  describe('the cleanup sweeps', () => {
    it('does not touch an archived story — expiry is not a delete', async () => {
      const { storyId } = await postStory('survives-sweep');
      await expire(storyId, 10 * DAY_MS); // long past the old 24h purge boundary

      await stories.purgeDeleted();

      const row = await prisma.story.findUnique({ where: { id: storyId } });
      expect(row).not.toBeNull();
      const archive = await archiveOf(authorToken);
      expect(archive.body.result.items.map((s: { id: string }) => s.id)).toContain(storyId);
    });

    it('reclaims the file past retention but keeps the post', async () => {
      const { storyId, mediaId } = await postStory('aged-out');
      await expire(storyId, 400 * DAY_MS); // retention is 365 days

      const purged = await stories.purgeArchivedMedia();
      expect(purged).toBeGreaterThanOrEqual(1);

      // The post survives, flagged, and is still in the archive.
      const row = await prisma.story.findUniqueOrThrow({ where: { id: storyId } });
      expect(row.archivedMediaPurged).toBe(true);

      const archive = await archiveOf(authorToken);
      const entry = archive.body.result.items.find((s: { id: string }) => s.id === storyId);
      expect(entry).toBeDefined();
      expect(entry.archivedMediaPurged).toBe(true);

      // The asset row survives too — `Story` cascades from it — but with no bytes left to serve.
      const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
      expect(asset.storageKey).toBeNull();
      expect(asset.thumbStorageKey).toBeNull();
    });

    it('sweeps the same rows only once', async () => {
      // Everything aged out was flagged by the previous test, so a second pass finds nothing.
      await expect(stories.purgeArchivedMedia()).resolves.toBe(0);
    });
  });
});
