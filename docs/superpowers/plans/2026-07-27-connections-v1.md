# Connections (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the LinkedIn-style social graph that gates chat — connection request/accept/decline/remove, block, report, and student discovery search — as a standalone, testable API.

**Architecture:** New feature module `src/modules/connections/` in the project's four DDD layers (domain ports → application services → Prisma infra → REST presentation). Students-only (reuses `StudentGuard`). All writes are ownership/identity-checked from the JWT. This is **Plan 1 of 2**; Plan 2 (Chat) layers messaging on top and adds the `Conversation`/`Message` tables + the WebSocket gateway.

**Tech Stack:** NestJS, Prisma/PostgreSQL, class-validator, Jest. Follows the exact conventions in `docs/architecture/chat.md` (C1, C10, C11, C12) and the existing `business`/`branches`/`listings` modules.

**Spec:** `docs/architecture/chat.md` — Connections subsystem, decisions C1 (access model), C10 (abuse limits), C11 (discovery + username), C12 (reporting).

**Conventions used below:** Boilerplate that exactly mirrors an existing file is specified by reference to that file (e.g. "mirror `listing.mapper.ts`") rather than reproduced — the established patterns are the source of truth. Full code is given for schema, domain ports, and the service business logic (the non-obvious parts). Commits are checkpoints the **repo owner** runs (`git commit` is denied to the agent) — leave the working tree clean and staged-describable at each ✅.

---

## File structure

```
prisma/schema.prisma                    (modify: Student + 3 models + 3 enums)
src/common/errors/error-code.ts         (modify: add connection/report codes)

src/modules/connections/
├── domain/
│   ├── enums/connection-status.enum.ts
│   ├── enums/report-reason.enum.ts
│   ├── enums/report-status.enum.ts
│   ├── enums/connection-view.enum.ts        # NONE|PENDING_OUT|PENDING_IN|CONNECTED
│   ├── entities/connection.entity.ts
│   ├── entities/report.entity.ts
│   ├── entities/student-summary.entity.ts
│   ├── connections.repository.ts            # CONNECTIONS_REPOSITORY (edges + blocks)
│   ├── reports.repository.ts                # REPORTS_REPOSITORY
│   └── student-directory.repository.ts      # STUDENT_DIRECTORY (search + summary reads)
├── application/
│   ├── connections.io.ts
│   ├── connections.service.ts               # + connections.service.spec.ts
│   └── reports.service.ts                   # + reports.service.spec.ts
├── infrastructure/
│   ├── connection.mapper.ts
│   ├── connection.prisma.repository.ts
│   ├── report.prisma.repository.ts
│   └── student-directory.prisma.repository.ts
├── presentation/
│   ├── dto/ (see Task 6)
│   ├── connections.controller.ts            # /v1/connections + /v1/connections/requests
│   ├── blocks.controller.ts                 # /v1/blocks
│   ├── reports.controller.ts                # /v1/reports
│   └── student-search.controller.ts         # /v1/students/search
└── connections.module.ts

src/app.module.ts                       (modify: register ConnectionsModule)
src/modules/profiles/…                  (modify: expose+set username — Task 8)
```

---

## Task 1: Prisma schema + migration + error codes

**Files:** Modify `prisma/schema.prisma`, `src/common/errors/error-code.ts`.

- [ ] **Step 1: Add enums + models to `prisma/schema.prisma`**

