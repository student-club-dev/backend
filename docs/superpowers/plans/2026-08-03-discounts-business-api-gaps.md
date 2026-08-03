# Discounts business API gaps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the seven divergences between `docs/api/provider/DISCOUNTS_BUSINESS_API.md` and this backend — flag-gated moderation, an attributes-schema endpoint, contract-path geo aliases, a metro-stations reference endpoint, and three account-level limits.

**Architecture:** Every change lands in an existing module along the established DDD layering (`presentation → application → domain ← infrastructure`). Moderation is a config flag that redirects *where* a status transition lands, never *which* validations run — so the default-off path is byte-identical to today's behaviour. Two additive migrations.

**Tech Stack:** NestJS 10, TypeScript strict (no `any`), Prisma + PostgreSQL 16/PostGIS, Jest, class-validator, `@nestjs/config` with a zod-validated `Env`.

**Spec:** `docs/superpowers/specs/2026-08-03-discounts-business-api-gaps-design.md`

## Global Constraints

- **No `any`.** TypeScript strict mode. Every DTO field and repository signature explicitly typed.
- **`BaseResponse` envelope on every response** — produced by the global interceptor + exception filter. Never wrap manually in a controller.
- **`message` is always user-facing Uzbek**, never a log line. Validation (422) fills `error.fields` as `{ "<field>": "<uzbek message>" }`.
- **Prisma only inside `infrastructure/`.** Never in `application/` or `domain/`.
- **Never `throw new Error()`** — use `AppException` static factories: `AppException.notFound(code, message)`, `.conflict(code, message)`, `.forbidden(message?)`, `.validation(fields, message?)`, or `new AppException(code, status, message, fields?)`.
- **Controllers are thin:** route + DTO binding + guards + Swagger + one service call.
- **Files:** `kebab-case`. Classes: `PascalCase`. Constants: `UPPER_SNAKE_CASE`. DB columns: `snake_case` via `@map`.
- **Swagger on every endpoint:** `@ApiTags`, `@ApiOperation`, and the project's envelope decorators from `src/common/swagger/api-envelope.decorator` (`ApiOkEnvelope`, `ApiNotFoundEnvelope`, `ApiValidationEnvelope`, `ApiUnauthorizedEnvelope`).
- **Money is integer so'm.** `BigInt` in Prisma → `Number` in JSON. Dates are ISO-8601.
- **Test command:** `npx jest <path>` for one file, `npm test` for all.
- **Conventional Commits**, one logical change per commit.

---

## File Structure

**Task 1 — config flag**
- Modify: `src/config/env.ts` — add `MODERATION_ENABLED`.

**Task 2 — business submit**
- Modify: `src/modules/business/domain/business.repository.ts` — `setStatus`, `countByOwner`.
- Modify: `src/modules/business/infrastructure/business.prisma.repository.ts` — implement both.
- Modify: `src/modules/business/application/business.service.ts` — flag-aware `create`, new `submit`.
- Modify: `src/modules/business/presentation/business.controller.ts` — `POST :id/submit`.
- Modify: `src/modules/business/application/business.service.spec.ts`.

**Task 3 — business limit (5 per owner)**
- Modify: `src/modules/business/application/business.service.ts`, `.spec.ts`.

**Task 4 — admin business approve/reject**
- Modify: `src/modules/admin/application/admin-businesses-write.service.ts`, `.spec.ts`.
- Create: `src/modules/admin/presentation/dto/admin-reject.dto.ts`.
- Modify: `src/modules/admin/presentation/admin-businesses.controller.ts`.

**Task 5 — listing submit → PENDING_REVIEW**
- Modify: `src/modules/listings/application/listings.service.ts`, `.spec.ts`.

**Task 6 — `submittedAt` migration + daily submit quota + active-listing cap**
- Modify: `prisma/schema.prisma`; new migration directory.
- Create: `src/modules/listings/application/submit-limits.ts` + `.spec.ts`.
- Modify: `src/modules/listings/domain/listing.repository.ts`, `infrastructure/listing.prisma.repository.ts`, `application/listings.service.ts`, `.spec.ts`.

**Task 7 — re-moderation on edit**
- Create: `src/modules/listings/domain/re-moderation.ts` + `.spec.ts`.
- Modify: `src/modules/listings/application/listings.service.ts`, `.spec.ts`.

**Task 8 — admin listing approve/reject**
- Modify: `src/modules/admin/application/admin-listings-write.service.ts`, `.spec.ts`.
- Modify: `src/modules/admin/presentation/admin-listings.controller.ts`.

**Task 9 — attributes-schema endpoint**
- Modify: `src/modules/catalog/domain/catalog.repository.ts` (+ new entity file), `infrastructure/catalog.prisma.repository.ts`, `application/catalog.service.ts`, `.spec.ts`.
- Create: `src/modules/catalog/domain/entities/type-attribute-schema.entity.ts`, `src/modules/catalog/presentation/dto/attributes-schema.dto.ts`.
- Modify: `src/modules/catalog/presentation/catalog.controller.ts`.

**Task 10 — geo path aliases**
- Create: `src/modules/geo/presentation/geo-regions.controller.ts`.
- Modify: `src/modules/geo/geo.module.ts`.

**Task 11 — metro stations model + seed + endpoint**
- Modify: `prisma/schema.prisma`; new migration directory.
- Create: `prisma/data/uz-metro-stations.json`.
- Modify: `prisma/seed.ts`.
- Create: `src/modules/geo/domain/entities/metro-station.entity.ts`, `src/modules/geo/presentation/dto/metro-station.dto.ts`, `src/modules/geo/presentation/metro-stations.controller.ts`.
- Modify: `src/modules/geo/domain/geo.repository.ts`, `infrastructure/geo.prisma.repository.ts`, `infrastructure/geo.mapper.ts`, `application/geo.service.ts`, `.spec.ts`, `geo.module.ts`.

**Task 12 — `nearestMetro` in reverse-geocode**
- Modify: `src/modules/geo/application/geocoding.service.ts`, `.spec.ts`.

**Task 13 — docs**
- Create: `docs/api/mobile_questions/DISCOUNTS_BUSINESS_API_RESPONSE.md`.
- Modify: `docs/api/provider/ENDPOINTS_CHECKLIST.md`.

---

### Task 1: `MODERATION_ENABLED` config flag

**Files:**
- Modify: `src/config/env.ts:155` area (beside `CALLS_ENABLED`)
- Test: `src/config/env.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Env['MODERATION_ENABLED']` typed as `'true' | 'false'`, read by services as
  `this.config.get('MODERATION_ENABLED', { infer: true }) === 'true'` where
  `config: ConfigService<Env, true>` (import `ConfigService` from `@nestjs/config` and
  `type { Env }` from `src/config/env`).

- [ ] **Step 1: Write the failing test**

Append to `src/config/env.spec.ts` (match the file's existing `validateEnv` call style):

```ts
describe('MODERATION_ENABLED', () => {
  it('defaults to false', () => {
    const env = validateEnv({});
    expect(env.MODERATION_ENABLED).toBe('false');
  });

  it('accepts true', () => {
    const env = validateEnv({ MODERATION_ENABLED: 'true' });
    expect(env.MODERATION_ENABLED).toBe('true');
  });

  it('rejects a non-boolean string', () => {
    expect(() => validateEnv({ MODERATION_ENABLED: 'yes' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/config/env.spec.ts -t MODERATION_ENABLED`
Expected: FAIL — `env.MODERATION_ENABLED` is `undefined`.

- [ ] **Step 3: Add the flag**

In `src/config/env.ts`, immediately after the `CALLS_ENABLED` line:

```ts
    // Master switch for the moderation queue (DISCOUNTS_BUSINESS_API §6.2). While false, a created
    // business is APPROVED at once and a submitted listing publishes straight to ACTIVE — today's
    // MVP behaviour. Flipping it to true routes both through PENDING_REVIEW and an admin decision.
    // It changes only WHERE a transition lands; every publish gate runs identically either way.
    MODERATION_ENABLED: z.enum(['true', 'false']).default('false'),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/config/env.spec.ts -t MODERATION_ENABLED`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts src/config/env.spec.ts
git commit -m "feat(config): add MODERATION_ENABLED flag, default off"
```

---

### Task 2: `POST /business/{businessId}/submit`

**Files:**
- Modify: `src/modules/business/domain/business.repository.ts`
- Modify: `src/modules/business/infrastructure/business.prisma.repository.ts`
- Modify: `src/modules/business/application/business.service.ts`
- Modify: `src/modules/business/presentation/business.controller.ts`
- Test: `src/modules/business/application/business.service.spec.ts`

**Interfaces:**
- Consumes: `Env['MODERATION_ENABLED']` (Task 1).
- Produces:
  - `BusinessRepository.setStatus(id: string, status: BusinessStatus, rejectionReason: string | null): Promise<Business>`
  - `BusinessService.submit(user: AuthenticatedUser, id: string): Promise<Business>`
  - `POST /v1/business/:id/submit` → `BusinessDto`

- [ ] **Step 1: Write the failing tests**

In `src/modules/business/application/business.service.spec.ts`, extend the `makeBusinesses`
helper with the new method, then add the suite. The existing helper returns an object literal —
add this key alongside `create`/`findById`/`findManyByOwner`/`update`/`archive`:

```ts
    setStatus: jest.fn(async (id, status, rejectionReason) =>
      business({ id, status, rejectionReason }),
    ),
```

The service now takes a 4th constructor argument. Add this helper near the top of the file:

```ts
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env';

function makeConfig(moderation: 'true' | 'false'): ConfigService<Env, true> {
  return {
    get: jest.fn((key: string) => (key === 'MODERATION_ENABLED' ? moderation : undefined)),
  } as unknown as ConfigService<Env, true>;
}
```

Every existing `new BusinessService(...)` call in this file gains `makeConfig('false')` as its
final argument — the default-off path, so those tests keep asserting today's behaviour.

```ts
describe('create — moderation flag', () => {
  it('creates APPROVED when moderation is off', async () => {
    const businesses = makeBusinesses();
    const service = new BusinessService(
      businesses,
      makeOwners(),
      makeCatalog(),
      makeConfig('false'),
    );

    const created = await service.create(owner, createInput());

    expect(created.status).toBe(BusinessStatus.APPROVED);
  });

  it('creates DRAFT when moderation is on', async () => {
    const businesses = makeBusinesses();
    const service = new BusinessService(
      businesses,
      makeOwners(),
      makeCatalog(),
      makeConfig('true'),
    );

    const created = await service.create(owner, createInput());

    expect(created.status).toBe(BusinessStatus.DRAFT);
  });
});

describe('submit', () => {
  it('moves a DRAFT to PENDING_REVIEW when moderation is on', async () => {
    const businesses = makeBusinesses({
      findById: jest.fn().mockResolvedValue(business({ status: BusinessStatus.DRAFT })),
    });
    const service = new BusinessService(
      businesses,
      makeOwners(),
      makeCatalog(),
      makeConfig('true'),
    );

    const result = await service.submit(owner, 'biz-1');

    expect(businesses.setStatus).toHaveBeenCalledWith(
      'biz-1',
      BusinessStatus.PENDING_REVIEW,
      null,
    );
    expect(result.status).toBe(BusinessStatus.PENDING_REVIEW);
  });

  it('approves directly when moderation is off — the endpoint is never a dead end', async () => {
    const businesses = makeBusinesses({
      findById: jest.fn().mockResolvedValue(business({ status: BusinessStatus.DRAFT })),
    });
    const service = new BusinessService(
      businesses,
      makeOwners(),
      makeCatalog(),
      makeConfig('false'),
    );

    await service.submit(owner, 'biz-1');

    expect(businesses.setStatus).toHaveBeenCalledWith('biz-1', BusinessStatus.APPROVED, null);
  });

  it('clears a previous rejectionReason when resubmitting a REJECTED business', async () => {
    const businesses = makeBusinesses({
      findById: jest.fn().mockResolvedValue(
        business({ status: BusinessStatus.REJECTED, rejectionReason: 'POOR_IMAGE' }),
      ),
    });
    const service = new BusinessService(
      businesses,
      makeOwners(),
      makeCatalog(),
      makeConfig('true'),
    );

    await service.submit(owner, 'biz-1');

    expect(businesses.setStatus).toHaveBeenCalledWith(
      'biz-1',
      BusinessStatus.PENDING_REVIEW,
      null,
    );
  });

  it('409s on a business that is already APPROVED', async () => {
    const businesses = makeBusinesses({
      findById: jest.fn().mockResolvedValue(business({ status: BusinessStatus.APPROVED })),
    });
    const service = new BusinessService(
      businesses,
      makeOwners(),
      makeCatalog(),
      makeConfig('true'),
    );

    await expect(service.submit(owner, 'biz-1')).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_STATUS_TRANSITION,
      status: 409,
    });
  });

  it('403s on someone else’s business', async () => {
    const businesses = makeBusinesses({
      findById: jest.fn().mockResolvedValue(business({ ownerId: 'other-owner' })),
    });
    const service = new BusinessService(
      businesses,
      makeOwners(),
      makeCatalog(),
      makeConfig('true'),
    );

    await expect(service.submit(owner, 'biz-1')).rejects.toMatchObject({ status: 403 });
  });

  it('404s on an unknown id', async () => {
    const service = new BusinessService(
      makeBusinesses(),
      makeOwners(),
      makeCatalog(),
      makeConfig('true'),
    );

    await expect(service.submit(owner, 'nope')).rejects.toMatchObject({
      code: ERROR_CODE.BUSINESS_NOT_FOUND,
      status: 404,
    });
  });
});
```

> If `makeOwners` / `makeCatalog` are named differently in the file, use the existing names —
> do not rename them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/business/application/business.service.spec.ts`
Expected: FAIL — `service.submit is not a function`, and the constructor arity mismatch.

