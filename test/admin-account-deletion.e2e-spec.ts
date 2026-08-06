import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AccountType } from '../src/common/enums/account-type.enum';
import { ERROR_CODE } from '../src/common/errors/error-code';
import { AdminRole } from '../src/modules/admin/domain/enums/admin-role.enum';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import type { Env } from '../src/config/env';
import { RedisService } from '../src/infrastructure/cache/redis.service';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { ADMIN_BUSINESS_OWNER_WRITE_REPOSITORY } from '../src/modules/admin/domain/admin-business-owner-write.repository';
import type { AdminBusinessOwnerWriteRepository } from '../src/modules/admin/domain/admin-business-owner-write.repository';
import { ADMIN_STUDENT_WRITE_REPOSITORY } from '../src/modules/admin/domain/admin-student-write.repository';
import type { AdminStudentWriteRepository } from '../src/modules/admin/domain/admin-student-write.repository';
import { TASHKENT, clearFeedCache, removeFeed, seedFeed } from './helpers/feed-fixture';
import request from 'supertest';

/**
 * Ban vs delete, against real SQL (admin-panel 15-deletion.md).
 *
 * These two are the destructive half of the admin panel and their guarantees are opposite ones, so
 * both need proving against the database rather than a mock:
 *
 * - **ban** must be *complete* (the shopfront leaves the student feed, not just the login page) and
 *   *reversible*. The completeness half lives in a SQL predicate — `VISIBLE_LISTING` — which no unit
 *   test executes, and the failure it prevents is silent: a banned scammer whose discounts keep
 *   drawing students to a counter that will not honour them.
 * - **delete** must actually remove the row and everything the cascade owns. The cost of getting
 *   this wrong is asymmetric — a delete that leaves rows behind is a bug, but a cascade nobody
 *   verified is unrecoverable data loss — so the test asserts what is gone, one table at a time.
 */