```prisma
enum ConnectionStatus { PENDING ACCEPTED DECLINED }
enum ReportReason     { SPAM SCAM HARASSMENT INAPPROPRIATE OTHER }
enum ReportStatus     { OPEN REVIEWED ACTIONED DISMISSED }

model Connection {
  id          String           @id @default(cuid())
  requesterId String           @map("requester_id")
  addresseeId String           @map("addressee_id")
  status      ConnectionStatus @default(PENDING)
  createdAt   DateTime         @default(now()) @map("created_at")
  respondedAt DateTime?        @map("responded_at")

  requester Student @relation("ConnectionRequester", fields: [requesterId], references: [id], onDelete: Cascade)
  addressee Student @relation("ConnectionAddressee", fields: [addresseeId], references: [id], onDelete: Cascade)

  @@unique([requesterId, addresseeId])
  @@index([addresseeId, status])
  @@index([requesterId, status])
  @@map("connections")
}

model Block {
  id        String   @id @default(cuid())
  blockerId String   @map("blocker_id")
  blockedId String   @map("blocked_id")
  createdAt DateTime @default(now()) @map("created_at")

  blocker Student @relation("BlockBlocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked Student @relation("BlockBlocked", fields: [blockedId], references: [id], onDelete: Cascade)

  @@unique([blockerId, blockedId])
  @@index([blockedId])
  @@map("blocks")
}

model Report {
  id              String       @id @default(cuid())
  reporterId      String       @map("reporter_id")
  targetStudentId String?      @map("target_student_id")
  messageId       String?      @map("message_id")   // FK added in Plan 2 (Message table)
  reason          ReportReason
  note            String?
  contentSnapshot String?      @map("content_snapshot")
  status          ReportStatus @default(OPEN)
  createdAt       DateTime     @default(now()) @map("created_at")

  reporter      Student  @relation("ReportReporter", fields: [reporterId], references: [id], onDelete: Cascade)
  targetStudent Student? @relation("ReportTarget", fields: [targetStudentId], references: [id], onDelete: SetNull)

  @@index([targetStudentId])
  @@index([status])
  @@map("reports")
}
```

- [ ] **Step 2: Extend the `Student` model** (add the column + back-relations)

Inside `model Student { … }` add:
```prisma
  username  String? @unique
  // chat/social relations
  connectionRequestsSent     Connection[] @relation("ConnectionRequester")
  connectionRequestsReceived Connection[] @relation("ConnectionAddressee")
  blocksMade                 Block[]      @relation("BlockBlocker")
  blocksReceived             Block[]      @relation("BlockBlocked")
  reportsMade                Report[]     @relation("ReportReporter")
  reportsAgainst             Report[]     @relation("ReportTarget")
```
(`Student.lastSeenAt` is added in Plan 2 — presence is a chat concern.)

- [ ] **Step 3: Add error codes** to `src/common/errors/error-code.ts` (match the existing `KEY: 'KEY'` style + Uzbek messages wherever messages live):

```
CANNOT_CONNECT_SELF          → "O'zingizga so'rov yubora olmaysiz"
STUDENT_NOT_FOUND            → "Foydalanuvchi topilmadi"
USER_BLOCKED                 → "Bu foydalanuvchi bilan bog'lanib bo'lmaydi"
CONNECTION_REQUEST_EXISTS    → "So'rov allaqachon yuborilgan"
ALREADY_CONNECTED            → "Siz allaqachon bog'langansiz"
CONNECTION_REQUEST_NOT_FOUND → "So'rov topilmadi"
CONNECTION_NOT_FOUND         → "Bog'lanish topilmadi"
USERNAME_TAKEN               → "Bu username band"
REPORT_TARGET_INVALID        → "Shikoyat uchun foydalanuvchi yoki xabar ko'rsatilishi kerak"
```

- [ ] **Step 4: Generate the migration**