- [ ] **Step 3: Add the repository port method**

In `src/modules/business/domain/business.repository.ts`, inside `interface BusinessRepository`:

```ts
  /**
   * Sets the business's status and `rejectionReason` directly (submit / admin approve / admin
   * reject). The service decides and validates the target status; the repository only persists it.
   */
  setStatus(
    id: string,
    status: BusinessStatus,
    rejectionReason: string | null,
  ): Promise<Business>;
```

- [ ] **Step 4: Implement it in the Prisma repository**

In `src/modules/business/infrastructure/business.prisma.repository.ts`, add the method next to
`update`, following the file's existing mapper call (use whatever mapper function the neighbouring
methods use — `toBusiness` / `BusinessMapper.toDomain` — do not introduce a new one):

```ts
  async setStatus(
    id: string,
    status: BusinessStatus,
    rejectionReason: string | null,
  ): Promise<Business> {
    const row = await this.prisma.business.update({
      where: { id },
      data: { status, rejectionReason },
    });
    return toBusiness(row);
  }
```

- [ ] **Step 5: Make the service flag-aware and add `submit`**

In `src/modules/business/application/business.service.ts`:

Add the imports:

```ts
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env';
```

Add the constructor parameter:

```ts
    private readonly config: ConfigService<Env, true>,
```

Replace the `create` doc comment and the `status:` line. The comment's old
`TODO(post-MVP)` paragraph is now done, so it goes:

```ts
  /**
   * Creates a business owned by the caller. Rejects an unknown `type` (422) and — per the
   * D1 phone-verification gate — an owner whose phone is not verified (403).
   *
   * Lands on DRAFT when MODERATION_ENABLED, so the owner must call `submit`; on APPROVED
   * otherwise, which is the MVP behaviour that lets an owner publish without waiting.
   */
```

```ts
      status: this.moderationEnabled() ? BusinessStatus.DRAFT : BusinessStatus.APPROVED,
```

Add the private helper and the `submit` use-case:

```ts
  /** The moderation queue's master switch (DISCOUNTS_BUSINESS_API §6.2). */
  private moderationEnabled(): boolean {
    return this.config.get('MODERATION_ENABLED', { infer: true }) === 'true';
  }

  /**
   * Submits a business for review (§5.2). DRAFT | REJECTED → PENDING_REVIEW, clearing any previous
   * `rejectionReason` so a resubmission does not keep showing the old verdict.
   *
   * With moderation off there is no queue to enter, so it lands on APPROVED directly — otherwise
   * this endpoint would be a dead end that leaves the business permanently unable to publish.
   */
  async submit(user: AuthenticatedUser, id: string): Promise<Business> {
    const business = await this.loadOwned(user, id);
    if (
      business.status !== BusinessStatus.DRAFT &&
      business.status !== BusinessStatus.REJECTED
    ) {
      throw AppException.conflict(
        ERROR_CODE.INVALID_STATUS_TRANSITION,
        'Bu biznesni ko‘rib chiqishga yuborish mumkin emas',
      );
    }
    const target = this.moderationEnabled()
      ? BusinessStatus.PENDING_REVIEW
      : BusinessStatus.APPROVED;
    return this.businesses.setStatus(id, target, null);
  }
```

> `loadOwned` is the existing private helper used by `getById` — it already 404s an unknown or
> ARCHIVED business and 403s another owner's. Reuse it; do not re-implement those checks.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest src/modules/business/application/business.service.spec.ts`
Expected: PASS — all tests, including the pre-existing ones.

- [ ] **Step 7: Add the controller route**

In `src/modules/business/presentation/business.controller.ts`, after the `PUT :id` handler:

```ts
  @Post(':id/submit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Submit a business for review',
    description:
      'DRAFT | REJECTED → PENDING_REVIEW, clearing any previous `rejectionReason`. When ' +
      'MODERATION_ENABLED is off there is no queue, so it lands on APPROVED directly.',
  })
  @ApiParam({ name: 'id', description: 'Business id' })
  @ApiOkEnvelope(BusinessDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_NOT_FOUND,
    'No business with this id, or it is archived.',
    'Biznes topilmadi',
  )
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<BusinessDto> {
    const business = await this.businessService.submit(user, id);
    return BusinessDto.fromDomain(business);
  }
```

Add `HttpCode` and `Post` to the `@nestjs/common` import if they are not already there. Use the
file's existing names for the `@CurrentUser` decorator, `BusinessDto.fromDomain`, and the service
property — check the surrounding handlers rather than assuming.

- [ ] **Step 8: Verify it compiles and the suite is green**