describe('Admin ban vs hard delete — e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let students: AdminStudentWriteRepository;
  let owners: AdminBusinessOwnerWriteRepository;
  let ownerId: string;
  let studentId: string;
  let businessId: string;
  let listingId: string;
  let adminToken: string;

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
    redis = app.get(RedisService);
    students = app.get(ADMIN_STUDENT_WRITE_REPOSITORY);
    owners = app.get(ADMIN_BUSINESS_OWNER_WRITE_REPOSITORY);

    // Admins have no table — they are env-configured and the guard trusts the signed payload — so
    // the token is minted directly rather than by posting to /admin/auth/login with a seeded hash.
    adminToken = await app.get(JwtService).signAsync(
      { sub: 'e2e-admin@elon.uz', type: AccountType.ADMIN, role: AdminRole.ADMIN },
      {
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }),
      },
    );

    const seeded = await seedFeed(prisma, redis, [
      {
        key: 'kafe',
        type: 'NATIONAL_FOOD',
        name: 'Kafe Test',
        branches: [{ key: 'markaz', name: 'Markaziy', lat: TASHKENT.lat, lng: TASHKENT.lng }],
        listings: [
          {
            key: 'osh',
            categoryKey: 'PALOV',
            title: 'Osh',
            branchKeys: ['markaz'],
            originalPrice: 30_000,
            finalPrice: 21_000,
            isDiscount: true,
            discountValue: 30,
            discountPercent: 30,
            searchText: 'Osh PALOV palov',
          },
        ],
      },
    ]);
    ownerId = seeded.ownerId;
    studentId = seeded.studentId;
    businessId = seeded.businessIds.kafe;
    listingId = seeded.listingIds.osh;
  });

  afterAll(async () => {
    await removeFeed(prisma, redis);
    await app.close();
  });

  /** The feed caches per-query, so every visibility assertion has to start from a cold cache. */
  async function visibleListingIds(): Promise<string[]> {
    await clearFeedCache(redis);
    const res = await request(app.getHttpServer())
      .post('/v1/discounts/search')
      .send({ mode: 'LIST', filter: { groupKeys: ['FOOD'], categoryKeys: ['PALOV'] } })
      .expect(200);
    return (res.body.result.items as { id: string }[]).map((item) => item.id);
  }

  describe('ban — inactive, and reversible', () => {
    it('starts visible', async () => {
      expect(await visibleListingIds()).toContain(listingId);
    });

    it('⛔ banning the owner takes their listing out of the student feed', async () => {
      await owners.ban(ownerId, 'firibgarlik');

      expect(await visibleListingIds()).not.toContain(listingId);
    });

    it('leaves the rows alone — the listing is still ACTIVE and the business still APPROVED', async () => {
      // This is what makes the ban reversible. If ban archived rows instead, `unban` could not know
      // which listings the owner had deliberately paused before the ban.
      const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
      const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });

      expect(listing.status).toBe('ACTIVE');
      expect(business.status).toBe('APPROVED');
    });

    it('unbanning puts the whole shopfront back', async () => {
      await owners.unban(ownerId);

      expect(await visibleListingIds()).toContain(listingId);
    });
  });

  describe('hard delete — the row is gone', () => {
    /**
     * A redemption belonging to a student who is NOT the one being deleted. This is the claim
     * 15-deletion.md §2 makes loudest — deleting an owner reaches sideways into an uninvolved
     * student's history — and it is the only way to test it: if the redemption hung off the
     * deleted student, `Redemption.student` (Cascade) would remove it and the listing path would
     * never be exercised.
     */
    let bystanderId: string;
    let redemptionId: string;

    beforeAll(async () => {
      const bystander = await prisma.student.create({
        data: {
          email: 'e2e-bystander@elon.uz',
          phoneNumber: '+998900000203',
          phoneVerified: true,
        },
      });
      bystanderId = bystander.id;
      const redemption = await prisma.redemption.create({
        data: { listingId, studentId: bystanderId, code: 'E2E-REDEEM-001' },
      });
      redemptionId = redemption.id;
    });

    afterAll(async () => {
      await prisma.student.deleteMany({ where: { id: bystanderId } });
    });

    it('removes the student row itself', async () => {
      await students.hardDelete(studentId);

      expect(await prisma.student.findUnique({ where: { id: studentId } })).toBeNull();
    });

    it('removes the owner, and the businesses and listings that hang off them', async () => {
      await owners.hardDelete(ownerId);

      expect(await prisma.businessOwner.findUnique({ where: { id: ownerId } })).toBeNull();
      expect(await prisma.business.findUnique({ where: { id: businessId } })).toBeNull();
      expect(await prisma.listing.findUnique({ where: { id: listingId } })).toBeNull();
      // The branches go with the business — the cascade runs two levels, not one.
      expect(await prisma.branch.count({ where: { businessId } })).toBe(0);
    });

    it('⚠️ takes an uninvolved student’s redemption with it — the §2 warning is real', async () => {
      // The owner delete above is what removed this: business → listing → redemption, three levels.
      expect(await prisma.redemption.findUnique({ where: { id: redemptionId } })).toBeNull();
      // ...while the student who earned it is untouched. Only their history lost a row.
      expect(await prisma.student.findUnique({ where: { id: bystanderId } })).not.toBeNull();
    });
  });

  /**
   * The block above proves the cascade; this one proves the endpoint in front of it. They are
   * separate concerns and only one of them was covered: the repository can be correct while the
   * route still returns the wrong envelope, or 409s on a second call, or lets a MODERATOR through.
   * The admin panel is written against this layer, not against the repository.
   */
  describe('DELETE /v1/admin/... — the endpoint, end to end', () => {
    const EMAIL = { student: 'e2e-del-student@elon.uz', owner: 'e2e-del-owner@elon.uz' };

    afterAll(async () => {
      // Only matters when an assertion above failed — a passing run deletes these itself.
      await prisma.student.deleteMany({ where: { email: EMAIL.student } });
      await prisma.businessOwner.deleteMany({ where: { email: EMAIL.owner } });
    });

    it('deletes a student and answers `result: null` in the BaseResponse envelope', async () => {
      const student = await prisma.student.create({
        data: { email: EMAIL.student, phoneNumber: '+998900000201', phoneVerified: true },
      });

      const res = await request(app.getHttpServer())
        .delete(`/v1/admin/students/${student.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'e2e' })
        .expect(200);

      expect(res.body).toMatchObject({ success: true, status: 200, result: null, error: null });
      expect(await prisma.student.findUnique({ where: { id: student.id } })).toBeNull();
    });

    // The old soft delete answered 409 INVALID_STATUS_TRANSITION here. Nothing is left to conflict
    // with now, and the admin panel was told to expect 404 — so the contract change is asserted.
    it('answers 404 STUDENT_NOT_FOUND on a second delete, not 409', async () => {
      const student = await prisma.student.create({
        data: { email: EMAIL.student, phoneNumber: '+998900000201', phoneVerified: true },
      });
      const url = `/v1/admin/students/${student.id}`;
      await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.error.code).toBe(ERROR_CODE.STUDENT_NOT_FOUND);
      expect(res.body.result).toBeNull();
    });

    it('deletes a business owner the same way', async () => {
      const owner = await prisma.businessOwner.create({
        data: { email: EMAIL.owner, phoneNumber: '+998900000202', phoneVerified: true },
      });

      const res = await request(app.getHttpServer())
        .delete(`/v1/admin/business-owners/${owner.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      expect(res.body).toMatchObject({ success: true, status: 200, result: null, error: null });
      expect(await prisma.businessOwner.findUnique({ where: { id: owner.id } })).toBeNull();
    });

    it('refuses an unauthenticated caller — 401, and the row survives', async () => {
      const student = await prisma.student.create({
        data: { email: EMAIL.student, phoneNumber: '+998900000201', phoneVerified: true },
      });

      await request(app.getHttpServer()).delete(`/v1/admin/students/${student.id}`).expect(401);

      expect(await prisma.student.findUnique({ where: { id: student.id } })).not.toBeNull();
      await prisma.student.delete({ where: { id: student.id } });
    });

    // Deleting an account is ADMIN-only; banning is the moderator's tool (15-deletion.md §7).
    it('refuses a MODERATOR — 403, and the row survives', async () => {
      const moderatorToken = await app.get(JwtService).signAsync(
        { sub: 'e2e-mod@elon.uz', type: AccountType.ADMIN, role: AdminRole.MODERATOR },
        {
          secret: app.get<ConfigService<Env, true>>(ConfigService).get('JWT_ACCESS_SECRET', {
            infer: true,
          }),
          expiresIn: '5m',
        },
      );
      const student = await prisma.student.create({
        data: { email: EMAIL.student, phoneNumber: '+998900000201', phoneVerified: true },
      });

      await request(app.getHttpServer())
        .delete(`/v1/admin/students/${student.id}`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .expect(403);

      expect(await prisma.student.findUnique({ where: { id: student.id } })).not.toBeNull();
      await prisma.student.delete({ where: { id: student.id } });
    });
  });
});