Run: `npx prisma migrate dev --name add_connections_blocks_reports`
Expected: a new folder under `prisma/migrations/…add_connections_blocks_reports/` and `prisma generate` succeeds. (Requires the local Postgres from `docker-compose.yml` up.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0 (Prisma client regenerated with the new models/enums).

- [ ] **Step 6: Commit** — `feat(connections): prisma schema for connections, blocks, reports + username`

---

## Task 2: Domain layer (enums, entities, ports)

**Files:** Create the `domain/` files listed in the file structure.

- [ ] **Step 1: Enums** — one file each, wire values mirror the Prisma enums (see `listing-status.enum.ts` for the doc-comment style).
  - `ConnectionStatus { PENDING, ACCEPTED, DECLINED }`
  - `ReportReason { SPAM, SCAM, HARASSMENT, INAPPROPRIATE, OTHER }`
  - `ReportStatus { OPEN, REVIEWED, ACTIONED, DISMISSED }`
  - `ConnectionView { NONE, PENDING_OUT, PENDING_IN, CONNECTED }` — the per-viewer relationship label (C11).

- [ ] **Step 2: Entities** (pure TS, no NestJS/Prisma)

`student-summary.entity.ts`:
```ts
export interface StudentSummary {
  id: string;
  username: string | null;
  fullName: string | null;   // firstName + lastName joined, or null
  avatarUrl: string | null;
  online: boolean;           // always false in Plan 1 (presence lands in Plan 2)
  lastSeenAt: Date | null;   // null in Plan 1
}
```

`connection.entity.ts`:
```ts
import { ConnectionStatus } from '../enums/connection-status.enum';

export interface Connection {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: ConnectionStatus;
  createdAt: Date;
  respondedAt: Date | null;
}
```

`report.entity.ts`:
```ts
import { ReportReason } from '../enums/report-reason.enum';
import { ReportStatus } from '../enums/report-status.enum';

export interface Report {
  id: string;
  reporterId: string;
  targetStudentId: string | null;
  messageId: string | null;
  reason: ReportReason;
  note: string | null;
  contentSnapshot: string | null;
  status: ReportStatus;
  createdAt: Date;
}
```

- [ ] **Step 3: Ports** (interfaces + injection tokens — mirror `listing.repository.ts` token style)

`connections.repository.ts`:
```ts
export const CONNECTIONS_REPOSITORY = Symbol('CONNECTIONS_REPOSITORY');

/** One edge between a pair, in either direction, or null. */
export interface ConnectionsRepository {
  findEdge(a: string, b: string): Promise<Connection | null>;            // either direction
  findById(id: string): Promise<Connection | null>;
  create(requesterId: string, addresseeId: string): Promise<Connection>;
  setStatus(id: string, status: ConnectionStatus): Promise<Connection>;  // sets respondedAt=now for ACCEPTED/DECLINED
  deleteEdge(a: string, b: string): Promise<boolean>;                    // ACCEPTED removal; true if a row was deleted
  /** ACCEPTED edges touching `studentId`, newest first, paginated → the OTHER id + edge. */
  listAccepted(studentId: string, page: number, size: number): Promise<{ items: Connection[]; total: number }>;
  /** PENDING edges where `studentId` is addressee (incoming) or requester (outgoing). */
  listPending(studentId: string, direction: 'incoming' | 'outgoing', page: number, size: number): Promise<{ items: Connection[]; total: number }>;

  // blocks
  isBlockedEitherWay(a: string, b: string): Promise<boolean>;
  block(blockerId: string, blockedId: string): Promise<void>;   // idempotent upsert; also deletes any edge between them
  unblock(blockerId: string, blockedId: string): Promise<void>;
  /** ids `viewer` has blocked or been blocked by — used to exclude from search. */
  blockedIds(viewerId: string): Promise<string[]>;
}
```

`reports.repository.ts`:
```ts
export const REPORTS_REPOSITORY = Symbol('REPORTS_REPOSITORY');
export interface CreateReportData {
  reporterId: string;
  targetStudentId: string | null;
  messageId: string | null;
  reason: ReportReason;
  note: string | null;
  contentSnapshot: string | null;
}
export interface ReportsRepository {
  /** True if the reporter has an OPEN report against the same target (coalesce duplicates, C12). */
  hasOpenReport(reporterId: string, targetStudentId: string | null, messageId: string | null): Promise<boolean>;
  create(data: CreateReportData): Promise<Report>;
}
```

`student-directory.repository.ts`:
```ts
export const STUDENT_DIRECTORY = Symbol('STUDENT_DIRECTORY');
export interface StudentDirectoryRepository {
  exists(studentId: string): Promise<boolean>;
  findSummary(studentId: string): Promise<StudentSummary | null>;
  findSummaries(ids: string[]): Promise<StudentSummary[]>;
  /** Search by username prefix OR full-name contains (case-insensitive), excluding `excludeIds`. */
  search(query: string, excludeIds: string[], page: number, size: number): Promise<{ items: StudentSummary[]; total: number }>;
}
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 5: Commit** — `feat(connections): domain entities and repository ports`

---

## Task 3: Infrastructure (Prisma repositories + mapper)

**Files:** Create the `infrastructure/` files. Prisma is used ONLY here (project rule). Mirror `listing.prisma.repository.ts` for structure and `business.mapper.ts` for mapping style.

- [ ] **Step 1: `connection.mapper.ts`** — `toDomain(row): Connection` (enum lookup `ConnectionStatus[row.status]`), and a `toSummary(studentRow): StudentSummary` (`fullName` = `[firstName, lastName].filter(Boolean).join(' ') || null`; `online:false`, `lastSeenAt:null` in Plan 1).

- [ ] **Step 2: `connection.prisma.repository.ts`** implementing `ConnectionsRepository`:
  - `findEdge(a,b)`: `where: { OR: [{requesterId:a,addresseeId:b},{requesterId:b,addresseeId:a}] }`.
  - `create`: `prisma.connection.create({ data: { requesterId, addresseeId } })` (status defaults PENDING).
  - `setStatus`: `update` status + `respondedAt: new Date()`.
  - `deleteEdge(a,b)`: `deleteMany({ where: { OR:[…], status: ACCEPTED } })` → return `count>0`.
  - `listAccepted`: `findMany` where `status=ACCEPTED` and (`requesterId=id` OR `addresseeId=id`), `orderBy: respondedAt desc`, skip/take + `count`.
  - `listPending`: incoming → `addresseeId=id, status=PENDING`; outgoing → `requesterId=id, status=PENDING`; `orderBy createdAt desc`.
  - `isBlockedEitherWay(a,b)`: `block.count({ where:{ OR:[{blockerId:a,blockedId:b},{blockerId:b,blockedId:a}] } }) > 0`.
  - `block`: `$transaction` → `block.upsert` on `@@unique([blockerId,blockedId])` + `connection.deleteMany` on the pair (block supersedes any edge, C1).
  - `unblock`: `block.deleteMany({ where:{ blockerId, blockedId } })`.
  - `blockedIds(viewer)`: rows where viewer is blocker or blocked → return the *other* id list.

- [ ] **Step 3: `report.prisma.repository.ts`** implementing `ReportsRepository` (straightforward `count` + `create`).

- [ ] **Step 4: `student-directory.prisma.repository.ts`** implementing `StudentDirectoryRepository`:
  - `search`: `where: { id: { notIn: excludeIds }, OR: [ { username: { startsWith: query, mode:'insensitive' } }, { firstName: { contains: query, mode:'insensitive' } }, { lastName: { contains: query, mode:'insensitive' } } ] }`, `take/skip` + `count`, map to `StudentSummary`.
  - `findSummary`/`findSummaries`/`exists`: `prisma.student.findUnique/findMany/count`.

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 6: Commit** — `feat(connections): prisma repositories`

---

## Task 4: Application — ConnectionsService (+ tests)

**Files:** `application/connections.io.ts`, `application/connections.service.ts`, `application/connections.service.spec.ts`.
This is the logic core — **TDD it** like `listings.service.spec.ts` (mock the three ports; no DB).

- [ ] **Step 1: `connections.io.ts`** — the paginated result shape reused by the service:
```ts
export interface Page<T> { items: T[]; total: number; }
```

- [ ] **Step 2: Write the failing spec** `connections.service.spec.ts` covering:
  - `sendRequest`: self → `CANNOT_CONNECT_SELF`; unknown addressee → `STUDENT_NOT_FOUND`; blocked → `USER_BLOCKED`; happy → creates PENDING; existing ACCEPTED → `ALREADY_CONNECTED`; own PENDING exists → `CONNECTION_REQUEST_EXISTS`; **reverse PENDING exists → auto-accepts** (returns ACCEPTED, calls `setStatus(reverse.id, ACCEPTED)`, does NOT create).
  - `accept`: not addressee / not PENDING → `CONNECTION_REQUEST_NOT_FOUND`; happy → ACCEPTED.
  - `decline`: same guard → DECLINED.
  - `remove`: no ACCEPTED edge → `CONNECTION_NOT_FOUND`; happy → `deleteEdge` called.
  - `block`/`unblock`: unknown student → `STUDENT_NOT_FOUND`; happy → repo called.
  - `search`: excludes self + blockedIds; annotates each result's `ConnectionView` from the edge (`NONE`/`PENDING_OUT` if requester=me/`PENDING_IN` if addressee=me/`CONNECTED`).
  - `listConnections`/`listRequests`: map edges → other student's summary via `findSummaries`, compute `hasNext = page*size < total`.

  Use the `listings.service.spec.ts` mock-factory style (a `make*` per port returning `jest.fn()`s).

- [ ] **Step 3: Run it — verify it fails** — `npx jest src/modules/connections` → FAIL (service not implemented).

- [ ] **Step 4: Implement `connections.service.ts`.** Full logic for the non-obvious methods:

```ts
async sendRequest(user: AuthenticatedUser, addresseeId: string): Promise<Connection> {
  if (addresseeId === user.id) {
    throw new AppException(ERROR_CODE.CANNOT_CONNECT_SELF, 422, "O'zingizga so'rov yubora olmaysiz");
  }
  if (!(await this.directory.exists(addresseeId))) {
    throw AppException.notFound(ERROR_CODE.STUDENT_NOT_FOUND, 'Foydalanuvchi topilmadi');
  }
  if (await this.connections.isBlockedEitherWay(user.id, addresseeId)) {
    throw new AppException(ERROR_CODE.USER_BLOCKED, 403, "Bu foydalanuvchi bilan bog'lanib bo'lmaydi");
  }
  const edge = await this.connections.findEdge(user.id, addresseeId);
  if (edge?.status === ConnectionStatus.ACCEPTED) {
    throw AppException.conflict(ERROR_CODE.ALREADY_CONNECTED, 'Siz allaqachon bog’langansiz');
  }
  if (edge?.status === ConnectionStatus.PENDING) {
    if (edge.requesterId === user.id) {
      throw AppException.conflict(ERROR_CODE.CONNECTION_REQUEST_EXISTS, "So'rov allaqachon yuborilgan");
    }
    // reverse pending (they already requested me) → auto-accept (C1)
    return this.connections.setStatus(edge.id, ConnectionStatus.ACCEPTED);
  }
  // no edge, or a prior DECLINED one → (re)create a PENDING request
  if (edge) await this.connections.deleteEdge(user.id, addresseeId); // clear DECLINED
  return this.connections.create(user.id, addresseeId);
}
```
`accept`/`decline` load by id via `findById`, assert `addresseeId === user.id && status === PENDING` else `CONNECTION_REQUEST_NOT_FOUND`, then `setStatus`. `remove` calls `deleteEdge`; if it returns false → `CONNECTION_NOT_FOUND`. `block`/`unblock` check `directory.exists` then call the repo. `search` maps results with `viewFor(edge, myId)`. List methods hydrate summaries + build `Page`.

`deleteEdge` note: `remove` needs delete regardless of DECLINED clearing — keep the ACCEPTED-only filter in `deleteEdge` used by `remove`; the DECLINED clear in `sendRequest` uses a direct pair delete. If the single `deleteEdge(status=ACCEPTED)` filter blocks the DECLINED clear, add a second repo method `deletePair(a,b)` (unfiltered) for the sendRequest re-request path. Define it on the port in Task 2 if you take this route.

- [ ] **Step 5: Run tests — verify pass** — `npx jest src/modules/connections` → PASS.
- [ ] **Step 6: Commit** — `feat(connections): connections service with tests`

---

## Task 5: Application — ReportsService (+ tests)

**Files:** `application/reports.service.ts`, `application/reports.service.spec.ts`.

- [ ] **Step 1: Failing spec** — `report`: neither target nor message → `REPORT_TARGET_INVALID`; both → `REPORT_TARGET_INVALID`; unknown targetStudent → `STUDENT_NOT_FOUND`; duplicate open report → coalesced (no second `create`); happy → creates OPEN. (Message snapshotting is a no-op in Plan 1 — `messageId` stored, `contentSnapshot` null until Plan 2.)
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `reports.service.ts` — exactly-one-target guard, `directory.exists` for a student target, `hasOpenReport` coalesce, `create`.
- [ ] **Step 4: Run — passes.** `npx jest src/modules/connections/application/reports.service.spec.ts`
- [ ] **Step 5: Commit** — `feat(connections): reports service with tests`

---

## Task 6: Presentation — DTOs + controllers + module

**Files:** `presentation/dto/*`, the four controllers, `connections.module.ts`. Mirror `listings.controller.ts` (guards, `@ApiTags`, `ApiOkEnvelope`) and `listing-page.dto.ts` (pagination envelope). All routes: `@UseGuards(JwtAuthGuard, StudentGuard)`.

- [ ] **Step 1: DTOs**
  - `StudentSummaryDto` (`id, username, fullName, avatarUrl, online, lastSeenAt`) + `fromDomain`.
  - `SearchResultDto` = `StudentSummaryDto` + `connectionStatus: ConnectionView`.
  - `ConnectionDto` (`id, requesterId, addresseeId, status, createdAt, respondedAt`) + `fromDomain`.
  - `ConnectionSummaryDto` (the other student + `connectedAt`) for the connections list.
  - Page DTOs (`…PageDto { items, page, size, total, hasNext }`, `fromPage`) — mirror `ListingPageDto`.
  - Request DTOs: `SendConnectionRequestDto { addresseeId:string }`, `BlockDto { studentId:string }`, `CreateReportDto { targetStudentId?, messageId?, reason: ReportReason, note?:string }`, `SearchQueryDto { q:string; page?;size? }`, `RequestsQueryDto { direction:'incoming'|'outgoing'; page?;size? }`, `ConnectionsQueryDto { page?;size? }` — class-validator + `@ApiProperty`, defaults page=1/size=20/max 100 (mirror `list-listings-query.dto.ts`).

- [ ] **Step 2: Controllers** (thin — call the service, wrap DTO):
  - `student-search.controller.ts` — `@Controller('students')` · `GET search` → `SearchResultPageDto`.
  - `connections.controller.ts` — `@Controller('connections')` · `POST requests` · `GET requests` · `POST requests/:id/accept` · `POST requests/:id/decline` (200/null) · `GET ''` · `DELETE :studentId` (200/null).
  - `blocks.controller.ts` — `@Controller('blocks')` · `POST ''` (200/null) · `DELETE :studentId` (200/null).
  - `reports.controller.ts` — `@Controller('reports')` · `POST ''` → 201 `ReportDto`.
  - Swagger: `@ApiTags('Connections')` on all; envelopes via the existing decorators; `@ApiParam` for `:id`/`:studentId`.

- [ ] **Step 3: `connections.module.ts`** — imports `PrismaModule`, `JwtModule.register({})`; controllers = the four; providers = `ConnectionsService`, `ReportsService`, `JwtAuthGuard`, `StudentGuard`, and the three port bindings (`{ provide: CONNECTIONS_REPOSITORY, useClass: ConnectionPrismaRepository }`, etc.). Mirror `listings.module.ts`.

- [ ] **Step 4: Register in `src/app.module.ts`** — add `ConnectionsModule` to `imports`.

- [ ] **Step 5: Typecheck + lint + tests**

Run: `npx tsc --noEmit && npx eslint "src/modules/connections/**/*.ts" && npx jest src/modules/connections`
Expected: exit 0 / clean / all pass.

- [ ] **Step 6: Commit** — `feat(connections): REST controllers, DTOs, module wiring`

---

## Task 7: Swagger doc split

**Files:** Modify `src/main.ts`.

- [ ] **Step 1:** Add `'Connections'` to `STUDENT_DOC_TAGS` (it belongs to the student app). Run `npx tsc --noEmit` → 0. The `main.ts` boot-time tag check (`Swagger split references an unknown tag`) passes because the controllers declare `@ApiTags('Connections')`.
- [ ] **Step 2: Commit** — `chore(connections): add Connections to the student Swagger doc`

---

## Task 8: Username in the profile (set + read)

**Files:** Modify `src/modules/profiles/` — `update-profile.dto.ts`, `user-profile.dto.ts`, `profile.service.ts` (+ repo if needed), and its spec.

- [ ] **Step 1: Failing spec** in `profile.service.spec.ts` — setting a username that another student holds → `USERNAME_TAKEN` (409); a free username → saved; username appears in the profile read.
- [ ] **Step 2:** Add optional `username` to `UpdateProfileDto` (validated: `@IsOptional() @Matches(/^[a-z0-9_]{3,20}$/i)` — lowercase-normalised in the service) and to `UserProfileDto`. In `ProfileService.update`, if `username` changes, check availability (repo `findByUsername`/unique-violation catch) → `USERNAME_TAKEN`. Read maps `username` through.
- [ ] **Step 3: Run** `npx jest src/modules/profiles` → PASS.
- [ ] **Step 4: Commit** — `feat(profiles): editable unique username`

---

## Task 9: End-to-end smoke (optional but recommended)

**Files:** `test/connections.e2e-spec.ts` (mirror an existing e2e under `test/`).

- [ ] **Step 1:** Two students register (via `/v1/auth/student/register`). A searches B by name → B appears with `connectionStatus:NONE`. A → request; B → accept. `GET /v1/connections` for both shows the other. A blocks B → B drops from A's search and a new request → `USER_BLOCKED`. A reports B → 201.
- [ ] **Step 2: Run** `npx jest --config ./test/jest-e2e.json connections` → PASS (needs Postgres up).
- [ ] **Step 3: Commit** — `test(connections): e2e happy path + block/report`

---

## Task 10 (follow-up — DO NOT SKIP): C10 abuse limits

**Files:** `connections.controller.ts` (+ a throttle config). Deferred from v1 by owner decision, but **must ship before chat launch**.

- [ ] **Step 1:** Add `@nestjs/throttler` guards: per-requester cap on `POST /v1/connections/requests` (e.g. N/hour) and on `POST /v1/reports`; a **cooldown** before re-requesting a connection that was just `DECLINED` (enforced in `ConnectionsService.sendRequest` — reject with `RATE_LIMITED` 429 if a DECLINED edge's `respondedAt` is within the cooldown window).
- [ ] **Step 2:** Tests for the cooldown branch; `@Throttle` on the routes.
- [ ] **Step 3: Commit** — `feat(connections): request/report rate-limits + decline cooldown (C10)`

---

## Self-review checklist (run before handoff)

- **Spec coverage:** C1 (request/accept/decline/auto-accept/block) → T4; C10 (rate-limit/abuse) → *note:* request rate-limit + decline cooldown are **deferred to a follow-up** (v1 ships the edges + block; add `@Throttle` guards next) — flag to the owner; C11 (username + dual search + connectionStatus) → T1/T4/T6/T8; C12 (report user/message, reasons, coalesce) → T5.
- **Deferred & flagged:** decline-cooldown + per-requester request rate-limit (C10) — add `@nestjs/throttler` guards in a follow-up task; message reporting `contentSnapshot` fills in Plan 2 when `Message` exists.
- **Types:** `Page<T>`, `StudentSummary`, `Connection`, `ConnectionView` names are consistent across Tasks 2/4/6.
```