Run: `npx tsc --noEmit && npx jest src/modules/business`
Expected: no type errors, tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/business src/config
git commit -m "feat(business): add POST /business/:id/submit behind MODERATION_ENABLED"
```

---

### Task 3: 5-businesses-per-owner limit

**Files:**
- Modify: `src/modules/business/domain/business.repository.ts`
- Modify: `src/modules/business/infrastructure/business.prisma.repository.ts`
- Modify: `src/modules/business/application/business.service.ts`
- Test: `src/modules/business/application/business.service.spec.ts`

**Interfaces:**
- Consumes: `BusinessService` constructor from Task 2.
- Produces: `BusinessRepository.countByOwner(ownerId: string): Promise<number>` and the exported
  constant `MAX_BUSINESSES_PER_OWNER = 5` from `business.service.ts`.

- [ ] **Step 1: Write the failing tests**

Add `countByOwner: jest.fn().mockResolvedValue(0),` to the `makeBusinesses` helper, then:

```ts
describe('create — business cap', () => {
  it('rejects the sixth business', async () => {
    const businesses = makeBusinesses({ countByOwner: jest.fn().mockResolvedValue(5) });
    const service = new BusinessService(
      businesses,
      makeOwners(),
      makeCatalog(),
      makeConfig('false'),
    );

    await expect(service.create(owner, createInput())).rejects.toMatchObject({
      code: ERROR_CODE.RATE_LIMITED,
      status: 429,
    });
    expect(businesses.create).not.toHaveBeenCalled();
  });

  it('allows the fifth', async () => {
    const businesses = makeBusinesses({ countByOwner: jest.fn().mockResolvedValue(4) });
    const service = new BusinessService(
      businesses,
      makeOwners(),
      makeCatalog(),
      makeConfig('false'),
    );

    await expect(service.create(owner, createInput())).resolves.toMatchObject({
      ownerId: 'owner-1',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/business/application/business.service.spec.ts -t "business cap"`
Expected: FAIL — the sixth resolves instead of rejecting.

- [ ] **Step 3: Add the port method**

In `src/modules/business/domain/business.repository.ts`:

```ts
  /** How many non-archived businesses this owner has (the §6.4 cap). */
  countByOwner(ownerId: string): Promise<number>;
```

- [ ] **Step 4: Implement it**

In `src/modules/business/infrastructure/business.prisma.repository.ts`:

```ts
  async countByOwner(ownerId: string): Promise<number> {
    return this.prisma.business.count({
      where: { ownerId, status: { not: BusinessStatus.ARCHIVED } },
    });
  }
```

- [ ] **Step 5: Enforce it in the service**

In `src/modules/business/application/business.service.ts`, above the class:

```ts
/** DISCOUNTS_BUSINESS_API §6.4 — "Bir foydalanuvchidagi biznes: 5". */
export const MAX_BUSINESSES_PER_OWNER = 5;
```

In `create`, after the `assertPhoneVerified` call and before `this.businesses.create`:

```ts
    if ((await this.businesses.countByOwner(user.id)) >= MAX_BUSINESSES_PER_OWNER) {
      throw new AppException(
        ERROR_CODE.RATE_LIMITED,
        429,
        `Bitta hisobda ${MAX_BUSINESSES_PER_OWNER} tadan ko‘p biznes bo‘lmaydi`,
      );
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx tsc --noEmit && npx jest src/modules/business`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/business
git commit -m "feat(business): cap owners at 5 businesses (spec §6.4)"
```

---

### Task 4: Admin business approve / reject

**Files:**
- Create: `src/modules/admin/presentation/dto/admin-reject.dto.ts`
- Modify: `src/modules/admin/application/admin-businesses-write.service.ts`
- Modify: `src/modules/admin/presentation/admin-businesses.controller.ts`
- Test: `src/modules/admin/application/admin-businesses-write.service.spec.ts`

**Interfaces:**
- Consumes: `BusinessRepository.setStatus` (Task 2).
- Produces:
  - `AdminRejectDto { reason: string }` with `toReason(): string`
  - `AdminBusinessesWriteService.approve(id: string): Promise<AdminBusiness>`
  - `AdminBusinessesWriteService.reject(id: string, reason: string): Promise<AdminBusiness>`
  - `POST /v1/admin/businesses/:id/approve` · `/reject`

- [ ] **Step 1: Write the failing tests**

In `src/modules/admin/application/admin-businesses-write.service.spec.ts`, following the mock
style already in that file:

```ts
describe('approve', () => {
  it('moves PENDING_REVIEW to APPROVED', async () => {
    const businesses = { setStatus: jest.fn().mockResolvedValue(undefined) };
    const reads = { getById: jest.fn().mockResolvedValue({ id: 'biz-1' }) };
    const service = new AdminBusinessesWriteService(
      reads as never,
      {} as never,
      businesses as never,
    );

    await service.approve('biz-1');

    expect(businesses.setStatus).toHaveBeenCalledWith('biz-1', BusinessStatus.APPROVED, null);
  });
});

describe('reject', () => {
  it('moves PENDING_REVIEW to REJECTED with the reason', async () => {
    const businesses = { setStatus: jest.fn().mockResolvedValue(undefined) };
    const reads = { getById: jest.fn().mockResolvedValue({ id: 'biz-1' }) };
    const service = new AdminBusinessesWriteService(
      reads as never,
      {} as never,
      businesses as never,
    );

    await service.reject('biz-1', 'FAKE_DISCOUNT');

    expect(businesses.setStatus).toHaveBeenCalledWith(
      'biz-1',
      BusinessStatus.REJECTED,
      'FAKE_DISCOUNT',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/admin/application/admin-businesses-write.service.spec.ts`
Expected: FAIL — `service.approve is not a function`.

- [ ] **Step 3: Add the service methods**

In `src/modules/admin/application/admin-businesses-write.service.ts`, add the repository to the
constructor and the two methods:

```ts
import { Inject } from '@nestjs/common';
import {
  BUSINESS_REPOSITORY,
  BusinessRepository,
} from '../../business/domain/business.repository';
import { BusinessStatus } from '../../business/domain/enums/business-status.enum';
```

```ts
    @Inject(BUSINESS_REPOSITORY) private readonly businessRepository: BusinessRepository,
```

```ts
  /**
   * Approves a business under review. A moderation decision, deliberately separate from
   * {@link update} — a moderator approving must not be able to silently rewrite the record.
   */
  async approve(id: string): Promise<AdminBusiness> {
    await this.businessRepository.setStatus(id, BusinessStatus.APPROVED, null);
    return this.reads.getById(id);
  }

  /** Rejects a business under review, recording the verdict the owner will see. */
  async reject(id: string, reason: string): Promise<AdminBusiness> {
    await this.businessRepository.setStatus(id, BusinessStatus.REJECTED, reason);
    return this.reads.getById(id);
  }
```

> `reads.getById` already 404s an unknown id, so it is the existence check — but it runs *after*
> the write. Call `await this.reads.getById(id)` first if the surrounding file's other methods do;
> match whichever order `update` uses.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/modules/admin/application/admin-businesses-write.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Create the reject DTO**

`src/modules/admin/presentation/dto/admin-reject.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/**
 * The verdict recorded when a moderator rejects a business or a listing. Shared by both reject
 * routes — the reason is free text so the §6.2 codes (FAKE_DISCOUNT, POOR_IMAGE, …) can be sent
 * with or without an explanatory note.
 */
export class AdminRejectDto {
  @ApiProperty({
    example: 'FAKE_DISCOUNT',
    minLength: 2,
    maxLength: 500,
    description: 'Rejection reason shown to the owner (spec §6.2)',
  })
  @IsString()
  @Length(2, 500)
  reason!: string;

  toReason(): string {
    return this.reason;
  }
}
```

- [ ] **Step 6: Add the controller routes**

In `src/modules/admin/presentation/admin-businesses.controller.ts`, after the `PUT :id` handler:

```ts
  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve a business under review (ADMIN or MODERATOR)',
    description: 'PENDING_REVIEW → APPROVED, clearing `rejectionReason`.',
  })
  @ApiParam({ name: 'id', description: 'Business id' })
  @ApiOkEnvelope(AdminBusinessDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_NOT_FOUND,
    'No business with this id.',
    'Biznes topilmadi',
  )
  async approve(@Param('id') id: string): Promise<AdminBusinessDto> {
    const business = await this.adminBusinessesWriteService.approve(id);
    return AdminBusinessDto.fromDomain(business);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reject a business under review (ADMIN or MODERATOR)',
    description: 'PENDING_REVIEW → REJECTED, recording `rejectionReason`.',
  })
  @ApiParam({ name: 'id', description: 'Business id' })
  @ApiOkEnvelope(AdminBusinessDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(
    ERROR_CODE.BUSINESS_NOT_FOUND,
    'No business with this id.',
    'Biznes topilmadi',
  )
  async reject(
    @Param('id') id: string,
    @Body() body: AdminRejectDto,
  ): Promise<AdminBusinessDto> {
    const business = await this.adminBusinessesWriteService.reject(id, body.toReason());
    return AdminBusinessDto.fromDomain(business);
  }
```

Use the file's existing `AdminBusinessDto` projection call — if it is not `fromDomain`, match it.
Ensure `Post`, `HttpCode` and `Body` are imported from `@nestjs/common`.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npx jest src/modules/admin`
Expected: no type errors, PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/admin
git commit -m "feat(admin): add business approve/reject moderation decisions"
```

---

### Task 5: Listing `submit` → `PENDING_REVIEW` when moderation is on

**Files:**
- Modify: `src/modules/listings/application/listings.service.ts:389-405`
- Test: `src/modules/listings/application/listings.service.spec.ts`

**Interfaces:**
- Consumes: `Env['MODERATION_ENABLED']` (Task 1).
- Produces: no new signatures — `ListingsService` gains a `config: ConfigService<Env, true>`
  constructor parameter and a private `moderationEnabled(): boolean`.

- [ ] **Step 1: Write the failing tests**

In `src/modules/listings/application/listings.service.spec.ts`, add the same `makeConfig` helper
used in Task 2 (import `ConfigService` and `type { Env }`), append `makeConfig('false')` to every
existing `new ListingsService(...)` call, then add:

```ts
describe('submit — moderation flag', () => {
  it('publishes straight to ACTIVE when moderation is off', async () => {
    const listings = makeListings({
      findById: jest.fn().mockResolvedValue(listing({ status: ListingStatus.DRAFT })),
    });
    const service = makeService({ listings, moderation: 'false' });

    await service.submit(owner, 'lst-1');

    expect(listings.submitTransition).toHaveBeenCalledWith(
      'lst-1',
      expect.objectContaining({ status: ListingStatus.ACTIVE }),
    );
  });

  it('stops at PENDING_REVIEW when moderation is on', async () => {
    const listings = makeListings({
      findById: jest.fn().mockResolvedValue(listing({ status: ListingStatus.DRAFT })),
    });
    const service = makeService({ listings, moderation: 'true' });

    await service.submit(owner, 'lst-1');

    expect(listings.submitTransition).toHaveBeenCalledWith(
      'lst-1',
      expect.objectContaining({ status: ListingStatus.PENDING_REVIEW }),
    );
  });

  it('still runs every publish gate when moderation is on', async () => {
    const listings = makeListings({
      findById: jest
        .fn()
        .mockResolvedValue(listing({ status: ListingStatus.DRAFT, images: [] })),
    });
    const service = makeService({ listings, moderation: 'true' });

    await expect(service.submit(owner, 'lst-1')).rejects.toMatchObject({ status: 422 });
    expect(listings.submitTransition).not.toHaveBeenCalled();
  });
});
```

> `makeService({...})` is shorthand: if the spec file has no such factory, construct the service
> inline with the file's existing mock helpers, passing `makeConfig(moderation)` last. Reuse the
> file's existing `listing()` and `makeListings()` fixtures — do not write new ones.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/modules/listings/application/listings.service.spec.ts -t "moderation flag"`
Expected: FAIL — the moderation-on case gets `ACTIVE`.

- [ ] **Step 3: Wire the flag into the service**

In `src/modules/listings/application/listings.service.ts`, add the imports and the constructor
parameter exactly as in Task 2 Step 5, plus:

```ts
  /** The moderation queue's master switch (DISCOUNTS_BUSINESS_API §6.2). */
  private moderationEnabled(): boolean {
    return this.config.get('MODERATION_ENABLED', { infer: true }) === 'true';
  }
```

Replace the `TODO(post-MVP)` comment block and the `publishedStatus` assignment (currently at
lines 389–400) with:

```ts
    // 5. Transition (persisting the branch snapshot when one was resolved).
    //
    // With moderation on the listing stops at PENDING_REVIEW and an admin decision moves it on
    // (POST /admin/listings/:id/approve). With it off a submitted listing publishes immediately,
    // exactly as businesses are auto-approved on create — otherwise the pipeline dead-ends,
    // because nothing else would ever set ACTIVE and the student feed shows only ACTIVE listings
    // (STUDENT_FEED.md Q4).
    //
    // SCHEDULED when the owner dated the listing forward — publishing must not start it early.
    // The cron promotes SCHEDULED → ACTIVE once validFrom arrives (BACKEND_PROMPT §7).
    const publishedStatus = this.moderationEnabled()
      ? ListingStatus.PENDING_REVIEW
      : listing.validFrom > new Date()
        ? ListingStatus.SCHEDULED
        : ListingStatus.ACTIVE;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsc --noEmit && npx jest src/modules/listings`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/listings
git commit -m "feat(listings): route submit through PENDING_REVIEW when moderation is on"
```

---

### Task 6: `submittedAt` + daily submit quota + active-listing cap

**Files:**
- Modify: `prisma/schema.prisma` (the `Listing` model, ~line 617)
- Create: `prisma/migrations/<timestamp>_listing_submitted_at/migration.sql` (generated)
- Create: `src/modules/listings/application/submit-limits.ts`
- Create: `src/modules/listings/application/submit-limits.spec.ts`
- Modify: `src/modules/listings/domain/listing.repository.ts`
- Modify: `src/modules/listings/infrastructure/listing.prisma.repository.ts`
- Modify: `src/modules/listings/application/listings.service.ts`
- Test: `src/modules/listings/application/listings.service.spec.ts`

**Interfaces:**
- Consumes: `ListingsService.submit` (Task 5).
- Produces:
  - `Listing.submittedAt` column, and `submittedAt: Date | null` on `SubmitTransitionData`
  - `ListingRepository.countActiveByBusiness(businessId: string): Promise<number>`
  - `ListingRepository.countSubmittedByOwnerSince(ownerId: string, since: Date): Promise<number>`
  - `assertMaySubmit(deps: SubmitLimitDeps, businessId: string, ownerId: string, now: Date): Promise<void>`
    exported from `submit-limits.ts`, plus `MAX_ACTIVE_LISTINGS_PER_BUSINESS = 100` and
    `MAX_DAILY_SUBMITS = 50`

- [ ] **Step 1: Write the failing unit tests for the limits**

Create `src/modules/listings/application/submit-limits.spec.ts`:

```ts
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  assertMaySubmit,
  MAX_ACTIVE_LISTINGS_PER_BUSINESS,
  MAX_DAILY_SUBMITS,
  type SubmitLimitDeps,
} from './submit-limits';

const NOW = new Date('2026-08-03T12:00:00Z');

function deps(active: number, submittedToday: number): SubmitLimitDeps {
  return {
    countActiveByBusiness: jest.fn().mockResolvedValue(active),
    countSubmittedByOwnerSince: jest.fn().mockResolvedValue(submittedToday),
  };
}

describe('assertMaySubmit', () => {
  it('passes below both caps', async () => {
    await expect(
      assertMaySubmit(deps(99, 49), 'biz-1', 'owner-1', NOW),
    ).resolves.toBeUndefined();
  });

  it('rejects at the active-listing cap', async () => {
    await expect(
      assertMaySubmit(deps(MAX_ACTIVE_LISTINGS_PER_BUSINESS, 0), 'biz-1', 'owner-1', NOW),
    ).rejects.toMatchObject({ code: ERROR_CODE.LISTING_LIMIT_REACHED, status: 429 });
  });

  it('rejects at the daily submit cap', async () => {
    await expect(
      assertMaySubmit(deps(0, MAX_DAILY_SUBMITS), 'biz-1', 'owner-1', NOW),
    ).rejects.toMatchObject({ code: ERROR_CODE.RATE_LIMITED, status: 429 });
  });

  it('checks the cheaper active count first — a capped business never pays for the day probe', async () => {
    const d = deps(MAX_ACTIVE_LISTINGS_PER_BUSINESS, 0);

    await expect(assertMaySubmit(d, 'biz-1', 'owner-1', NOW)).rejects.toBeDefined();

    expect(d.countSubmittedByOwnerSince).not.toHaveBeenCalled();
  });

  it('measures the daily window as the 24 hours before `now`', async () => {
    const d = deps(0, 0);

    await assertMaySubmit(d, 'biz-1', 'owner-1', NOW);

    expect(d.countSubmittedByOwnerSince).toHaveBeenCalledWith(
      'owner-1',
      new Date('2026-08-02T12:00:00Z'),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/modules/listings/application/submit-limits.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the limits module**

Create `src/modules/listings/application/submit-limits.ts`:

```ts
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';

/** DISCOUNTS_BUSINESS_API §6.4 — "Bir biznesdagi faol e'lon: 100 (ACTIVE + PENDING_REVIEW)". */
export const MAX_ACTIVE_LISTINGS_PER_BUSINESS = 100;

/** DISCOUNTS_BUSINESS_API §6.4 — "Kuniga submit: 50". */
export const MAX_DAILY_SUBMITS = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The counts these limits read. Deliberately narrower than the repository so a caller — and a
 * test — needs only what is being checked.
 */
export interface SubmitLimitDeps {
  countActiveByBusiness(businessId: string): Promise<number>;
  countSubmittedByOwnerSince(ownerId: string, since: Date): Promise<number>;
}

/**
 * The §6.4 account-level gates on publishing. Throws on the first breach and returns silently
 * otherwise.
 *
 * Checks run cheapest-first: a business already at its cap is rejected without paying for the
 * daily-window probe. `now` is injected so the window is deterministic under test.
 */
export async function assertMaySubmit(
  deps: SubmitLimitDeps,
  businessId: string,
  ownerId: string,
  now: Date,
): Promise<void> {
  const activeCount = await deps.countActiveByBusiness(businessId);
  if (activeCount >= MAX_ACTIVE_LISTINGS_PER_BUSINESS) {
    throw new AppException(
      ERROR_CODE.LISTING_LIMIT_REACHED,
      429,
      `Bitta biznesda ${MAX_ACTIVE_LISTINGS_PER_BUSINESS} tadan ko‘p faol e’lon bo‘lmaydi`,
    );
  }

  const submittedToday = await deps.countSubmittedByOwnerSince(
    ownerId,
    new Date(now.getTime() - DAY_MS),
  );
  if (submittedToday >= MAX_DAILY_SUBMITS) {
    throw new AppException(
      ERROR_CODE.RATE_LIMITED,
      429,
      `Kuniga ${MAX_DAILY_SUBMITS} tadan ko‘p e’lon yuborolmaysiz`,
    );
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/modules/listings/application/submit-limits.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit the pure module**

```bash
git add src/modules/listings/application/submit-limits.ts src/modules/listings/application/submit-limits.spec.ts
git commit -m "feat(listings): add §6.4 submit limit helpers"
```

- [ ] **Step 6: Add the schema column**

In `prisma/schema.prisma`, inside `model Listing`, next to the other timestamps:

```prisma
  /// When the owner last submitted this listing for review. Drives the §6.4 daily submit quota and
  /// orders the moderation queue oldest-first (§6.2 24h SLA). Null = never submitted.
  submittedAt DateTime? @map("submitted_at")
```

Add the index that the daily-quota count uses — in the model's index block:

```prisma
  @@index([submittedAt])
```

- [ ] **Step 7: Generate and inspect the migration**

Run: `npx prisma migrate dev --name listing_submitted_at --create-only`

Then **read** `prisma/migrations/<timestamp>_listing_submitted_at/migration.sql`. Confirm it is
exactly an additive `ALTER TABLE ... ADD COLUMN "submitted_at" TIMESTAMP(3)` plus a
`CREATE INDEX`, with no `DROP`, no `NOT NULL` without a default, and no table rewrite. If it
contains anything else, stop and report it rather than applying.

Then: `npx prisma migrate dev && npx prisma generate`

- [ ] **Step 8: Add the two repository counts**

In `src/modules/listings/domain/listing.repository.ts`, add `submittedAt` to
`SubmitTransitionData`:

```ts
export interface SubmitTransitionData {
  branchIds?: string[];
  status: ListingStatus;
  /** Stamped on every submit — the §6.4 daily quota counts these and §6.2 orders the queue by them. */
  submittedAt: Date;
}
```

And to `interface ListingRepository`:

```ts
  /** Listings of this business that occupy an active slot: ACTIVE + PENDING_REVIEW (§6.4). */
  countActiveByBusiness(businessId: string): Promise<number>;

  /** How many of this owner's listings were submitted at or after `since` (§6.4 daily quota). */
  countSubmittedByOwnerSince(ownerId: string, since: Date): Promise<number>;
```

- [ ] **Step 9: Implement them**

In `src/modules/listings/infrastructure/listing.prisma.repository.ts`:

```ts
  async countActiveByBusiness(businessId: string): Promise<number> {
    return this.prisma.listing.count({
      where: {
        businessId,
        status: { in: [ListingStatus.ACTIVE, ListingStatus.PENDING_REVIEW] },
      },
    });
  }

  async countSubmittedByOwnerSince(ownerId: string, since: Date): Promise<number> {
    return this.prisma.listing.count({
      where: { business: { ownerId }, submittedAt: { gte: since } },
    });
  }
```

> Check the `Listing` model's relation field name for the business — if it is not `business`,
> use the actual name.

Also extend the existing `submitTransition` `data:` object with `submittedAt: data.submittedAt`.

- [ ] **Step 10: Write the failing service test**

In `src/modules/listings/application/listings.service.spec.ts`, add both counts to
`makeListings` (`countActiveByBusiness: jest.fn().mockResolvedValue(0)`,
`countSubmittedByOwnerSince: jest.fn().mockResolvedValue(0)`), then:

```ts
describe('submit — §6.4 limits', () => {
  it('rejects when the business is at its active-listing cap', async () => {
    const listings = makeListings({
      findById: jest.fn().mockResolvedValue(listing({ status: ListingStatus.DRAFT })),
      countActiveByBusiness: jest.fn().mockResolvedValue(100),
    });
    const service = makeService({ listings, moderation: 'false' });

    await expect(service.submit(owner, 'lst-1')).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_LIMIT_REACHED,
      status: 429,
    });
    expect(listings.submitTransition).not.toHaveBeenCalled();
  });

  it('stamps submittedAt on a successful submit', async () => {
    const listings = makeListings({
      findById: jest.fn().mockResolvedValue(listing({ status: ListingStatus.DRAFT })),
    });
    const service = makeService({ listings, moderation: 'false' });

    await service.submit(owner, 'lst-1');

    expect(listings.submitTransition).toHaveBeenCalledWith(
      'lst-1',
      expect.objectContaining({ submittedAt: expect.any(Date) }),
    );
  });
});
```

- [ ] **Step 11: Run to verify it fails**

Run: `npx jest src/modules/listings/application/listings.service.spec.ts -t "§6.4 limits"`
Expected: FAIL — no cap enforced, no `submittedAt`.

- [ ] **Step 12: Call the limits from `submit`**

In `src/modules/listings/application/listings.service.ts`, import:

```ts
import { assertMaySubmit } from './submit-limits';
```

In `submit`, immediately after gate 4.7 (`validateAttributes(...)`) and before the transition:

```ts
    // 4.8 §6.4 account-level caps — checked last, after everything free has already passed.
    const now = new Date();
    await assertMaySubmit(this.listings, listing.businessId, summary.ownerId, now);
```

And pass the stamp into the transition:

```ts
    return this.listings.submitTransition(listingId, {
      branchIds: branchSnapshot,
      status: publishedStatus,
      submittedAt: now,
    });
```

> If the existing call passes additional keys, keep them — only add `submittedAt`.

- [ ] **Step 13: Verify**

Run: `npx tsc --noEmit && npx jest src/modules/listings`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add prisma src/modules/listings
git commit -m "feat(listings): stamp submittedAt and enforce §6.4 submit caps"
```

---

### Task 7: Re-moderation when an `ACTIVE` listing is edited

**Files:**
- Create: `src/modules/listings/domain/re-moderation.ts`
- Create: `src/modules/listings/domain/re-moderation.spec.ts`
- Modify: `src/modules/listings/application/listings.service.ts`
- Test: `src/modules/listings/application/listings.service.spec.ts`

**Interfaces:**
- Consumes: `Listing` entity, `UpdateListingInput` (`listings.io.ts`), `ListingRepository.setStatus`.
- Produces: `requiresReModeration(stored: Listing, incoming: UpdateListingInput): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/modules/listings/domain/re-moderation.spec.ts`. Build the fixtures from the module's
own types so the compiler catches drift:

```ts
import { PriceUnit } from '../../catalog/domain/enums/price-unit.enum';
import type { UpdateListingInput } from '../application/listings.io';
import type { Listing } from './entities/listing.entity';
import { DiscountType } from './enums/discount-type.enum';
import { RedemptionMethod } from './enums/redemption-method.enum';
import { requiresReModeration } from './re-moderation';

/**
 * A stored listing and the edit that changes nothing about it. Every test mutates one field of the
 * incoming copy, so the fixtures must start identical.
 */
function stored(overrides: Partial<Listing> = {}): Listing {
  return {
    categoryKey: 'PIZZA',
    customCategoryName: null,
    title: 'Pepperoni pitsa',
    description: 'Mozzarella, pepperoni.',
    images: ['https://cdn/1.webp', 'https://cdn/2.webp'],
    priceUnit: PriceUnit.PER_ITEM,
    originalPrice: 55000,
    discount: {
      type: DiscountType.PERCENT,
      value: 20,
      finalPrice: 44000,
      conditions: 'Talaba ID bilan',
      appliesToOptions: false,
    },
    ...overrides,
  } as Listing;
}

function incoming(overrides: Partial<UpdateListingInput> = {}): UpdateListingInput {
  return {
    branchIds: ['br-1'],
    categoryKey: 'PIZZA',
    customCategoryName: null,
    title: 'Pepperoni pitsa',
    description: 'Mozzarella, pepperoni.',
    images: ['https://cdn/1.webp', 'https://cdn/2.webp'],
    priceUnit: PriceUnit.PER_ITEM,
    originalPrice: 55000,
    discount: {
      type: DiscountType.PERCENT,
      value: 20,
      conditions: 'Talaba ID bilan',
      appliesToOptions: false,
    },
    redemption: {
      method: RedemptionMethod.QR,
      promoCode: null,
      url: null,
      perUserLimit: 1,
      perUserPeriod: null,
      totalLimit: 200,
    },
    validFrom: new Date('2026-08-01T00:00:00Z'),
    validTo: new Date('2026-09-01T00:00:00Z'),
    attributes: { portionGrams: '550' },
    optionGroups: [],
    ...overrides,
  } as UpdateListingInput;
}

describe('requiresReModeration', () => {
  it('is false for an identical edit', () => {
    expect(requiresReModeration(stored(), incoming())).toBe(false);
  });

  it.each([
    ['title', { title: 'Margarita pitsa' }],
    ['description', { description: 'Boshqa tavsif' }],
    ['originalPrice', { originalPrice: 60000 }],
    ['categoryKey', { categoryKey: 'BURGER' }],
  ])('is true when %s changes', (_field, override) => {
    expect(requiresReModeration(stored(), incoming(override))).toBe(true);
  });

  it('is true when an image is replaced', () => {
    expect(
      requiresReModeration(stored(), incoming({ images: ['https://cdn/9.webp', 'https://cdn/2.webp'] })),
    ).toBe(true);
  });

  it('is true when the image order changes — the first image is the cover', () => {
    expect(
      requiresReModeration(stored(), incoming({ images: ['https://cdn/2.webp', 'https://cdn/1.webp'] })),
    ).toBe(true);
  });

  it('is true when an image is removed', () => {
    expect(requiresReModeration(stored(), incoming({ images: ['https://cdn/1.webp'] }))).toBe(true);
  });

  it.each([
    ['discount type', { type: DiscountType.FIXED_AMOUNT, value: 20, conditions: 'Talaba ID bilan', appliesToOptions: false }],
    ['discount value', { type: DiscountType.PERCENT, value: 30, conditions: 'Talaba ID bilan', appliesToOptions: false }],
    ['discount conditions', { type: DiscountType.PERCENT, value: 20, conditions: 'Boshqa shart', appliesToOptions: false }],
  ])('is true when %s changes', (_field, discount) => {
    expect(requiresReModeration(stored(), incoming({ discount }))).toBe(true);
  });

  it('is false when only the §6.3 exempt fields change, all at once', () => {
    const exemptEdit = incoming({
      branchIds: ['br-2', 'br-3'],
      validTo: new Date('2027-01-01T00:00:00Z'),
      redemption: {
        method: RedemptionMethod.QR,
        promoCode: null,
        url: null,
        perUserLimit: 1,
        perUserPeriod: null,
        totalLimit: 500,
      },
      attributes: { portionGrams: '550', stockCount: '3', seatsLeft: '2' },
      optionGroups: [],
    });

    expect(requiresReModeration(stored(), exemptEdit)).toBe(false);
  });
});
```

> `Listing` has more fields than the fixture sets; the `as Listing` cast is deliberate and
> confined to the test, because the function reads only the material subset. Keep the cast in the
> test file only — never in `src` production code.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/modules/listings/domain/re-moderation.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pure function**

Create `src/modules/listings/domain/re-moderation.ts`:

```ts
import type { UpdateListingInput } from '../application/listings.io';
import type { Listing } from './entities/listing.entity';

/**
 * Whether an edit to a published listing needs a moderator to look at it again
 * (DISCOUNTS_BUSINESS_API §6.3).
 *
 * True when any field a moderator actually judged has changed: what the offer says, what it shows,
 * what it costs, and where it sits in the catalog. Everything else — which branches carry it, how
 * long it runs, how many are left — is inventory the owner manages without review, so a change
 * confined to those fields is simply not a material change and needs no exempt-list of its own.
 *
 * `finalPrice` is not compared: it is derived server-side from `discount` + `originalPrice`, both
 * of which are compared here, so it cannot differ on its own.
 */
export function requiresReModeration(stored: Listing, incoming: UpdateListingInput): boolean {
  return (
    stored.title !== incoming.title ||
    stored.description !== incoming.description ||
    stored.originalPrice !== incoming.originalPrice ||
    stored.categoryKey !== incoming.categoryKey ||
    !sameImages(stored.images, incoming.images) ||
    stored.discount.type !== incoming.discount.type ||
    stored.discount.value !== incoming.discount.value ||
    stored.discount.conditions !== incoming.discount.conditions
  );
}

/** Order matters — the first image is the cover, so a reorder is a change a moderator should see. */
function sameImages(stored: string[], incoming: string[]): boolean {
  return (
    stored.length === incoming.length && stored.every((url, index) => url === incoming[index])
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/modules/listings/domain/re-moderation.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit the pure function**

```bash
git add src/modules/listings/domain/re-moderation.ts src/modules/listings/domain/re-moderation.spec.ts
git commit -m "feat(listings): add requiresReModeration for §6.3"
```

- [ ] **Step 6: Write the failing service test**

In `src/modules/listings/application/listings.service.spec.ts`:

```ts
describe('update — §6.3 re-moderation', () => {
  it('sends an ACTIVE listing back to PENDING_REVIEW when the title changes', async () => {
    const listings = makeListings({
      findById: jest.fn().mockResolvedValue(
        listing({ status: ListingStatus.ACTIVE, title: 'Eski sarlavha' }),
      ),
    });
    const service = makeService({ listings, moderation: 'true' });

    await service.update(owner, 'lst-1', updateInput({ title: 'Yangi sarlavha' }));

    expect(listings.setStatus).toHaveBeenCalledWith('lst-1', ListingStatus.PENDING_REVIEW);
  });

  it('leaves an ACTIVE listing active when only validTo is extended', async () => {
    const listings = makeListings({
      findById: jest.fn().mockResolvedValue(listing({ status: ListingStatus.ACTIVE })),
    });
    const service = makeService({ listings, moderation: 'true' });

    await service.update(
      owner,
      'lst-1',
      updateInput({ validTo: new Date('2027-01-01T00:00:00Z') }),
    );

    expect(listings.setStatus).not.toHaveBeenCalled();
  });

  it('does not re-moderate when the flag is off', async () => {
    const listings = makeListings({
      findById: jest.fn().mockResolvedValue(
        listing({ status: ListingStatus.ACTIVE, title: 'Eski sarlavha' }),
      ),
    });
    const service = makeService({ listings, moderation: 'false' });

    await service.update(owner, 'lst-1', updateInput({ title: 'Yangi sarlavha' }));

    expect(listings.setStatus).not.toHaveBeenCalled();
  });

  it('does not touch the status of a DRAFT edit', async () => {
    const listings = makeListings({
      findById: jest.fn().mockResolvedValue(
        listing({ status: ListingStatus.DRAFT, title: 'Eski sarlavha' }),
      ),
    });
    const service = makeService({ listings, moderation: 'true' });

    await service.update(owner, 'lst-1', updateInput({ title: 'Yangi sarlavha' }));

    expect(listings.setStatus).not.toHaveBeenCalled();
  });
});
```

> `updateInput(...)` is the spec file's existing update fixture — reuse it. If it does not exist,
> add one mirroring the `incoming()` fixture from Step 1.

- [ ] **Step 7: Run to verify it fails**

Run: `npx jest src/modules/listings/application/listings.service.spec.ts -t "re-moderation"`
Expected: FAIL — `setStatus` never called.

- [ ] **Step 8: Apply it in `update`**

In `src/modules/listings/application/listings.service.ts`, import:

```ts
import { requiresReModeration } from '../domain/re-moderation';
```

In `update`, after the repository `update` call and before returning, capture the stored listing
from before the write (the method already loads it for the ownership check — reuse that variable,
do not re-fetch):

```ts
    // §6.3 — an edit to what a moderator judged sends the listing back to the queue. Only from
    // ACTIVE: a DRAFT has not been reviewed yet, and PAUSED/EXPIRED are not publicly visible.
    if (
      this.moderationEnabled() &&
      listing.status === ListingStatus.ACTIVE &&
      requiresReModeration(listing, input)
    ) {
      return this.listings.setStatus(listingId, ListingStatus.PENDING_REVIEW);
    }
    return updated;
```

> Match the actual local variable names in the method (`listing` for the pre-edit aggregate,
> `updated` for the repository result). If `update` currently returns the repository call
> directly, assign it to `const updated` first.

- [ ] **Step 9: Verify**

Run: `npx tsc --noEmit && npx jest src/modules/listings`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/modules/listings
git commit -m "feat(listings): re-moderate an ACTIVE listing on a material edit (§6.3)"
```

---

### Task 8: Admin listing approve / reject

**Files:**
- Modify: `src/modules/admin/application/admin-listings-write.service.ts`
- Modify: `src/modules/admin/presentation/admin-listings.controller.ts`
- Test: `src/modules/admin/application/admin-listings-write.service.spec.ts`

**Interfaces:**
- Consumes: `AdminRejectDto` (Task 4), `ListingRepository.setStatus`, `requiresReModeration` not needed.
- Produces:
  - `AdminListingsWriteService.approve(id: string): Promise<AdminListing>`
  - `AdminListingsWriteService.reject(id: string, reason: string): Promise<AdminListing>`
  - `POST /v1/admin/listings/:id/approve` · `/reject`

- [ ] **Step 1: Write the failing tests**

In `src/modules/admin/application/admin-listings-write.service.spec.ts`:

```ts
/**
 * A listing repository stub. `setRejection` — not `setStatus` — carries both approve and reject:
 * approving must clear any previous `rejectionReason`, or the owner keeps seeing the old verdict
 * on a listing that is now live.
 */
function makeListingRepository(
  listing: { id: string; status: ListingStatus; validFrom: Date } | null,
) {
  return {
    findById: jest.fn().mockResolvedValue(listing),
    setRejection: jest.fn().mockResolvedValue(undefined),
  };
}

const underReview = {
  id: 'lst-1',
  status: ListingStatus.PENDING_REVIEW,
  validFrom: new Date('2026-07-01T00:00:00Z'),
};

describe('approve', () => {
  it('activates a listing whose window is already open', async () => {
    const repository = makeListingRepository(underReview);
    const reads = { getById: jest.fn().mockResolvedValue({ id: 'lst-1' }) };
    const service = new AdminListingsWriteService(
      reads as never,
      {} as never,
      repository as never,
    );

    await service.approve('lst-1');

    expect(repository.setRejection).toHaveBeenCalledWith('lst-1', ListingStatus.ACTIVE, null);
  });

  it('schedules a listing dated forward instead of starting it early', async () => {
    const repository = makeListingRepository({
      ...underReview,
      validFrom: new Date('2099-01-01T00:00:00Z'),
    });
    const reads = { getById: jest.fn().mockResolvedValue({ id: 'lst-1' }) };
    const service = new AdminListingsWriteService(
      reads as never,
      {} as never,
      repository as never,
    );

    await service.approve('lst-1');

    expect(repository.setRejection).toHaveBeenCalledWith('lst-1', ListingStatus.SCHEDULED, null);
  });

  it('409s a listing that is not under review', async () => {
    const repository = makeListingRepository({ ...underReview, status: ListingStatus.DRAFT });
    const service = new AdminListingsWriteService(
      { getById: jest.fn() } as never,
      {} as never,
      repository as never,
    );

    await expect(service.approve('lst-1')).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_STATUS_TRANSITION,
      status: 409,
    });
    expect(repository.setRejection).not.toHaveBeenCalled();
  });

  it('404s an unknown id', async () => {
    const repository = makeListingRepository(null);
    const service = new AdminListingsWriteService(
      { getById: jest.fn() } as never,
      {} as never,
      repository as never,
    );

    await expect(service.approve('nope')).rejects.toMatchObject({
      code: ERROR_CODE.LISTING_NOT_FOUND,
      status: 404,
    });
  });
});

describe('reject', () => {
  it('rejects a listing under review with its reason', async () => {
    const repository = makeListingRepository(underReview);
    const reads = { getById: jest.fn().mockResolvedValue({ id: 'lst-1' }) };
    const service = new AdminListingsWriteService(
      reads as never,
      {} as never,
      repository as never,
    );

    await service.reject('lst-1', 'POOR_IMAGE');

    expect(repository.setRejection).toHaveBeenCalledWith(
      'lst-1',
      ListingStatus.REJECTED,
      'POOR_IMAGE',
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/modules/admin/application/admin-listings-write.service.spec.ts`
Expected: FAIL — `service.approve is not a function`.

- [ ] **Step 3: Add a rejection-recording repository method**

`ListingRepository.setStatus(id, status)` cannot record a reason, so add one. In
`src/modules/listings/domain/listing.repository.ts`:

```ts
  /**
   * Sets the listing's status together with a `rejectionReason` (the moderator's verdict). Separate
   * from {@link setStatus} because every other transition must leave the stored reason alone.
   */
  setRejection(id: string, status: ListingStatus, rejectionReason: string | null): Promise<Listing>;
```

In `src/modules/listings/infrastructure/listing.prisma.repository.ts`, beside `setStatus` and
using the same mapper the neighbouring methods use:

```ts
  async setRejection(
    id: string,
    status: ListingStatus,
    rejectionReason: string | null,
  ): Promise<Listing> {
    await this.prisma.listing.update({ where: { id }, data: { status, rejectionReason } });
    return this.findByIdOrThrow(id);
  }
```

> If the file has no `findByIdOrThrow`, mirror exactly what `setStatus` does to return the
> aggregate.

- [ ] **Step 4: Add the service methods**

In `src/modules/admin/application/admin-listings-write.service.ts`:

```ts
import { Inject } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  LISTING_REPOSITORY,
  ListingRepository,
} from '../../listings/domain/listing.repository';
import { ListingStatus } from '../../listings/domain/enums/listing-status.enum';
```

```ts
    @Inject(LISTING_REPOSITORY) private readonly listingRepository: ListingRepository,
```

```ts
  /**
   * Approves a listing under review. Lands on SCHEDULED when the owner dated it forward — approval
   * must not start an offer early; the cron promotes it when `validFrom` arrives.
   */
  async approve(id: string): Promise<AdminListing> {
    const listing = await this.loadUnderReview(id);
    const target =
      listing.validFrom > new Date() ? ListingStatus.SCHEDULED : ListingStatus.ACTIVE;
    await this.listingRepository.setRejection(id, target, null);
    return this.reads.getById(id);
  }

  /** Rejects a listing under review, recording the verdict the owner will see. */
  async reject(id: string, reason: string): Promise<AdminListing> {
    await this.loadUnderReview(id);
    await this.listingRepository.setRejection(id, ListingStatus.REJECTED, reason);
    return this.reads.getById(id);
  }

  /** 404s an unknown listing, 409s one that is not awaiting a decision. */
  private async loadUnderReview(id: string): Promise<Listing> {
    const listing = await this.listingRepository.findById(id);
    if (listing === null) {
      throw AppException.notFound(ERROR_CODE.LISTING_NOT_FOUND, 'E’lon topilmadi');
    }
    if (listing.status !== ListingStatus.PENDING_REVIEW) {
      throw AppException.conflict(
        ERROR_CODE.INVALID_STATUS_TRANSITION,
        'Bu e’lon ko‘rib chiqilmoqda emas',
      );
    }
    return listing;
  }
```

Import `type { Listing }` from `../../listings/domain/entities/listing.entity`.

> `approve` uses `setRejection(..., null)` rather than `setStatus` deliberately: approving must
> clear a previous rejection reason, or the owner keeps seeing the old verdict on a live listing.

- [ ] **Step 5: Run to verify it passes**

Run: `npx jest src/modules/admin/application/admin-listings-write.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Add the controller routes**

In `src/modules/admin/presentation/admin-listings.controller.ts`, after `PUT :id`:

```ts
  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve a listing under review (ADMIN or MODERATOR)',
    description:
      'PENDING_REVIEW → ACTIVE, or SCHEDULED when `validFrom` is still in the future. Clears ' +
      '`rejectionReason`.',
  })
  @ApiParam({ name: 'id', description: 'Listing id' })
  @ApiOkEnvelope(AdminListingDto)
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  async approve(@Param('id') id: string): Promise<AdminListingDto> {
    const listing = await this.adminListingsWriteService.approve(id);
    return AdminListingDto.fromDomain(listing);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reject a listing under review (ADMIN or MODERATOR)',
    description: 'PENDING_REVIEW → REJECTED, recording `rejectionReason` (spec §6.2).',
  })
  @ApiParam({ name: 'id', description: 'Listing id' })
  @ApiOkEnvelope(AdminListingDto)
  @ApiValidationEnvelope()
  @ApiNotFoundEnvelope(ERROR_CODE.LISTING_NOT_FOUND, 'No listing with this id.', 'E’lon topilmadi')
  async reject(
    @Param('id') id: string,
    @Body() body: AdminRejectDto,
  ): Promise<AdminListingDto> {
    const listing = await this.adminListingsWriteService.reject(id, body.toReason());
    return AdminListingDto.fromDomain(listing);
  }
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npx jest src/modules/admin src/modules/listings`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/admin src/modules/listings
git commit -m "feat(admin): add listing approve/reject moderation decisions"
```

---

### Task 9: `GET /business/types/{type}/attributes-schema`

**Files:**
- Create: `src/modules/catalog/domain/entities/type-attribute-schema.entity.ts`
- Create: `src/modules/catalog/presentation/dto/attributes-schema.dto.ts`
- Modify: `src/modules/catalog/domain/catalog.repository.ts`
- Modify: `src/modules/catalog/infrastructure/catalog.prisma.repository.ts`
- Modify: `src/modules/catalog/application/catalog.service.ts`
- Modify: `src/modules/catalog/presentation/catalog.controller.ts`
- Test: `src/modules/catalog/application/catalog.service.spec.ts`

**Interfaces:**
- Consumes: `AttributeField` (`catalog/domain/entities/category.entity.ts`), `AttributeFieldDto`.
- Produces:
  - `TypeAttributeSchema { businessType: string; common: AttributeField[]; byCategory: CategoryAttributeFields[] }`
  - `CategoryAttributeFields { categoryKey: string; fields: AttributeField[] }`
  - `CatalogRepository.findTypeAttributeSchema(businessType: string): Promise<TypeAttributeSchema | null>`
  - `CatalogService.getAttributesSchema(type: string): Promise<TypeAttributeSchema>`
  - `GET /v1/business/types/:type/attributes-schema` → `AttributesSchemaDto`

- [ ] **Step 1: Create the domain entity**

`src/modules/catalog/domain/entities/type-attribute-schema.entity.ts`:

```ts
import { AttributeField } from './category.entity';

/** The form fields that apply only when one specific category is selected. */
export interface CategoryAttributeFields {
  categoryKey: string;
  fields: AttributeField[];
}

/**
 * Every attribute field defined for a business type, split the way the catalog stores it: the
 * type-level fields that apply to any of its listings, and the category-level ones keyed by
 * category.
 *
 * This is what `GET /business/types/{type}/attributes-schema` serves. The request document asks
 * for JSON Schema; we serve {@link AttributeField} instead, because that is the vocabulary
 * `GET /business/types/{type}/categories` already returns and the client's dynamic form already
 * parses. Two encodings of one concept would mean two parsers.
 */
export interface TypeAttributeSchema {
  businessType: string;
  common: AttributeField[];
  byCategory: CategoryAttributeFields[];
}
```

- [ ] **Step 2: Write the failing service test**

In `src/modules/catalog/application/catalog.service.spec.ts`, add
`findTypeAttributeSchema: jest.fn().mockResolvedValue(null),` to the repository mock helper, then:

```ts
describe('getAttributesSchema', () => {
  it('returns the schema for a known type', async () => {
    const schema = {
      businessType: 'PLAYSTATION',
      common: [{ key: 'hallType', label: 'Zal turi' }],
      byCategory: [{ categoryKey: 'PS5', fields: [{ key: 'deviceModel', label: 'Model' }] }],
    };
    const service = new CatalogService(
      makeCatalog({ findTypeAttributeSchema: jest.fn().mockResolvedValue(schema) }),
    );

    await expect(service.getAttributesSchema('PLAYSTATION')).resolves.toBe(schema);
  });

  it('404s an unknown type', async () => {
    const service = new CatalogService(
      makeCatalog({ findTypeAttributeSchema: jest.fn().mockResolvedValue(null) }),
    );

    await expect(service.getAttributesSchema('NOPE')).rejects.toMatchObject({
      code: ERROR_CODE.NOT_FOUND,
      status: 404,
    });
  });
});
```

> Use the spec file's existing repository-mock factory name and `CatalogService` constructor
> arity — check the file rather than assuming it takes one argument.

- [ ] **Step 3: Run to verify it fails**

Run: `npx jest src/modules/catalog/application/catalog.service.spec.ts -t getAttributesSchema`
Expected: FAIL — `service.getAttributesSchema is not a function`.

- [ ] **Step 4: Add the port method**

In `src/modules/catalog/domain/catalog.repository.ts`, add the import and the method:

```ts
import { TypeAttributeSchema } from './entities/type-attribute-schema.entity';
```

```ts
  /**
   * Every attribute spec for a business type, split into type-level (`categoryKey IS NULL`) and
   * category-level groups, each ordered by `sortOrder`. Returns `null` when the type does not
   * exist — distinguishing "unknown type" (404) from "type with no attributes" (empty lists).
   */
  findTypeAttributeSchema(businessType: string): Promise<TypeAttributeSchema | null>;
```

- [ ] **Step 5: Implement it**

In `src/modules/catalog/infrastructure/catalog.prisma.repository.ts`. Reuse the file's existing
row→`AttributeField` mapper (the one `findCategoriesByType` uses — likely `toAttributeField` in
`catalog.mapper.ts`); do not write a second one:

```ts
  async findTypeAttributeSchema(businessType: string): Promise<TypeAttributeSchema | null> {
    const type = await this.prisma.businessTypeInfo.findUnique({
      where: { type: businessType },
      select: { type: true },
    });
    if (type === null) {
      return null;
    }
    const rows = await this.prisma.attributeSpec.findMany({
      where: { businessType },
      orderBy: [{ categoryKey: 'asc' }, { sortOrder: 'asc' }],
    });

    const common: AttributeField[] = [];
    const byCategoryKey = new Map<string, AttributeField[]>();
    for (const row of rows) {
      const field = toAttributeField(row);
      if (row.categoryKey === null) {
        common.push(field);
        continue;
      }
      const bucket = byCategoryKey.get(row.categoryKey);
      if (bucket === undefined) {
        byCategoryKey.set(row.categoryKey, [field]);
      } else {
        bucket.push(field);
      }
    }

    return {
      businessType,
      common,
      byCategory: [...byCategoryKey].map(([categoryKey, fields]) => ({ categoryKey, fields })),
    };
  }
```

- [ ] **Step 6: Add the service use-case**

In `src/modules/catalog/application/catalog.service.ts`:

```ts
  /**
   * Every attribute field defined for a business type — the dynamic form's schema (§5.1). Unknown
   * type → 404, matching {@link getCategories}.
   */
  async getAttributesSchema(type: string): Promise<TypeAttributeSchema> {
    const schema = await this.catalogRepository.findTypeAttributeSchema(type);
    if (schema === null) {
      throw AppException.notFound(ERROR_CODE.NOT_FOUND, 'Biznes turi topilmadi');
    }
    return schema;
  }
```

Use the file's actual repository property name and add any missing imports
(`AppException`, `ERROR_CODE`, `TypeAttributeSchema`).

- [ ] **Step 7: Run to verify it passes**

Run: `npx jest src/modules/catalog/application/catalog.service.spec.ts`
Expected: PASS.

- [ ] **Step 8: Create the response DTOs**

`src/modules/catalog/presentation/dto/attributes-schema.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import {
  CategoryAttributeFields,
  TypeAttributeSchema,
} from '../../domain/entities/type-attribute-schema.entity';
import { AttributeFieldDto } from './attribute-field.dto';

/** The fields shown only when one specific category is selected. */
export class CategoryAttributeFieldsDto {
  @ApiProperty({ example: 'PS5' })
  categoryKey!: string;

  @ApiProperty({ type: () => [AttributeFieldDto] })
  fields!: AttributeFieldDto[];

  static fromDomain(group: CategoryAttributeFields): CategoryAttributeFieldsDto {
    const dto = new CategoryAttributeFieldsDto();
    dto.categoryKey = group.categoryKey;
    dto.fields = group.fields.map(AttributeFieldDto.fromDomain);
    return dto;
  }
}

/**
 * AttributesSchemaDto — every attribute field of a business type, so the client can build the
 * listing form without hardcoding it. `common` applies to any listing of the type; `byCategory`
 * adds the fields for the selected category.
 */
export class AttributesSchemaDto {
  @ApiProperty({ example: 'PLAYSTATION' })
  businessType!: string;

  @ApiProperty({
    type: () => [AttributeFieldDto],
    description: 'Fields that apply to every listing of this business type',
  })
  common!: AttributeFieldDto[];

  @ApiProperty({
    type: () => [CategoryAttributeFieldsDto],
    description: 'Additional fields per category, merged with `common` once one is selected',
  })
  byCategory!: CategoryAttributeFieldsDto[];

  static fromDomain(schema: TypeAttributeSchema): AttributesSchemaDto {
    const dto = new AttributesSchemaDto();
    dto.businessType = schema.businessType;
    dto.common = schema.common.map(AttributeFieldDto.fromDomain);
    dto.byCategory = schema.byCategory.map(CategoryAttributeFieldsDto.fromDomain);
    return dto;
  }
}
```

- [ ] **Step 9: Add the controller route**

In `src/modules/catalog/presentation/catalog.controller.ts`, after `@Get(':type/categories')`:

```ts
  @Get(':type/attributes-schema')
  @ApiOperation({
    summary: 'Attribute schema for a business type',
    description:
      'Every attribute field defined for the type, so the client builds the listing form ' +
      'dynamically. `common` applies to all its listings; `byCategory` adds the selected ' +
      'category’s fields. Same `AttributeFieldDto` vocabulary as the categories endpoint.',
  })
  @ApiParam({ name: 'type', description: 'Business type key', example: 'PLAYSTATION' })
  @ApiOkEnvelope(AttributesSchemaDto)
  @ApiNotFoundEnvelope(
    ERROR_CODE.NOT_FOUND,
    'No business type with this key.',
    'Biznes turi topilmadi',
  )
  async getAttributesSchema(@Param('type') type: string): Promise<AttributesSchemaDto> {
    const schema = await this.catalogService.getAttributesSchema(type);
    return AttributesSchemaDto.fromDomain(schema);
  }
```

- [ ] **Step 10: Verify against a real request**

Run: `npx tsc --noEmit && npx jest src/modules/catalog`
Expected: PASS.

Then boot the app (`npm run start:dev`) and confirm the shape:

```bash
curl -s localhost:3000/v1/business/types/PLAYSTATION/attributes-schema | head -c 400
```

Expected: `{"success":true,"status":200,...,"result":{"businessType":"PLAYSTATION","common":[...`
An unknown type must answer 404 with `error.code: "NOT_FOUND"`.

- [ ] **Step 11: Commit**

```bash
git add src/modules/catalog
git commit -m "feat(catalog): add GET /business/types/:type/attributes-schema"
```

---

### Task 10: `/geo/regions` contract-path aliases

**Files:**
- Create: `src/modules/geo/presentation/geo-regions.controller.ts`
- Modify: `src/modules/geo/geo.module.ts`
- Test: covered by the curl checks in Step 3 — the delegated `GeoService` methods are already
  unit-tested in `geo.service.spec.ts`, so no new unit test is warranted for a pure alias.

**Interfaces:**
- Consumes: `GeoService.getRegions()`, `GeoService.getDistricts(regionId: string | null)`,
  `RegionDto.fromDomain`, `DistrictDto.fromDomain`.
- Produces: `GET /v1/geo/regions`, `GET /v1/geo/regions/:regionId/districts`.

- [ ] **Step 1: Create the controller**

`src/modules/geo/presentation/geo-regions.controller.ts`:

```ts
import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ERROR_CODE } from '../../../common/errors/error-code';
import {
  ApiNotFoundEnvelope,
  ApiOkEnvelope,
} from '../../../common/swagger/api-envelope.decorator';
import { GeoService } from '../application/geo.service';
import { DistrictDto } from './dto/district.dto';
import { RegionDto } from './dto/region.dto';

/**
 * The contract paths for geo reference data (`elon-uz.json`: `/geo/regions`,
 * `/geo/regions/{regionId}/districts`), serving the same data as `/regions` and `/districts`.
 *
 * Both exist on purpose. `/regions` and `/districts` are already documented and shipped to the
 * admin panel (`docs/api/admin-panel/08-geo.md`), so moving them would break it; the mobile client
 * is generated from the OpenAPI document and calls these. One `GeoService`, no duplicated logic.
 */
@ApiTags('Geo')
@Controller('geo/regions')
export class GeoRegionsController {
  constructor(private readonly geoService: GeoService) {}

  @Get()
  @ApiOperation({ summary: 'List regions (14 total) — contract path alias of GET /regions' })
  @ApiOkEnvelope([RegionDto])
  async getRegions(): Promise<RegionDto[]> {
    const regions = await this.geoService.getRegions();
    return regions.map(RegionDto.fromDomain);
  }

  @Get(':regionId/districts')
  @ApiOperation({
    summary: 'List a region’s districts — contract path alias of GET /districts?regionId=',
  })
  @ApiParam({ name: 'regionId', description: 'Region id', example: 'TOSHKENT_SHAHRI' })
  @ApiOkEnvelope([DistrictDto])
  @ApiNotFoundEnvelope(ERROR_CODE.NOT_FOUND, 'No region with this id.', 'Viloyat topilmadi')
  async getDistricts(@Param('regionId') regionId: string): Promise<DistrictDto[]> {
    const districts = await this.geoService.getDistricts(regionId);
    return districts.map(DistrictDto.fromDomain);
  }
}
```

> Check `DistrictDto`'s projection method name in `dto/district.dto.ts` and match it.

- [ ] **Step 2: Register it**

In `src/modules/geo/geo.module.ts`, add `GeoRegionsController` to the `controllers` array
alongside the existing ones.

- [ ] **Step 3: Verify both paths answer identically**

Run: `npx tsc --noEmit && npm run start:dev`

```bash
curl -s localhost:3000/v1/geo/regions | head -c 200
curl -s localhost:3000/v1/regions | head -c 200
curl -s localhost:3000/v1/geo/regions/TOSHKENT_SHAHRI/districts | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/v1/geo/regions/NOPE/districts
```

Expected: the first two byte-identical; the third a district list; the fourth `404`.

- [ ] **Step 4: Commit**

```bash
git add src/modules/geo
git commit -m "feat(geo): add contract-path aliases GET /geo/regions and nested districts"
```

---

### Task 11: Metro stations — model, seed, endpoint

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_metro_stations/migration.sql` (generated)
- Create: `prisma/data/uz-metro-stations.json`
- Modify: `prisma/seed.ts`
- Create: `src/modules/geo/domain/entities/metro-station.entity.ts`
- Create: `src/modules/geo/presentation/dto/metro-station.dto.ts`
- Create: `src/modules/geo/presentation/metro-stations.controller.ts`
- Modify: `src/modules/geo/domain/geo.repository.ts`, `infrastructure/geo.prisma.repository.ts`,
  `infrastructure/geo.mapper.ts`, `application/geo.service.ts`, `geo.module.ts`
- Test: `src/modules/geo/application/geo.service.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `MetroStation { id: string; nameUz: string; nameRu: string | null; line: string; lat: number; lng: number }`
  - `GeoRepository.findMetroStations(): Promise<MetroStation[]>`
  - `GeoService.getMetroStations(): Promise<MetroStation[]>`
  - `GET /v1/geo/metro-stations` → `MetroStationDto[]`

- [ ] **Step 1: Add the Prisma model**

In `prisma/schema.prisma`, after `model District`:

```prisma
/// Tashkent metro stations — reference data for the branch form's `metroStation` autocomplete and
/// the `nearestMetro` hint in reverse-geocoding. `Branch.metroStation` stays free text on purpose:
/// an FK would turn a station this table has not caught up with into a failed branch write.
model MetroStation {
  id        String  @id
  nameUz    String  @map("name_uz")
  nameRu    String? @map("name_ru")
  line      String
  lat       Float
  lng       Float
  sortOrder Int     @default(0) @map("sort_order")

  @@index([line, sortOrder])
  @@map("metro_stations")
}
```

- [ ] **Step 2: Generate and inspect the migration**

Run: `npx prisma migrate dev --name metro_stations --create-only`

**Read** the generated `migration.sql`. Confirm it is a single `CREATE TABLE "metro_stations"`
plus a `CREATE INDEX`, with no `DROP` and no change to any existing table. If it touches anything
else, stop and report.

Then: `npx prisma migrate dev && npx prisma generate`

- [ ] **Step 3: Create the seed data file**

`prisma/data/uz-metro-stations.json` — an array of `{ id, nameUz, nameRu, line, lat, lng }`.
`id` is an `UPPER_SNAKE_CASE` slug of `nameUz`, matching how `Region`/`District` ids are built.

Populate every station on the Tashkent network. **Verify the current station roster, line names
and coordinates from a live source before writing the file** — do not write them from memory,
and do not leave the file partial. Structure:

```json
[
  {
    "id": "CHILONZOR",
    "nameUz": "Chilonzor",
    "nameRu": "Чиланзар",
    "line": "CHILONZOR",
    "lat": 41.2754,
    "lng": 69.2044
  }
]
```

`line` is a slug too, so the client can group without string-matching a display name.

- [ ] **Step 4: Seed it**

In `prisma/seed.ts`, add the loader beside `loadGeo`:

```ts
interface RawMetroStation {
  id: string;
  nameUz: string;
  nameRu: string | null;
  line: string;
  lat: number;
  lng: number;
}

function loadMetroStations(): Prisma.MetroStationCreateManyInput[] {
  const raw = readJsonBom<RawMetroStation[]>(
    join(__dirname, 'data', 'uz-metro-stations.json'),
  );
  assertUniqueSlugs('metro station', raw.map((s) => s.id));
  return raw.map((s, index) => ({
    id: s.id,
    nameUz: s.nameUz,
    nameRu: s.nameRu,
    line: s.line,
    lat: s.lat,
    lng: s.lng,
    sortOrder: index,
  }));
}
```

Inside `main`'s transaction, after the region/district block (nothing references these rows, so a
straight replace is safe — unlike regions, which branches FK to):

```ts
    // 4b. Metro stations — nothing FKs to them, so replace wholesale.
    await tx.metroStation.deleteMany();
    await tx.metroStation.createMany({ data: loadMetroStations() });
```

- [ ] **Step 5: Run the seed and confirm the rows land**

Run: `npm run prisma:seed`
Then: `npx prisma studio` (or a psql count) and confirm `metro_stations` is populated with the
number of stations in your JSON file.

- [ ] **Step 6: Create the domain entity**

`src/modules/geo/domain/entities/metro-station.entity.ts`:

```ts
/**
 * A Tashkent metro station. Reference data — the branch form autocompletes `metroStation` from
 * this list, and reverse-geocoding reports the nearest one.
 */
export interface MetroStation {
  id: string;
  nameUz: string;
  nameRu: string | null;
  line: string;
  lat: number;
  lng: number;
}
```

- [ ] **Step 7: Write the failing service test**

In `src/modules/geo/application/geo.service.spec.ts`, add
`findMetroStations: jest.fn().mockResolvedValue([]),` to the repository mock, then:

```ts
describe('getMetroStations', () => {
  it('returns the stations the repository provides', async () => {
    const stations = [
      { id: 'CHILONZOR', nameUz: 'Chilonzor', nameRu: null, line: 'CHILONZOR', lat: 41.27, lng: 69.2 },
    ];
    const service = new GeoService(
      makeGeoRepository({ findMetroStations: jest.fn().mockResolvedValue(stations) }),
    );

    await expect(service.getMetroStations()).resolves.toEqual(stations);
  });
});
```

> Use the spec file's existing repository-mock factory name.

- [ ] **Step 8: Run to verify it fails**

Run: `npx jest src/modules/geo/application/geo.service.spec.ts -t getMetroStations`
Expected: FAIL — `service.getMetroStations is not a function`.

- [ ] **Step 9: Add the port, implementation, mapper and service method**

`src/modules/geo/domain/geo.repository.ts`:

```ts
  /** All metro stations, ordered by line then position along it. */
  findMetroStations(): Promise<MetroStation[]>;
```

`src/modules/geo/infrastructure/geo.mapper.ts` — beside the existing mappers:

```ts
export function toMetroStation(row: PrismaMetroStation): MetroStation {
  return {
    id: row.id,
    nameUz: row.nameUz,
    nameRu: row.nameRu,
    line: row.line,
    lat: row.lat,
    lng: row.lng,
  };
}
```

Import the Prisma row type the way the file's other mappers do.

`src/modules/geo/infrastructure/geo.prisma.repository.ts`:

```ts
  async findMetroStations(): Promise<MetroStation[]> {
    const rows = await this.prisma.metroStation.findMany({
      orderBy: [{ line: 'asc' }, { sortOrder: 'asc' }],
    });
    return rows.map(toMetroStation);
  }
```

`src/modules/geo/application/geo.service.ts`:

```ts
  /** All metro stations (Tashkent only), ordered by line then position. */
  async getMetroStations(): Promise<MetroStation[]> {
    return this.geoRepository.findMetroStations();
  }
```

- [ ] **Step 10: Run to verify it passes**

Run: `npx jest src/modules/geo/application/geo.service.spec.ts`
Expected: PASS.

- [ ] **Step 11: Create the DTO and controller**

`src/modules/geo/presentation/dto/metro-station.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { MetroStation } from '../../domain/entities/metro-station.entity';

/** MetroStationDto — one Tashkent metro station. */
export class MetroStationDto {
  @ApiProperty({ example: 'CHILONZOR' })
  id!: string;

  @ApiProperty({ example: 'Chilonzor' })
  nameUz!: string;

  @ApiProperty({ type: String, required: false, nullable: true, example: 'Чиланзар' })
  nameRu!: string | null;

  @ApiProperty({ example: 'CHILONZOR', description: 'Line key — group by this, not by name' })
  line!: string;

  @ApiProperty({ example: 41.2754 })
  lat!: number;

  @ApiProperty({ example: 69.2044 })
  lng!: number;

  static fromDomain(station: MetroStation): MetroStationDto {
    const dto = new MetroStationDto();
    dto.id = station.id;
    dto.nameUz = station.nameUz;
    dto.nameRu = station.nameRu;
    dto.line = station.line;
    dto.lat = station.lat;
    dto.lng = station.lng;
    return dto;
  }
}
```

`src/modules/geo/presentation/metro-stations.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiOkEnvelope } from '../../../common/swagger/api-envelope.decorator';
import { GeoService } from '../application/geo.service';
import { MetroStationDto } from './dto/metro-station.dto';

/**
 * Metro station reference data (no auth) — feeds the branch form's `metroStation` autocomplete.
 * No `?regionId=` filter: the network is Tashkent-only, so a parameter with one legal value would
 * be noise.
 */
@ApiTags('Geo')
@Controller('geo/metro-stations')
export class MetroStationsController {
  constructor(private readonly geoService: GeoService) {}

  @Get()
  @ApiOperation({ summary: 'List Tashkent metro stations, ordered by line then position' })
  @ApiOkEnvelope([MetroStationDto])
  async getMetroStations(): Promise<MetroStationDto[]> {
    const stations = await this.geoService.getMetroStations();
    return stations.map(MetroStationDto.fromDomain);
  }
}
```

- [ ] **Step 12: Register and verify**

Add `MetroStationsController` to `controllers` in `src/modules/geo/geo.module.ts`.

Run: `npx tsc --noEmit && npx jest src/modules/geo && npm run start:dev`

```bash
curl -s localhost:3000/v1/geo/metro-stations | head -c 300
```

Expected: the envelope with a populated `result` array.

- [ ] **Step 13: Commit**

```bash
git add prisma src/modules/geo
git commit -m "feat(geo): add metro station reference data and GET /geo/metro-stations"
```

---

### Task 12: `nearestMetro` in reverse-geocode

**Files:**
- Modify: `src/modules/geo/application/geocoding.service.ts:51-70`
- Test: `src/modules/geo/application/geocoding.service.spec.ts`

**Interfaces:**
- Consumes: `GeoRepository.findMetroStations()` (Task 11).
- Produces: `ReverseGeocodeResult.nearestMetro` now carries a station name instead of always `null`.

- [ ] **Step 1: Write the failing tests**

In `src/modules/geo/application/geocoding.service.spec.ts`, add `findMetroStations` to the geo
repository mock and update the existing assertion that expects `nearestMetro: null` (it becomes
the no-stations case):

```ts
describe('reverseGeocode — nearestMetro', () => {
  const stations = [
    { id: 'CHILONZOR', nameUz: 'Chilonzor', nameRu: null, line: 'CHILONZOR', lat: 41.2754, lng: 69.2044 },
    { id: 'BUYUK_IPAK_YULI', nameUz: 'Buyuk ipak yo‘li', nameRu: null, line: 'OZBEKISTON', lat: 41.3253, lng: 69.3376 },
  ];

  it('reports the closest station', async () => {
    const service = makeService({
      geoRepository: makeGeoRepository({
        findMetroStations: jest.fn().mockResolvedValue(stations),
      }),
    });

    const result = await service.reverseGeocode(41.276, 69.205);

    expect(result.nearestMetro).toBe('Chilonzor');
  });

  it('is null when no station is loaded', async () => {
    const service = makeService({
      geoRepository: makeGeoRepository({ findMetroStations: jest.fn().mockResolvedValue([]) }),
    });

    const result = await service.reverseGeocode(41.276, 69.205);

    expect(result.nearestMetro).toBeNull();
  });

  it('is null for a point nowhere near the network', async () => {
    const service = makeService({
      geoRepository: makeGeoRepository({
        findMetroStations: jest.fn().mockResolvedValue(stations),
      }),
    });

    // Samarkand — ~270 km from any Tashkent station.
    const result = await service.reverseGeocode(39.627, 66.975);

    expect(result.nearestMetro).toBeNull();
  });
});
```

> `makeService`/`makeGeoRepository` are shorthand for whatever construction the spec file already
> uses — match it.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/modules/geo/application/geocoding.service.spec.ts -t nearestMetro`
Expected: FAIL — `nearestMetro` is always `null`.

- [ ] **Step 3: Implement the lookup**

In `src/modules/geo/application/geocoding.service.ts`, above the class:

```ts
/**
 * Past this, "nearest metro" stops being a useful landmark and starts being a wrong one — a branch
 * in Samarkand must not be described by a Tashkent station.
 */
const NEAREST_METRO_MAX_METERS = 3_000;
```

Update the `reverseGeocode` doc comment's `nearestMetro is null (Level-1)` clause to describe the
new behaviour, then replace the return:

```ts
    const stations = await this.geoRepository.findMetroStations();
    return {
      regionId: resolved.regionId,
      districtId: resolved.districtId,
      address,
      nearestMetro: this.nearestMetro(lat, lng, stations),
    };
```

Add the private helper, reusing the distance function the file already uses for
`nearestDistrict` (do not add a second haversine — if `nearestDistrict` uses a shared helper from
`common/geo`, import the same one):

```ts
  /**
   * The closest station within {@link NEAREST_METRO_MAX_METERS}, or null — no station, or none
   * close enough to be a landmark.
   */
  private nearestMetro(lat: number, lng: number, stations: MetroStation[]): string | null {
    let closest: MetroStation | null = null;
    let closestMeters = Number.POSITIVE_INFINITY;
    for (const station of stations) {
      const meters = distanceMeters(lat, lng, station.lat, station.lng);
      if (meters < closestMeters) {
        closest = station;
        closestMeters = meters;
      }
    }
    return closest !== null && closestMeters <= NEAREST_METRO_MAX_METERS
      ? closest.nameUz
      : null;
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsc --noEmit && npx jest src/modules/geo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/geo
git commit -m "feat(geo): resolve nearestMetro in reverse-geocode"
```

---

### Task 13: Full-suite verification and the handoff documents

**Files:**
- Create: `docs/api/mobile_questions/DISCOUNTS_BUSINESS_API_RESPONSE.md`
- Modify: `docs/api/provider/ENDPOINTS_CHECKLIST.md`

**Interfaces:**
- Consumes: every endpoint from Tasks 2–12.
- Produces: no code.

- [ ] **Step 1: Run the whole suite and the linter**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green. Fix any failure before continuing — do not write the response doc against a
red suite.

- [ ] **Step 2: Walk the moderation chain end to end**

With `MODERATION_ENABLED=true`, boot the app and drive the full path with `curl`: register a
business owner → `POST /v1/business` (expect `status: "DRAFT"`) → `POST /v1/business/:id/submit`
(expect `PENDING_REVIEW`) → admin `POST /v1/admin/businesses/:id/approve` (expect `APPROVED`) →
create a branch → `POST /v1/business/:id/listings` → `POST /v1/listings/:id/submit` (expect
`PENDING_REVIEW`) → admin `POST /v1/admin/listings/:id/approve` (expect `ACTIVE`).

Record the actual status value observed at each step. If any step does not produce the expected
status, stop and fix it.

- [ ] **Step 3: Confirm the flag-off path is unchanged**

Restart with `MODERATION_ENABLED=false` and repeat: `POST /v1/business` must return
`status: "APPROVED"`, and `POST /v1/listings/:id/submit` must return `ACTIVE` (or `SCHEDULED` for
a forward-dated listing). This is the regression check that the flag default changed nothing.

- [ ] **Step 4: Write the response document**

Create `docs/api/mobile_questions/DISCOUNTS_BUSINESS_API_RESPONSE.md`, in Uzbek, matching the
structure of the sibling `*_RESPONSE.md` files in that directory. It must cover:

1. **Nima allaqachon bor** — the §1 table from the design doc: every part of the request that was
   already implemented, with its route.
2. **Nima yangi qo'shildi** — the endpoints from Tasks 2, 4, 8, 9, 10, 11 with exact paths,
   methods and response DTO names.
3. **`MODERATION_ENABLED`** — what it does, that it is off by default, and what the client sees in
   each mode (`DRAFT` vs `APPROVED` on create; `PENDING_REVIEW` vs `ACTIVE` on submit). The client
   must not assume either.
4. **Limitlar** — the four §6.4 caps that are enforced and the error code each returns.
5. **Kelishmovchiliklar** — the seven departures from §9 of the design doc, each with its reason:
   the 27-type catalog vs the document's 7; `POST /discounts/search` instead of `GET /discounts`;
   `AttributeFieldDto` instead of JSON Schema; geo aliases rather than moved paths; the branch
   limit; our JWT auth rather than Firebase; and `FORBIDDEN` rather than `FORBIDDEN_ROLE` /
   `NOT_BUSINESS_OWNER`.
6. **Ochiq savollar** — `GET /geo/metro-stations` is not in `elon-uz.json`; ask them to add it,
   or to confirm they will call it as an out-of-contract extra.

- [ ] **Step 5: Update the endpoints checklist**

In `docs/api/provider/ENDPOINTS_CHECKLIST.md`, the "2-daraja" section lists as pending several
items now built. Move `POST /business/{id}/submit`, `GET /business/types/{type}/attributes-schema`
and `GET /geo/regions` · `GET /geo/regions/{id}/districts` out of that list, marking them done,
and add the four new admin moderation routes plus `GET /geo/metro-stations`. Leave every other
line untouched.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs: answer the discounts business API request and update the checklist"
```

---

## Self-Review

**Spec coverage.** Each design section maps to a task: §2.1 → Tasks 2, 4; §2.2 → Tasks 5, 8;
§2.3 → Task 7; §3 → Task 9; §4 → Task 10; §5 → Tasks 11, 12; §6 → Tasks 3, 6; §7 (migrations) →
Tasks 6, 11; §8 (testing) → tests inside each task plus Task 13 Steps 1–3; §9 (departures) →
Task 13 Step 4. Task 1 is the flag §2 depends on. No section is unclaimed.

**Type consistency.** `setStatus(id, status, rejectionReason)` on `BusinessRepository` is used with
all three arguments in Tasks 2 and 4. Listings deliberately use a *different* method,
`setRejection(id, status, rejectionReason)`, because `ListingRepository.setStatus(id, status)`
already exists with two parameters and is called by pause/activate/withdraw — widening it would
touch four unrelated call sites. `moderationEnabled()` is defined privately in both
`BusinessService` (Task 2) and `ListingsService` (Task 5); it is three lines, and sharing it would
mean a base class or a helper importing `ConfigService` into `domain/`. `assertMaySubmit` is
called with `(this.listings, businessId, ownerId, now)` in Task 6, matching its
`(deps, businessId, ownerId, now)` signature — `ListingRepository` structurally satisfies
`SubmitLimitDeps` once Task 6 Step 8 adds both counts. `requiresReModeration(stored, incoming)` is
consistent between Task 7's definition and its call site. Task 8 asserts `setRejection` with a
trailing `null` for approve and the reason for reject, matching the single method the service
uses for both.

**Placeholder scan.** No `TBD`, no "similar to Task N", no "add error handling". The one step that
cannot carry literal content is Task 11 Step 3 (the metro station roster), which instructs
verifying the current stations from a live source rather than inventing coordinates — writing
made-up latitudes into the plan would be worse than naming the research step.
