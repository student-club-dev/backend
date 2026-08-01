# Chat qo'ng'iroq — 1-bosqich (signalizatsiya yadrosi) implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ilova ochiq bo'lganda ikki talaba orasida audio/video qo'ng'iroq to'liq va xavfsiz ishlasin — signalizatsiya, holat mashinasi, taymerlar, TURN hisobi va chatdagi qo'ng'iroq yozuvi bilan.

**Architecture:** Yangi `calls` moduli DDD to'rt qatlamida. Jonli holat Redis'da (atomar Lua bilan band qilish), taymerlar BullMQ kechiktirilgan joblarida, doimiy yozuv Postgres'da shartli `UPDATE` bilan. `/calls` Socket.IO namespace `/chat` naqshini takrorlaydi; umumiy WS kodi `src/common/websocket/` ga chiqariladi. Qo'ng'iroq tugagach `CallEndedBus` orqali chat modulga xabar beriladi (chat → calls bir tomonlama import).

**Tech Stack:** NestJS · TypeScript strict · Prisma + PostgreSQL 16 · Redis (ioredis) · BullMQ · Socket.IO + Redis adapter · Jest

## Global Constraints

- **Manba spec:** `docs/superpowers/specs/2026-08-01-chat-calls-design.md` (2-tahrir). Ziddiyat bo'lsa spec ustun.
- **Qatlam yo'nalishi:** `presentation → application → domain ← infrastructure`. Prisma va Redis **faqat** `infrastructure/` da.
- **`any` ishlatilmaydi.** `tsconfig.json` strict rejimda.
- **`throw new Error()` yo'q** — `AppException` (`src/common/exceptions/app.exception.ts`).
- **`console.log` yo'q** — NestJS `Logger`.
- **Barcha xato xabarlari o'zbekcha, foydalanuvchiga ko'rinadigan matn.**
- **SDP va ICE nomzodlari hech qanday log darajasida yozilmaydi** — ular foydalanuvchining IP manzilini o'z ichiga oladi.
- **Sanalar ISO-8601**, sahifalash `{ items, page, size, total, hasNext }`.
- Har REST endpoint `@ApiTags` / `@ApiOperation` / `@ApiResponse` bilan hujjatlashtiriladi.
- Fayl nomlari `kebab-case`, klasslar `PascalCase`, DB ustunlari `snake_case` (`@map`).
- Har vazifa oxirida commit — Conventional Commits (`feat:`, `refactor:`, `test:`).

## Bosqichlar haqida

Bu reja **faqat 1-bosqichni** qamraydi. 2-bosqich (VoIP push) va 3-bosqich (telemetriya, shikoyat, IP-sozlama) alohida rejalar oladi — ular 1-bosqichning real shakliga tayanadi.

---

## Fayl tuzilishi

**Yangi — umumiy:**

| Fayl | Mas'uliyat |
|---|---|
| `src/common/websocket/ws-jwt.ts` | Handshake JWT tekshiruvi (`chat/infrastructure/` dan ko'chiriladi) |
| `src/common/websocket/ws-helpers.ts` | `personalRoom`, `userOf`, `toWsError`, `wsUnauthorized`, `assertTokenFresh` |
| `src/common/chat/direct-key.ts` | `directKeyFor(a, b)` — juftlik uchun barqaror kalit |

**Yangi — `src/modules/calls/`:**

| Fayl | Mas'uliyat |
|---|---|
| `domain/enums/call-media.enum.ts` · `call-status.enum.ts` · `call-end-reason.enum.ts` · `call-party.enum.ts` | Domen enumlari |
| `domain/entities/call.entity.ts` | `Call` domen obyekti + `CallState` (Redis jonli holati) |
| `domain/call-state-machine.ts` | `canTransition`, `isTerminal`, `isValidOutcome` — sof |
| `domain/glare.ts` | `resolveGlare()` — sof; Lua uning transkripsiyasi |
| `domain/call.repository.ts` | Postgres porti |
| `domain/call-state.repository.ts` | Redis jonli holat porti |
| `domain/call-timers.repository.ts` | Kechiktirilgan taymerlar porti |
| `domain/conversation-directory.repository.ts` | Juftlik → `conversationId` porti |
| `domain/student-directory.repository.ts` | `caller` xulosasi porti |
| `application/call-events.ts` | Hodisa nomlari + payload tiplari |
| `application/calls.service.ts` | Barcha use-case'lar + avtorizatsiya matritsasi |
| `application/call-rate-limiter.ts` | Global va juftlik chegaralari |
| `application/call-ended.bus.ts` | calls → chat signali |
| `infrastructure/call.prisma.repository.ts` | Shartli yozuvlar, `UNION ALL` tarixi |
| `infrastructure/call-state.redis.repository.ts` | Lua bilan atomar band qilish |
| `infrastructure/call-timers.queue.ts` | BullMQ queue + worker |
| `infrastructure/conversation-directory.prisma.repository.ts` | find-or-create direct |
| `infrastructure/student-directory.prisma.repository.ts` | — |
| `infrastructure/ice-credentials.ts` | coturn HMAC-SHA1 |
| `infrastructure/call.mapper.ts` | Prisma satr → domen; `durationMs` hisobi |
| `presentation/calls.controller.ts` | `GET /v1/calls`, `GET /v1/calls/ice-servers` |
| `presentation/dto/*.ts` | REST DTO + 16 WS payload DTO |
| `calls.gateway.ts` | `/calls` namespace |
| `calls.module.ts` | — |

**Yangi — boshqa:** `src/cron/call-reconciliation.cron.ts` · `deploy/coturn/turnserver.conf` · `deploy/coturn/README.md` · `docs/architecture/calls.md`

**O'zgartiriladi:** `prisma/schema.prisma` · `src/common/errors/error-code.ts` · `src/config/env.ts` · `.env.example` · `src/modules/chat/chat.gateway.ts` · `src/modules/chat/application/chat.service.ts` · `src/modules/chat/domain/chat.repository.ts` · `src/modules/chat/infrastructure/chat.prisma.repository.ts` · `src/modules/chat/domain/connection-check.repository.ts` · `src/modules/chat/infrastructure/connection-check.prisma.repository.ts` · `src/modules/chat/presentation/dto/message.dto.ts` · `src/infrastructure/cache/redis.service.ts` · `src/app.module.ts` · `src/cron/cron.module.ts`

---

## Task 1: Prisma sxemasi va migratsiya

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_calls/migration.sql` (Prisma generatsiya qiladi, so'ng qo'lda tahrirlanadi)

**Interfaces:**
- Produces: Prisma klientida `Call`, `CallStat`, `CallMedia`, `CallStatus`, `CallEndReason`, `CallParty`, `IceCandidateType`, `DeviceTokenType` tiplari; `MessageType.CALL`; `Message` da `callId`/`callMedia`/`callStatus`/`callDuration`/`callEndReason` ustunlari.

- [ ] **Step 1: Enumlarni qo'shish**

`prisma/schema.prisma` da `enum MessageType` yonига (chat bo'limiga) qo'shing:

```prisma
enum CallMedia {
  AUDIO
  VIDEO
}

/// CONNECTING — `accept` bo'ldi, media hali ulanmadi. Usiz §12.4 dagi 30 soniyalik
/// "accept'dan keyin ulanish" taymeri hech qachon ishlamaydi (dizayn §5.1).
enum CallStatus {
  RINGING
  CONNECTING
  ACTIVE
  ENDED
  MISSED
  DECLINED
  FAILED
  CANCELED
}

enum CallEndReason {
  HANGUP
  TIMEOUT
  DECLINED
  BUSY
  FAILED
  CANCELED
  UNAUTHORIZED
}

/// Kim tugatdi. Student id emas: qiymat faqat ikkitadan biri, va hisob o'chirilsa
/// osilib qolgan id qolmaydi.
enum CallParty {
  CALLER
  CALLEE
}

enum IceCandidateType {
  HOST
  SRFLX
  RELAY
}
```

`enum MessageType` ga `CALL` ni **oxiriga** qo'shing:

```prisma
enum MessageType {
  TEXT
  IMAGE
  GIF
  VIDEO
  FILE
  VOICE
  STICKER
  SYSTEM
  CALL
}
```

- [ ] **Step 2: `Call` va `CallStat` modellarini qo'shish**

```prisma
/// 1:1 qo'ng'iroq yozuvi. Jonli holat Redis'da; bu qator boshlanish va terminal o'tishda
/// yoziladi. Terminal yozuvlar doimo shartli (`WHERE status IN (...)`) — 44.9-soniyadagi
/// `accept` va 45-soniyadagi ring-timeout poygasida holat buzilmasin (dizayn §11).
model Call {
  id             String         @id @default(cuid())
  conversationId String         @map("conversation_id")
  callerId       String         @map("caller_id")
  calleeId       String         @map("callee_id")
  media          CallMedia
  status         CallStatus     @default(RINGING)
  startedAt      DateTime       @default(now()) @map("started_at")
  answeredAt     DateTime?      @map("answered_at")
  endedAt        DateTime?      @map("ended_at")
  endReason      CallEndReason? @map("end_reason")
  endedBy        CallParty?     @map("ended_by")
  updatedAt      DateTime       @updatedAt @map("updated_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  caller       Student      @relation("CallCaller", fields: [callerId], references: [id], onDelete: Cascade)
  callee       Student      @relation("CallCallee", fields: [calleeId], references: [id], onDelete: Cascade)
  stats        CallStat[]
  reports      Report[]     @relation("ReportCall")

  @@index([callerId, startedAt])
  @@index([calleeId, startedAt])
  @@index([conversationId])
  // Rekonsiliatsiya sweep'i (`status IN ('RINGING','CONNECTING','ACTIVE')`) usiz butun
  // jadvalni skanerlaydi. Partial indeks to'g'riroq bo'lardi, lekin Prisma uni ifodalay
  // olmaydi va keyingi `migrate dev` uni drift deb o'chirishga urinadi.
  @@index([status, startedAt])
  @@map("calls")
}

/// Har ishtirokchining o'z telemetriyasi (3-bosqichda to'ldiriladi). Ikki tomonning
/// metrikasi har xil — biri `RELAY`, ikkinchisi `SRFLX` bo'lishi mumkin — shuning uchun
/// `calls` ustunlari emas, alohida qator.
model CallStat {
  callId          String           @map("call_id")
  studentId       String           @map("student_id")
  rttMs           Int?             @map("rtt_ms")
  packetsLost     Int?             @map("packets_lost")
  packetsReceived Int?             @map("packets_received")
  jitterMs        Int?             @map("jitter_ms")
  candidateType   IceCandidateType @map("candidate_type")
  createdAt       DateTime         @default(now()) @map("created_at")

  call    Call    @relation(fields: [callId], references: [id], onDelete: Cascade)
  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)

  @@id([callId, studentId])
  @@index([studentId])
  @@map("call_stats")
}
```

- [ ] **Step 3: Mavjud modellarga teskari bog'lanish va ustunlar qo'shish**

`model Conversation` ga (bu **majburiy** — usiz Prisma kompilyatsiya qilmaydi):

```prisma
  calls Call[]
```

`model Student` ga:

```prisma
  callsMade     Call[]     @relation("CallCaller")
  callsReceived Call[]     @relation("CallCallee")
  callStats     CallStat[]
```

`model Message` ga, `quoteOffset` dan keyin:

```prisma
  // Qo'ng'iroq yozuvi — snapshot, `replyTo*` va `sticker*` bilan bir xil naqsh. `Call` ga
  // JOIN qilinmaydi: ishtirokchi hisobi o'chirilsa Call qatori cascade bilan ketadi, xabar
  // esa qoladi — JOIN'da klient bo'sh "qo'ng'iroq" pufakchasini ko'rardi.
  callId        String?        @map("call_id")
  callMedia     CallMedia?     @map("call_media")
  callStatus    CallStatus?    @map("call_status")
  callDuration  Int?           @map("call_duration_ms")
  callEndReason CallEndReason? @map("call_end_reason")
```

- [ ] **Step 4: Migratsiyani generatsiya qilish**

Run: `npx prisma migrate dev --name calls --create-only`
Expected: `prisma/migrations/<timestamp>_calls/migration.sql` yaratiladi, DB'ga hali qo'llanmaydi.

- [ ] **Step 5: Migratsiya faylini qo'lda tuzatish**

Faylning **eng birinchi qatori** sifatida qo'shing:

```sql
-- FK qo'shish `messages`, `conversations` va `students` jadvallariga ham SHARE ROW EXCLUSIVE
-- qulf qo'yadi. `migrate deploy` ilova nusxalari trafik qabul qilib turganda ishlaydi, ya'ni
-- qulf kutilsa HAR BIR chat xabari navbatga tushadi. 3 soniyada olinmasa migratsiya tez
-- tushsin va qayta urinilsin — chatni to'xtatib turgandan yaxshi.
SET lock_timeout = '3s';
```

`ALTER TYPE "MessageType" ADD VALUE 'CALL'` qatorini toping va ustiga izoh qo'ying:

```sql
-- PG16'da tranzaksiya ichida xavfsiz: yangi qiymat SHU tranzaksiyada ishlatilmaydi.
-- ⚠️ QAYTARIB BO'LMAYDI — PostgreSQL enum qiymatini o'chira olmaydi, bu migratsiyaning
-- rollback'i yo'q.
```

- [ ] **Step 6: Migratsiyani qo'llash va klientni generatsiya qilish**

Run: `npx prisma migrate dev && npx prisma generate`
Expected: migratsiya qo'llanadi, `@prisma/client` da `Call`, `CallStat` va yangi enumlar paydo bo'ladi.

- [ ] **Step 7: Kompilyatsiya sinovi — kutilgan xatolar**

Run: `npx tsc --noEmit`
Expected: **ikkita** xato — `MessageType.CALL` qo'shilgani uchun:
1. `src/modules/chat/chat.gateway.ts` `pushTextFor` — TS2366 (barcha yo'llar qiymat qaytarmaydi)
2. `src/modules/chat/domain/message-composition.ts` `REQUIRED_KIND` — `Record<MessageType, ...>` to'liq emas

Bu **kutilgan va foydali** — ular 17-vazifada tuzatiladi. Hozircha shu ikki xato qolishi normal.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(calls): add Call and CallStat models with call message snapshot columns"
```

---

## Task 2: Umumiy WS kodi va `directKey` ni chiqarish

**Files:**
- Create: `src/common/websocket/ws-jwt.ts`, `src/common/websocket/ws-helpers.ts`, `src/common/chat/direct-key.ts`
- Delete: `src/modules/chat/infrastructure/ws-jwt.ts`
- Modify: `src/modules/chat/chat.gateway.ts`, `src/modules/chat/chat.gateway.spec.ts`, `src/modules/chat/application/chat.service.ts`

**Interfaces:**
- Produces:
  - `verifyStudentSocket(client, jwt, config): Promise<VerifiedSocket>` va `interface VerifiedSocket { user: AuthenticatedUser; expiresAt: number }` — `src/common/websocket/ws-jwt.ts`
  - `personalRoom(studentId: string): string`
  - `userOf(client: Socket): AuthenticatedUser | undefined`
  - `toWsError(error: unknown): { code: string; message: string }`
  - `wsUnauthorized(): { code: string; message: string }`
  - `assertTokenFresh(client: Socket): void`
  — barchasi `src/common/websocket/ws-helpers.ts`
  - `directKeyFor(a: string, b: string): string` — `src/common/chat/direct-key.ts`

- [ ] **Step 1: `ws-jwt.ts` ni ko'chirish**

`src/modules/chat/infrastructure/ws-jwt.ts` faylini `src/common/websocket/ws-jwt.ts` ga ko'chiring. Import yo'llarini uch pog'onadan ikki pog'onaga tuzating:

```ts
import { AccountType } from '../enums/account-type.enum';
import type { Env } from '../../config/env';
import type { AuthenticatedUser, JwtPayload } from '../types/authenticated-user';
```

Fayl izohidagi `(§17.3)` havolasini saqlang. Eski faylni o'chiring.

- [ ] **Step 2: `ws-helpers.ts` ni yaratish**

`src/modules/chat/chat.gateway.ts` dagi `personalRoom` (39-qator), `userOf` (41), `toError` (421), `unauthorized` (465), `assertTokenFresh` (475) funksiyalarini **izohlari bilan birga** ko'chiring. `toError` → `toWsError`, `unauthorized` → `wsUnauthorized` deb nomlang (umumiy fazoda `toError` juda umumiy):

```ts
import type { Socket } from 'socket.io';
import { ERROR_CODE } from '../errors/error-code';
import { AppException } from '../exceptions/app.exception';
import type { AuthenticatedUser } from '../types/authenticated-user';

/** All of a student's devices share this room — 1:1 delivery targets a member's personal room. */
export const personalRoom = (studentId: string): string => `user:${studentId}`;

export const userOf = (client: Socket): AuthenticatedUser | undefined =>
  client.data.user as AuthenticatedUser | undefined;

export function toWsError(error: unknown): { code: string; message: string } {
  if (error instanceof AppException) {
    return { code: error.code, message: error.message };
  }
  return { code: ERROR_CODE.INTERNAL_ERROR, message: 'Xatolik yuz berdi' };
}

export function wsUnauthorized(): { code: string; message: string } {
  return { code: ERROR_CODE.UNAUTHORIZED, message: 'Avtorizatsiyadan o‘tilmagan' };
}

/**
 * The handshake token is verified once, at connect, but a socket can stay open long past that
 * token's lifetime — so every client→server event re-checks the stored `exp`. Failing with the same
 * code REST uses lets the client run its existing refresh path and reconnect with a fresh
 * `auth.token`, instead of showing "Xabar yuborilmadi" forever (§17.3).
 *
 * ⚠️ Calls do NOT apply this to every event — a 4-hour call outlives a 15-minute access token, and
 * refusing `call:end` would leave the microphone streaming. See the three-way policy in
 * `docs/superpowers/specs/2026-08-01-chat-calls-design.md` §6.4.
 */
export function assertTokenFresh(client: Socket): void {
  const exp = client.data.tokenExp as number | undefined;
  if (exp === undefined || exp * 1000 <= Date.now()) {
    throw new AppException(ERROR_CODE.TOKEN_EXPIRED, 401, 'Sessiya muddati tugadi');
  }
}
```

- [ ] **Step 3: `chat.gateway.ts` ni yangi joydan import qilishga o'tkazish**

Ko'chirilgan beshta funksiyani `chat.gateway.ts` dan **o'chiring** va import qo'shing:

```ts
import {
  assertTokenFresh,
  personalRoom,
  toWsError,
  userOf,
  wsUnauthorized,
} from '../../common/websocket/ws-helpers';
import { VerifiedSocket, verifyStudentSocket } from '../../common/websocket/ws-jwt';
```

Fayl ichidagi `toError(` → `toWsError(`, `unauthorized()` → `wsUnauthorized()` chaqiruvlarini almashtiring. Boshqa hech narsaga tegmang.

- [ ] **Step 4: `directKeyFor` ni chiqarish**

`src/modules/chat/application/chat.service.ts` da juftlik kalitini hisoblaydigan joyni toping (`findDirect`/`createDirect` chaqiruvlaridan oldin, ikki id ni tartiblab birlashtiradi). Uni `src/common/chat/direct-key.ts` ga ko'chiring:

```ts
/**
 * Stable key for a 1:1 conversation, independent of who started it. Sorting first is what makes
 * (A,B) and (B,A) the same conversation — the `directKey` unique index relies on it.
 *
 * Lives in `common/` because the calls module needs the same key to resolve a pair to its
 * conversation without importing chat (that direction is taken: chat subscribes to CallEndedBus).
 */
export function directKeyFor(a: string, b: string): string {
  return [a, b].sort().join(':');
}
```

⚠️ **Mavjud implementatsiyani aynan saqlang.** Agar `chat.service.ts` dagi hisob boshqacha bo'lsa (masalan ajratuvchi `_` yoki `|`), **o'shani** ko'chiring — formatni o'zgartirish bazadagi barcha mavjud `directKey` qiymatlarini yaroqsiz qiladi va har suhbat ikkilanadi.

`chat.service.ts` da lokal hisobni olib tashlab, `directKeyFor` ni import qiling.

- [ ] **Step 5: Testlarni ishga tushirish**

Run: `npx jest src/modules/chat --silent`
Expected: PASS — bu sof refaktoring, hech qanday xatti-harakat o'zgarmagan. Agar `chat.gateway.spec.ts` eski yo'ldan import qilsa, uni ham yangilang.

- [ ] **Step 6: Commit**

```bash
git add src/common/websocket src/common/chat src/modules/chat
git commit -m "refactor(chat): extract shared websocket helpers and directKey into common"
```

---

## Task 3: Domen enumlari va `Call` obyekti

**Files:**
- Create: `src/modules/calls/domain/enums/call-media.enum.ts`, `call-status.enum.ts`, `call-end-reason.enum.ts`, `call-party.enum.ts`, `src/modules/calls/domain/entities/call.entity.ts`

**Interfaces:**
- Produces: `CallMedia`, `CallStatus`, `CallEndReason`, `CallParty` enumlari; `interface Call`; `interface CallState`.

- [ ] **Step 1: Enum fayllarini yaratish**

`src/modules/calls/domain/enums/call-media.enum.ts`:

```ts
/** Mirrors the Prisma `CallMedia` enum — the domain does not import Prisma. */
export enum CallMedia {
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
}
```

`call-status.enum.ts`:

```ts
export enum CallStatus {
  RINGING = 'RINGING',
  /** `accept` arrived, media not yet connected. Guards the 30s connect timeout (design §5.1). */
  CONNECTING = 'CONNECTING',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
  MISSED = 'MISSED',
  DECLINED = 'DECLINED',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
}
```

`call-end-reason.enum.ts`:

```ts
export enum CallEndReason {
  HANGUP = 'HANGUP',
  TIMEOUT = 'TIMEOUT',
  DECLINED = 'DECLINED',
  BUSY = 'BUSY',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
  UNAUTHORIZED = 'UNAUTHORIZED',
}
```

`call-party.enum.ts`:

```ts
export enum CallParty {
  CALLER = 'CALLER',
  CALLEE = 'CALLEE',
}
```

- [ ] **Step 2: `call.entity.ts` ni yaratish**

```ts
import { CallEndReason } from '../enums/call-end-reason.enum';
import { CallMedia } from '../enums/call-media.enum';
import { CallParty } from '../enums/call-party.enum';
import { CallStatus } from '../enums/call-status.enum';

/** A persisted call record. `durationMs` is derived, never stored — one source of truth. */
export interface Call {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  media: CallMedia;
  status: CallStatus;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  endReason: CallEndReason | null;
  endedBy: CallParty | null;
}

/**
 * Live call state, held in Redis for the duration of the call. Deliberately a subset of `Call`:
 * this is read on every ICE candidate, so it carries only what routing and authorization need.
 * Timestamps are ISO strings because a Redis hash stores strings.
 */
export interface CallState {
  callId: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  media: CallMedia;
  status: CallStatus;
  startedAt: string;
  answeredAt: string | null;
}

/** Milliseconds of actual conversation; `0` when the call was never answered. */
export function durationMsOf(call: Pick<Call, 'answeredAt' | 'endedAt'>): number {
  if (call.answeredAt === null || call.endedAt === null) {
    return 0;
  }
  return call.endedAt.getTime() - call.answeredAt.getTime();
}

/** Which side of the call a student is on, or `null` when they are not a participant. */
export function partyOf(call: Pick<Call, 'callerId' | 'calleeId'>, studentId: string): CallParty | null {
  if (call.callerId === studentId) {
    return CallParty.CALLER;
  }
  if (call.calleeId === studentId) {
    return CallParty.CALLEE;
  }
  return null;
}
```

- [ ] **Step 3: Kompilyatsiya sinovi**

Run: `npx tsc --noEmit`
Expected: 1-vazifadan qolgan ikki xatodan boshqa yangi xato yo'q.

- [ ] **Step 4: Commit**

```bash
git add src/modules/calls/domain
git commit -m "feat(calls): add call domain enums and entities"
```

---

## Task 4: Holat mashinasi

**Files:**
- Create: `src/modules/calls/domain/call-state-machine.ts`
- Test: `src/modules/calls/domain/call-state-machine.spec.ts`

**Interfaces:**
- Consumes: `CallStatus`, `CallEndReason` (Task 3)
- Produces:
  - `isTerminal(status: CallStatus): boolean`
  - `canTransition(from: CallStatus, to: CallStatus): boolean`
  - `isValidOutcome(status: CallStatus, reason: CallEndReason): boolean`
  - `LIVE_STATUSES: readonly CallStatus[]` — `[RINGING, CONNECTING, ACTIVE]`

- [ ] **Step 1: Yiqiladigan testni yozish**

`src/modules/calls/domain/call-state-machine.spec.ts`:

```ts
import { CallEndReason } from './enums/call-end-reason.enum';
import { CallStatus } from './enums/call-status.enum';
import { canTransition, isTerminal, isValidOutcome, LIVE_STATUSES } from './call-state-machine';

describe('call state machine', () => {
  describe('isTerminal', () => {
    it.each([CallStatus.ENDED, CallStatus.MISSED, CallStatus.DECLINED, CallStatus.FAILED, CallStatus.CANCELED])(
      '%s is terminal',
      (status) => expect(isTerminal(status)).toBe(true),
    );

    it.each(LIVE_STATUSES)('%s is not terminal', (status) => expect(isTerminal(status)).toBe(false));
  });

  describe('canTransition', () => {
    it('allows the happy path', () => {
      expect(canTransition(CallStatus.RINGING, CallStatus.CONNECTING)).toBe(true);
      expect(canTransition(CallStatus.CONNECTING, CallStatus.ACTIVE)).toBe(true);
      expect(canTransition(CallStatus.ACTIVE, CallStatus.ENDED)).toBe(true);
    });

    it('allows every live status to fail', () => {
      for (const from of LIVE_STATUSES) {
        expect(canTransition(from, CallStatus.FAILED)).toBe(true);
      }
    });

    it('allows ringing to be missed, declined or canceled', () => {
      expect(canTransition(CallStatus.RINGING, CallStatus.MISSED)).toBe(true);
      expect(canTransition(CallStatus.RINGING, CallStatus.DECLINED)).toBe(true);
      expect(canTransition(CallStatus.RINGING, CallStatus.CANCELED)).toBe(true);
    });

    // A repeated `call:end` is normal client behaviour — it must be ignored, not rejected loudly.
    it('never leaves a terminal status', () => {
      for (const from of [CallStatus.ENDED, CallStatus.MISSED, CallStatus.DECLINED, CallStatus.FAILED, CallStatus.CANCELED]) {
        for (const to of Object.values(CallStatus)) {
          expect(canTransition(from, to)).toBe(false);
        }
      }
    });

    it('rejects skipping CONNECTING', () => {
      expect(canTransition(CallStatus.RINGING, CallStatus.ACTIVE)).toBe(false);
    });

    it('rejects going backwards', () => {
      expect(canTransition(CallStatus.ACTIVE, CallStatus.RINGING)).toBe(false);
      expect(canTransition(CallStatus.CONNECTING, CallStatus.RINGING)).toBe(false);
    });

    // A call that was never answered cannot be "missed" after the callee picked up.
    it('rejects MISSED and DECLINED once the call moved past RINGING', () => {
      expect(canTransition(CallStatus.CONNECTING, CallStatus.MISSED)).toBe(false);
      expect(canTransition(CallStatus.ACTIVE, CallStatus.DECLINED)).toBe(false);
    });
  });

  describe('isValidOutcome', () => {
    it('accepts the pairs the product produces', () => {
      expect(isValidOutcome(CallStatus.ENDED, CallEndReason.HANGUP)).toBe(true);
      expect(isValidOutcome(CallStatus.ENDED, CallEndReason.TIMEOUT)).toBe(true);
      expect(isValidOutcome(CallStatus.MISSED, CallEndReason.TIMEOUT)).toBe(true);
      expect(isValidOutcome(CallStatus.DECLINED, CallEndReason.DECLINED)).toBe(true);
      expect(isValidOutcome(CallStatus.DECLINED, CallEndReason.BUSY)).toBe(true);
      expect(isValidOutcome(CallStatus.CANCELED, CallEndReason.CANCELED)).toBe(true);
      expect(isValidOutcome(CallStatus.FAILED, CallEndReason.FAILED)).toBe(true);
      expect(isValidOutcome(CallStatus.FAILED, CallEndReason.UNAUTHORIZED)).toBe(true);
    });

    // Four names appear in both enums; nothing else stops a contradictory pair being written,
    // and a year of analytics on contradictory rows cannot be recovered.
    it('rejects contradictory pairs', () => {
      expect(isValidOutcome(CallStatus.ENDED, CallEndReason.DECLINED)).toBe(false);
      expect(isValidOutcome(CallStatus.MISSED, CallEndReason.HANGUP)).toBe(false);
      expect(isValidOutcome(CallStatus.CANCELED, CallEndReason.HANGUP)).toBe(false);
      expect(isValidOutcome(CallStatus.DECLINED, CallEndReason.TIMEOUT)).toBe(false);
    });

    it('rejects a live status as an outcome', () => {
      expect(isValidOutcome(CallStatus.ACTIVE, CallEndReason.HANGUP)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `npx jest src/modules/calls/domain/call-state-machine.spec.ts`
Expected: FAIL — `Cannot find module './call-state-machine'`

- [ ] **Step 3: Implementatsiya**

`src/modules/calls/domain/call-state-machine.ts`:

```ts
import { CallEndReason } from './enums/call-end-reason.enum';
import { CallStatus } from './enums/call-status.enum';

/** Statuses a call can still move out of — also the predicate the reconciliation sweep uses. */
export const LIVE_STATUSES = [CallStatus.RINGING, CallStatus.CONNECTING, CallStatus.ACTIVE] as const;

const ALLOWED: Readonly<Record<CallStatus, readonly CallStatus[]>> = {
  [CallStatus.RINGING]: [
    CallStatus.CONNECTING,
    CallStatus.MISSED,
    CallStatus.DECLINED,
    CallStatus.CANCELED,
    CallStatus.FAILED,
  ],
  [CallStatus.CONNECTING]: [CallStatus.ACTIVE, CallStatus.FAILED, CallStatus.ENDED],
  [CallStatus.ACTIVE]: [CallStatus.ENDED, CallStatus.FAILED],
  // Terminal — a repeated `call:end` from a retrying client is ignored, not rejected.
  [CallStatus.ENDED]: [],
  [CallStatus.MISSED]: [],
  [CallStatus.DECLINED]: [],
  [CallStatus.FAILED]: [],
  [CallStatus.CANCELED]: [],
};

/**
 * Which `(status, endReason)` pairs may be written. Both enums carry the names DECLINED, FAILED,
 * CANCELED and TIMEOUT, so without this matrix nothing prevents `(ENDED, DECLINED)` — a row that
 * is meaningless and, once written, unrecoverable in aggregate.
 */
const OUTCOMES: Readonly<Partial<Record<CallStatus, readonly CallEndReason[]>>> = {
  [CallStatus.ENDED]: [CallEndReason.HANGUP, CallEndReason.TIMEOUT],
  [CallStatus.MISSED]: [CallEndReason.TIMEOUT],
  [CallStatus.DECLINED]: [CallEndReason.DECLINED, CallEndReason.BUSY],
  [CallStatus.CANCELED]: [CallEndReason.CANCELED],
  [CallStatus.FAILED]: [CallEndReason.FAILED, CallEndReason.UNAUTHORIZED],
};

export function isTerminal(status: CallStatus): boolean {
  return ALLOWED[status].length === 0;
}

export function canTransition(from: CallStatus, to: CallStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function isValidOutcome(status: CallStatus, reason: CallEndReason): boolean {
  return OUTCOMES[status]?.includes(reason) ?? false;
}
```

- [ ] **Step 4: Testni ishga tushirish**

Run: `npx jest src/modules/calls/domain/call-state-machine.spec.ts`
Expected: PASS — barcha testlar.

- [ ] **Step 5: Commit**

```bash
git add src/modules/calls/domain/call-state-machine.ts src/modules/calls/domain/call-state-machine.spec.ts
git commit -m "feat(calls): add call state machine with outcome matrix"
```

---

## Task 5: Glare hal qiluvchi (sof funksiya)

**Files:**
- Create: `src/modules/calls/domain/glare.ts`
- Test: `src/modules/calls/domain/glare.spec.ts`

**Interfaces:**
- Consumes: `CallStatus` (Task 3)
- Produces:
  - `interface GlareCall { callId: string; callerId: string; calleeId: string; status: CallStatus }`
  - `type GlareDecision = { kind: 'CLAIM' } | { kind: 'PREEMPT'; loserCallId: string } | { kind: 'BUSY' }`
  - `resolveGlare(incoming: GlareCall, callerHolder: GlareCall | null, calleeHolder: GlareCall | null): GlareDecision`

- [ ] **Step 1: Yiqiladigan testni yozish**

`src/modules/calls/domain/glare.spec.ts`:

```ts
import { CallStatus } from './enums/call-status.enum';
import { GlareCall, resolveGlare } from './glare';

const call = (callId: string, callerId: string, calleeId: string, status = CallStatus.RINGING): GlareCall => ({
  callId,
  callerId,
  calleeId,
  status,
});

describe('resolveGlare', () => {
  it('claims when both participants are free', () => {
    expect(resolveGlare(call('c5', 'A', 'B'), null, null)).toEqual({ kind: 'CLAIM' });
  });

  describe('true glare — the exact mirror pair, both still ringing', () => {
    // A→B and B→A crossed on the wire. The lexicographically smaller callId wins, so BOTH clients
    // reach the same conclusion without another round trip.
    it('preempts the mirror call when its id sorts higher', () => {
      const holder = call('c9', 'B', 'A');
      expect(resolveGlare(call('c1', 'A', 'B'), holder, holder)).toEqual({
        kind: 'PREEMPT',
        loserCallId: 'c9',
      });
    });

    it('yields when the mirror call id sorts lower', () => {
      const holder = call('c1', 'B', 'A');
      expect(resolveGlare(call('c9', 'A', 'B'), holder, holder)).toEqual({ kind: 'BUSY' });
    });
  });

  // ⚠️ Without the mirror-pair condition any connected third party could tear down a call they are
  // not in, just by minting a smaller id. That is not glare, it is an attack.
  it('never preempts a third party call, however its id sorts', () => {
    const holder = call('c1', 'A', 'B');
    expect(resolveGlare(call('c0', 'C', 'A'), holder, null)).toEqual({ kind: 'BUSY' });
    expect(resolveGlare(call('c0', 'C', 'B'), null, holder)).toEqual({ kind: 'BUSY' });
  });

  // ⚠️ Without the RINGING condition a new invite would tear down a conversation that was already
  // answered and is in progress.
  it.each([CallStatus.CONNECTING, CallStatus.ACTIVE])(
    'never preempts a mirror call that reached %s',
    (status) => {
      const holder = call('c9', 'B', 'A', status);
      expect(resolveGlare(call('c1', 'A', 'B'), holder, holder)).toEqual({ kind: 'BUSY' });
    },
  );

  it('is busy when the two keys are held by two different calls', () => {
    expect(resolveGlare(call('c1', 'A', 'B'), call('c2', 'A', 'X'), call('c3', 'Y', 'B'))).toEqual({
      kind: 'BUSY',
    });
  });

  it('is busy when only one participant is occupied', () => {
    expect(resolveGlare(call('c1', 'A', 'B'), call('c2', 'A', 'X'), null)).toEqual({ kind: 'BUSY' });
    expect(resolveGlare(call('c1', 'A', 'B'), null, call('c2', 'Y', 'B'))).toEqual({ kind: 'BUSY' });
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `npx jest src/modules/calls/domain/glare.spec.ts`
Expected: FAIL — `Cannot find module './glare'`

- [ ] **Step 3: Implementatsiya**

`src/modules/calls/domain/glare.ts`:

```ts
import { CallStatus } from './enums/call-status.enum';

/** The subset of a call the glare rule needs — both the incoming invite and any current holder. */
export interface GlareCall {
  callId: string;
  callerId: string;
  calleeId: string;
  status: CallStatus;
}

export type GlareDecision =
  | { kind: 'CLAIM' }
  | { kind: 'PREEMPT'; loserCallId: string }
  | { kind: 'BUSY' };

/**
 * Decides what an incoming `call:invite` may do when one or both participants are already marked
 * busy. Kept as a pure function so it can be unit-tested without Redis: the Lua script in
 * `call-state.redis.repository.ts` is a direct transcription of these three branches, and the two
 * must stay in step.
 *
 * "Glare" is the narrow case of A→B and B→A crossing on the wire. It is resolved by the
 * lexicographically smaller `callId` — a deterministic rule, so both clients agree without another
 * round trip (design §5.3). Two conditions make that rule safe:
 *
 *  - **mirror pair** — otherwise any connected third party could tear down a call by minting a
 *    smaller id;
 *  - **still RINGING** — otherwise a fresh invite would cut off a conversation already in progress.
 *
 * Everything else is BUSY.
 */
export function resolveGlare(
  incoming: GlareCall,
  callerHolder: GlareCall | null,
  calleeHolder: GlareCall | null,
): GlareDecision {
  if (callerHolder === null && calleeHolder === null) {
    return { kind: 'CLAIM' };
  }
  // A true mirror call occupies BOTH keys, because its caller is our callee and vice versa.
  if (callerHolder === null || calleeHolder === null || callerHolder.callId !== calleeHolder.callId) {
    return { kind: 'BUSY' };
  }
  const holder = callerHolder;
  const isMirror = holder.callerId === incoming.calleeId && holder.calleeId === incoming.callerId;
  if (!isMirror || holder.status !== CallStatus.RINGING || holder.callId <= incoming.callId) {
    return { kind: 'BUSY' };
  }
  return { kind: 'PREEMPT', loserCallId: holder.callId };
}
```

- [ ] **Step 4: Testni ishga tushirish**

Run: `npx jest src/modules/calls/domain/glare.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/calls/domain/glare.ts src/modules/calls/domain/glare.spec.ts
git commit -m "feat(calls): add pure glare resolver with mirror-pair and ringing guards"
```

---

## Task 6: Domen portlari va xato kodlari

**Files:**
- Create: `src/modules/calls/domain/call.repository.ts`, `call-state.repository.ts`, `call-timers.repository.ts`, `conversation-directory.repository.ts`, `student-directory.repository.ts`
- Modify: `src/common/errors/error-code.ts`, `src/modules/chat/domain/connection-check.repository.ts`, `src/modules/chat/infrastructure/connection-check.prisma.repository.ts`

**Interfaces:**
- Consumes: `Call`, `CallState`, `CallMedia`, `CallStatus`, `CallEndReason`, `CallParty` (Task 3); `GlareDecision` (Task 5)
- Produces: barcha portlar va ularning `Symbol` tokenlari (quyida to'liq), `ERROR_CODE.CALL_NOT_FOUND`, `CALL_BUSY`, `INVALID_CALL_STATE`, `ConnectionState` tipi va `connectionState()` metodi.

- [ ] **Step 1: Xato kodlarini qo'shish**

`src/common/errors/error-code.ts` da `// chat` bo'limidan keyin yangi bo'lim qo'shing:

```ts
  // calls
  CALL_NOT_FOUND: 'CALL_NOT_FOUND',
  CALL_BUSY: 'CALL_BUSY',
  INVALID_CALL_STATE: 'INVALID_CALL_STATE',
```

⚠️ `BLOCKED` **qo'shilmaydi** — mavjud `USER_BLOCKED` ishlatiladi. Bitta ma'no ikki kod bo'lmasin; spec §12.3.1 dagi nom bilan farqi mobil jamoaga aytiladi.

- [ ] **Step 2: `ConnectionCheckRepository` ni kengaytirish**

`src/modules/chat/domain/connection-check.repository.ts` ga qo'shing:

```ts
/** Why a pair may not talk — `areConnected` folds these into one boolean, calls need them apart. */
export type ConnectionState = 'CONNECTED' | 'NOT_CONNECTED' | 'BLOCKED';
```

va interfeysga metod:

```ts
  /**
   * Like `areConnected`, but distinguishes "no connection" from "blocked". A call must tell the
   * caller which one it is: `NOT_CONNECTED` is fixable by sending a request, `BLOCKED` is not.
   */
  connectionState(a: string, b: string): Promise<ConnectionState>;
```

- [ ] **Step 3: Implementatsiyani qo'shish**

`src/modules/chat/infrastructure/connection-check.prisma.repository.ts` ga `connectionState` ni qo'shing. Mavjud `areConnected` ni o'qing va **o'sha ikki so'rovni** qayta ishlating — blok tekshiruvini alohida ajrating:

```ts
  async connectionState(a: string, b: string): Promise<ConnectionState> {
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { blockerId: true },
    });
    if (blocked !== null) {
      return 'BLOCKED';
    }
    const connection = await this.prisma.connection.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      },
      select: { id: true },
    });
    return connection === null ? 'NOT_CONNECTED' : 'CONNECTED';
  }
```

⚠️ Maydon nomlarini (`blockerId`/`blockedId`, `requesterId`/`addresseeId`, `status`) **mavjud `areConnected` dan aynan nusxa oling** — sxemada boshqacha nomlangan bo'lishi mumkin.

- [ ] **Step 4: `call.repository.ts` portini yaratish**

```ts
import { Call } from './entities/call.entity';
import { CallEndReason } from './enums/call-end-reason.enum';
import { CallMedia } from './enums/call-media.enum';
import { CallParty } from './enums/call-party.enum';
import { CallStatus } from './enums/call-status.enum';

export const CALL_REPOSITORY = Symbol('CALL_REPOSITORY');

export interface CreateCallInput {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  media: CallMedia;
}

export interface FinishCallInput {
  status: CallStatus;
  endReason: CallEndReason;
  endedBy: CallParty | null;
}

export interface CallPage {
  items: Call[];
  total: number;
}

export interface CallRepository {
  create(input: CreateCallInput): Promise<Call>;

  findById(callId: string): Promise<Call | null>;

  /** `CONNECTING → ACTIVE`, stamping `answeredAt`. Returns false if the row already moved on. */
  markActive(callId: string): Promise<boolean>;

  /**
   * Terminal write. MUST be a conditional `UPDATE ... WHERE status IN (live)` — never
   * read-modify-write: a `call:accept` at 44.9s and the ring timeout at 45s race, and the timeout
   * must not stamp MISSED over a call that was answered. Returns `null` when the row had already
   * reached a terminal status, which is what makes a repeated `call:end` idempotent.
   */
  finish(callId: string, input: FinishCallInput): Promise<Call | null>;

  /** Newest first. Filters `callerId = me OR calleeId = me` in SQL, never in a mapper. */
  listForStudent(studentId: string, page: number, size: number): Promise<CallPage>;

  /**
   * Has this pair ever completed a call? Drives the relay policy: an unfamiliar pair is forced
   * through TURN so neither side learns the other's IP address (design §9.2).
   */
  hasCompletedCallBetween(a: string, b: string): Promise<boolean>;

  /** Reconciliation backstop — closes calls Redis or BullMQ lost. Returns rows changed. */
  expireStale(startedBefore: Date): Promise<number>;
}
```

- [ ] **Step 5: `call-state.repository.ts` portini yaratish**

```ts
import { CallState } from './entities/call.entity';
import { CallStatus } from './enums/call-status.enum';
import { GlareDecision } from './glare';

export const CALL_STATE_REPOSITORY = Symbol('CALL_STATE_REPOSITORY');

export interface CallStateRepository {
  /**
   * Atomically claim both participants' busy keys and write the live state. The whole decision runs
   * inside one Lua script so two simultaneous invites cannot both succeed — see `glare.ts` for the
   * rule this transcribes. On `PREEMPT` the losing call's keys have already been handed over; the
   * caller must close that call with BUSY.
   */
  claim(state: CallState): Promise<GlareDecision>;

  get(callId: string): Promise<CallState | null>;

  /**
   * Compare-and-set on status. Returns false when the call was not in one of `from` — this is what
   * makes "first accept wins" work across devices and instances.
   */
  compareAndSetStatus(
    callId: string,
    from: readonly CallStatus[],
    to: CallStatus,
    answeredAt?: string,
  ): Promise<boolean>;

  /** Drop the live state and both busy keys. Safe to call twice. */
  release(callId: string): Promise<void>;

  /** Refresh the participant-presence marker the disconnect grace timer reads. */
  markPresent(callId: string, studentId: string): Promise<void>;

  isPresent(callId: string, studentId: string): Promise<boolean>;

  clearPresent(callId: string, studentId: string): Promise<void>;
}
```

- [ ] **Step 6: Qolgan uch portni yaratish**

`call-timers.repository.ts`:

```ts
export const CALL_TIMERS = Symbol('CALL_TIMERS');

export type CallTimerKind = 'ring' | 'connect' | 'max' | 'grace';

export interface CallTimersRepository {
  /** Job ids are deterministic (`ring:{callId}`) so they can be cancelled by name. */
  schedule(kind: CallTimerKind, callId: string, delayMs: number, studentId?: string): Promise<void>;
  cancel(kind: CallTimerKind, callId: string, studentId?: string): Promise<void>;
  /** Called on every terminal transition — leaving 4-hour jobs behind fills Redis. */
  cancelAll(callId: string): Promise<void>;
}
```

`conversation-directory.repository.ts`:

```ts
export const CONVERSATION_DIRECTORY = Symbol('CONVERSATION_DIRECTORY');

export interface ConversationDirectoryRepository {
  /**
   * Resolve a pair to their 1:1 conversation, creating it if this is their first contact.
   *
   * The conversation is resolved **server-side from the pair** — a client-supplied
   * `conversationId` is ignored. Trusting it would let a caller name a conversation they are not a
   * member of, and the CALL message written when the call ends would land in two strangers' chat,
   * shifting their `seq` and their unread count (design §6.1.2).
   */
  findOrCreateDirect(a: string, b: string): Promise<string>;
}
```

`student-directory.repository.ts`:

```ts
export const CALL_STUDENT_DIRECTORY = Symbol('CALL_STUDENT_DIRECTORY');

/** What `call:incoming` shows on the callee's ringing screen. */
export interface CallerSummary {
  id: string;
  fullName: string;
  username: string | null;
  avatarUrl: string | null;
}

export interface StudentDirectoryRepository {
  summary(studentId: string): Promise<CallerSummary | null>;
}
```

- [ ] **Step 7: Kompilyatsiya va chat testlari**

Run: `npx tsc --noEmit && npx jest src/modules/chat --silent`
Expected: 1-vazifadan qolgan ikki xatodan boshqa yangi xato yo'q; chat testlari PASS. Agar `connection-check` uchun mock bo'lgan testlar `connectionState` yo'qligidan yiqilsa, mocklarga metodni qo'shing.

- [ ] **Step 8: Commit**

```bash
git add src/common/errors/error-code.ts src/modules/chat/domain src/modules/chat/infrastructure src/modules/calls/domain
git commit -m "feat(calls): add domain ports, call error codes and connectionState check"
```

---

## Task 7: Redis jonli holat repozitoriysi (Lua bilan)

**Files:**
- Modify: `src/infrastructure/cache/redis.service.ts`
- Create: `src/modules/calls/infrastructure/call-state.redis.repository.ts`
- Test: `src/modules/calls/infrastructure/call-state.redis.repository.spec.ts`

**Interfaces:**
- Consumes: `CallStateRepository`, `CALL_STATE_REPOSITORY` (Task 6); `resolveGlare` (Task 5)
- Produces: `RedisService.eval(script, keys, args): Promise<unknown>`; `CallStateRedisRepository` klassi.

- [ ] **Step 1: `RedisService` ga `eval` qo'shish**

`src/infrastructure/cache/redis.service.ts` ga, `delByPattern` dan oldin:

```ts
  /**
   * Run a Lua script server-side. The only way to make a multi-key decision atomic — the call
   * glare rule reads two `busy:` keys and writes three, and a two-command version would let two
   * simultaneous invites both conclude "the peer is free".
   *
   * Kept here rather than exposing the raw client: this file is the single place Redis is spoken to.
   */
  eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    return this.client.eval(script, keys.length, ...keys, ...args);
  }
```

- [ ] **Step 2: Yiqiladigan testni yozish**

Bu repozitoriy **integratsiya testini** talab qiladi — Lua Redis ichida ishlaydi, mock qilinmaydi. Sof qaror mantig'i 5-vazifada allaqachon qoplangan; bu yerda transkripsiya to'g'riligini tekshiramiz.

`src/modules/calls/infrastructure/call-state.redis.repository.spec.ts`:

```ts
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { CallState } from '../domain/entities/call.entity';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { CallStateRedisRepository } from './call-state.redis.repository';

// Integration: the glare decision lives in Lua, which cannot be mocked. Skipped unless a Redis is
// reachable, so `npm test` on a laptop without one still passes.
const REDIS_URL = process.env.TEST_REDIS_URL;
const describeIfRedis = REDIS_URL === undefined ? describe.skip : describe;

describeIfRedis('CallStateRedisRepository', () => {
  let redis: RedisService;
  let repo: CallStateRedisRepository;

  const state = (callId: string, callerId: string, calleeId: string): CallState => ({
    callId,
    conversationId: 'cnv1',
    callerId,
    calleeId,
    media: CallMedia.AUDIO,
    status: CallStatus.RINGING,
    startedAt: '2026-08-01T10:00:00.000Z',
    answeredAt: null,
  });

  beforeEach(async () => {
    redis = new RedisService({ get: () => REDIS_URL } as never);
    repo = new CallStateRedisRepository(redis);
    await redis.delByPattern('call:*');
    await redis.delByPattern('busy:*');
  });

  afterEach(async () => {
    await redis.onModuleDestroy();
  });

  it('claims a free pair and reads the state back', async () => {
    expect(await repo.claim(state('c1', 'A', 'B'))).toEqual({ kind: 'CLAIM' });
    expect(await repo.get('c1')).toMatchObject({ callerId: 'A', calleeId: 'B', status: CallStatus.RINGING });
  });

  it('refuses a second call to a busy callee', async () => {
    await repo.claim(state('c1', 'A', 'B'));
    expect(await repo.claim(state('c2', 'C', 'B'))).toEqual({ kind: 'BUSY' });
  });

  it('preempts the mirror call whose id sorts higher', async () => {
    await repo.claim(state('c9', 'B', 'A'));
    expect(await repo.claim(state('c1', 'A', 'B'))).toEqual({ kind: 'PREEMPT', loserCallId: 'c9' });
    // The winner now owns both keys.
    expect(await repo.claim(state('c2', 'C', 'A'))).toEqual({ kind: 'BUSY' });
  });

  it('does not preempt a third party', async () => {
    await repo.claim(state('c5', 'A', 'B'));
    expect(await repo.claim(state('c0', 'C', 'A'))).toEqual({ kind: 'BUSY' });
  });

  it('does not preempt a mirror call that is already connecting', async () => {
    await repo.claim(state('c9', 'B', 'A'));
    await repo.compareAndSetStatus('c9', [CallStatus.RINGING], CallStatus.CONNECTING);
    expect(await repo.claim(state('c1', 'A', 'B'))).toEqual({ kind: 'BUSY' });
  });

  it('lets only the first compareAndSetStatus win', async () => {
    await repo.claim(state('c1', 'A', 'B'));
    expect(await repo.compareAndSetStatus('c1', [CallStatus.RINGING], CallStatus.CONNECTING)).toBe(true);
    expect(await repo.compareAndSetStatus('c1', [CallStatus.RINGING], CallStatus.CONNECTING)).toBe(false);
  });

  it('frees both participants on release', async () => {
    await repo.claim(state('c1', 'A', 'B'));
    await repo.release('c1');
    expect(await repo.get('c1')).toBeNull();
    expect(await repo.claim(state('c2', 'C', 'B'))).toEqual({ kind: 'CLAIM' });
  });

  it('tracks participant presence', async () => {
    await repo.markPresent('c1', 'A');
    expect(await repo.isPresent('c1', 'A')).toBe(true);
    await repo.clearPresent('c1', 'A');
    expect(await repo.isPresent('c1', 'A')).toBe(false);
  });
});
```

- [ ] **Step 3: Testni ishga tushirib yiqilishini ko'rish**

Run: `TEST_REDIS_URL=redis://localhost:6379 npx jest src/modules/calls/infrastructure/call-state.redis.repository.spec.ts`
Expected: FAIL — `Cannot find module './call-state.redis.repository'`

(Redis bo'lmasa test `skip` bo'ladi — u holda avval `docker compose up -d redis` qiling.)

- [ ] **Step 4: Implementatsiya**

`src/modules/calls/infrastructure/call-state.redis.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { CallState } from '../domain/entities/call.entity';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { CallStateRepository } from '../domain/call-state.repository';
import { GlareDecision } from '../domain/glare';

/** Longer than the 4-hour call cap, so a lost cleanup expires instead of pinning a user forever. */
const CALL_TTL_SECONDS = 4 * 3600 + 900;
/**
 * A ringing call holds `busy:` only briefly. If the instance dies between "ringing" and "cleaned
 * up", the user is unreachable for a minute rather than four hours; it is extended on ACTIVE.
 */
const RINGING_BUSY_TTL_SECONDS = 60;
const PRESENCE_TTL_SECONDS = 60;

const callKey = (callId: string): string => `call:${callId}`;
const busyKey = (studentId: string): string => `busy:${studentId}`;
const presenceKey = (callId: string, studentId: string): string => `call:${callId}:present:${studentId}`;

/**
 * Atomic claim. A direct transcription of `resolveGlare` in `domain/glare.ts` — keep the two in
 * step; the pure version is the one under unit test.
 *
 * KEYS: busy:caller, busy:callee, call:{incomingId}
 * ARGV: incomingId, callerId, calleeId, conversationId, media, startedAt, callTtl, busyTtl
 * Returns: {"CLAIM"} | {"PREEMPT", loserCallId} | {"BUSY"}
 */
const CLAIM_SCRIPT = `
local callerHolderId = redis.call('GET', KEYS[1])
local calleeHolderId = redis.call('GET', KEYS[2])
local incomingId = ARGV[1]

local function write()
  redis.call('HSET', KEYS[3],
    'callId', incomingId, 'conversationId', ARGV[4],
    'callerId', ARGV[2], 'calleeId', ARGV[3],
    'media', ARGV[5], 'status', 'RINGING',
    'startedAt', ARGV[6], 'answeredAt', '')
  redis.call('EXPIRE', KEYS[3], ARGV[7])
  redis.call('SET', KEYS[1], incomingId, 'EX', ARGV[8])
  redis.call('SET', KEYS[2], incomingId, 'EX', ARGV[8])
end

if callerHolderId == false and calleeHolderId == false then
  write()
  return {'CLAIM'}
end

-- A true mirror call occupies BOTH keys: its caller is our callee and vice versa.
if callerHolderId == false or calleeHolderId == false or callerHolderId ~= calleeHolderId then
  return {'BUSY'}
end

local holder = redis.call('HMGET', 'call:' .. callerHolderId, 'callerId', 'calleeId', 'status')
local isMirror = holder[1] == ARGV[3] and holder[2] == ARGV[2]
if not isMirror or holder[3] ~= 'RINGING' or callerHolderId <= incomingId then
  return {'BUSY'}
end

write()
return {'PREEMPT', callerHolderId}
`;

/** CAS on status. KEYS: call:{id}; ARGV: to, answeredAt, then the allowed `from` values. */
const CAS_SCRIPT = `
local current = redis.call('HGET', KEYS[1], 'status')
if current == false then return 0 end
for i = 3, #ARGV do
  if ARGV[i] == current then
    redis.call('HSET', KEYS[1], 'status', ARGV[1])
    if ARGV[2] ~= '' then redis.call('HSET', KEYS[1], 'answeredAt', ARGV[2]) end
    return 1
  end
end
return 0
`;

@Injectable()
export class CallStateRedisRepository implements CallStateRepository {
  constructor(private readonly redis: RedisService) {}

  async claim(state: CallState): Promise<GlareDecision> {
    const result = (await this.redis.eval(
      CLAIM_SCRIPT,
      [busyKey(state.callerId), busyKey(state.calleeId), callKey(state.callId)],
      [
        state.callId,
        state.callerId,
        state.calleeId,
        state.conversationId,
        state.media,
        state.startedAt,
        String(CALL_TTL_SECONDS),
        String(RINGING_BUSY_TTL_SECONDS),
      ],
    )) as [string, string?];

    if (result[0] === 'CLAIM') {
      return { kind: 'CLAIM' };
    }
    if (result[0] === 'PREEMPT') {
      return { kind: 'PREEMPT', loserCallId: result[1] as string };
    }
    return { kind: 'BUSY' };
  }

  async get(callId: string): Promise<CallState | null> {
    const raw = await this.redis.hgetall(callKey(callId));
    if (raw.callId === undefined) {
      return null;
    }
    return {
      callId: raw.callId,
      conversationId: raw.conversationId ?? '',
      callerId: raw.callerId ?? '',
      calleeId: raw.calleeId ?? '',
      media: raw.media as CallMedia,
      status: raw.status as CallStatus,
      startedAt: raw.startedAt ?? '',
      answeredAt: raw.answeredAt === undefined || raw.answeredAt === '' ? null : raw.answeredAt,
    };
  }

  async compareAndSetStatus(
    callId: string,
    from: readonly CallStatus[],
    to: CallStatus,
    answeredAt = '',
  ): Promise<boolean> {
    const changed = (await this.redis.eval(
      CAS_SCRIPT,
      [callKey(callId)],
      [to, answeredAt, ...from],
    )) as number;
    if (changed === 1 && to === CallStatus.ACTIVE) {
      // The call was answered — it may now run for hours, so the busy markers must outlive the
      // short ringing TTL.
      const state = await this.get(callId);
      if (state !== null) {
        await this.redis.expire(busyKey(state.callerId), CALL_TTL_SECONDS);
        await this.redis.expire(busyKey(state.calleeId), CALL_TTL_SECONDS);
      }
    }
    return changed === 1;
  }

  async release(callId: string): Promise<void> {
    const state = await this.get(callId);
    if (state !== null) {
      // Only clear a busy key that still points at THIS call — a preempting mirror call may already
      // own it, and blindly deleting would leave the winner unreachable.
      await this.releaseBusyIfMine(state.callerId, callId);
      await this.releaseBusyIfMine(state.calleeId, callId);
      await this.redis.del(presenceKey(callId, state.callerId));
      await this.redis.del(presenceKey(callId, state.calleeId));
    }
    await this.redis.del(callKey(callId));
  }

  private async releaseBusyIfMine(studentId: string, callId: string): Promise<void> {
    if ((await this.redis.get(busyKey(studentId))) === callId) {
      await this.redis.del(busyKey(studentId));
    }
  }

  async markPresent(callId: string, studentId: string): Promise<void> {
    await this.redis.set(presenceKey(callId, studentId), '1', PRESENCE_TTL_SECONDS);
  }

  isPresent(callId: string, studentId: string): Promise<boolean> {
    return this.redis.exists(presenceKey(callId, studentId));
  }

  async clearPresent(callId: string, studentId: string): Promise<void> {
    await this.redis.del(presenceKey(callId, studentId));
  }
}
```

- [ ] **Step 5: Testni ishga tushirish**

Run: `TEST_REDIS_URL=redis://localhost:6379 npx jest src/modules/calls/infrastructure/call-state.redis.repository.spec.ts`
Expected: PASS — sakkizta test.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/cache/redis.service.ts src/modules/calls/infrastructure/call-state.redis.repository.ts src/modules/calls/infrastructure/call-state.redis.repository.spec.ts
git commit -m "feat(calls): add Redis live call state with atomic Lua glare claim"
```

---

## Task 8: Postgres qo'ng'iroq repozitoriysi

**Files:**
- Create: `src/modules/calls/infrastructure/call.mapper.ts`, `src/modules/calls/infrastructure/call.prisma.repository.ts`
- Test: `src/modules/calls/infrastructure/call.mapper.spec.ts`

**Interfaces:**
- Consumes: `CallRepository`, `CALL_REPOSITORY`, `CreateCallInput`, `FinishCallInput`, `CallPage` (Task 6)
- Produces: `toDomainCall(row): Call` — `call.mapper.ts`; `CallPrismaRepository` klassi.

- [ ] **Step 1: Mapper testini yozish**

`src/modules/calls/infrastructure/call.mapper.spec.ts`:

```ts
import { CallStatus } from '../domain/enums/call-status.enum';
import { durationMsOf } from '../domain/entities/call.entity';

describe('durationMsOf', () => {
  it('measures from answer to end', () => {
    expect(
      durationMsOf({
        answeredAt: new Date('2026-08-01T10:00:00.000Z'),
        endedAt: new Date('2026-08-01T10:03:04.000Z'),
      }),
    ).toBe(184_000);
  });

  // A missed or declined call has no conversation to measure; the DTO field is non-null, so 0.
  it('is zero when the call was never answered', () => {
    expect(durationMsOf({ answeredAt: null, endedAt: new Date() })).toBe(0);
  });

  it('is zero while the call is still running', () => {
    expect(durationMsOf({ answeredAt: new Date(), endedAt: null })).toBe(0);
  });
});
```

- [ ] **Step 2: Testni ishga tushirish**

Run: `npx jest src/modules/calls/infrastructure/call.mapper.spec.ts`
Expected: PASS — `durationMsOf` 3-vazifada yozilgan.

- [ ] **Step 3: Mapper va repozitoriyni yozish**

`src/modules/calls/infrastructure/call.mapper.ts`:

```ts
import type { Call as PrismaCall } from '@prisma/client';
import { Call } from '../domain/entities/call.entity';
import { CallEndReason } from '../domain/enums/call-end-reason.enum';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallParty } from '../domain/enums/call-party.enum';
import { CallStatus } from '../domain/enums/call-status.enum';

/** Prisma row → domain object. Keeps the generated client out of application and domain code. */
export function toDomainCall(row: PrismaCall): Call {
  return {
    id: row.id,
    conversationId: row.conversationId,
    callerId: row.callerId,
    calleeId: row.calleeId,
    media: row.media as CallMedia,
    status: row.status as CallStatus,
    startedAt: row.startedAt,
    answeredAt: row.answeredAt,
    endedAt: row.endedAt,
    endReason: row.endReason === null ? null : (row.endReason as CallEndReason),
    endedBy: row.endedBy === null ? null : (row.endedBy as CallParty),
  };
}
```

`src/modules/calls/infrastructure/call.prisma.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { LIVE_STATUSES } from '../domain/call-state-machine';
import { CallPage, CallRepository, CreateCallInput, FinishCallInput } from '../domain/call.repository';
import { Call } from '../domain/entities/call.entity';
import { CallEndReason } from '../domain/enums/call-end-reason.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { toDomainCall } from './call.mapper';

@Injectable()
export class CallPrismaRepository implements CallRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCallInput): Promise<Call> {
    const row = await this.prisma.call.create({
      data: {
        id: input.id,
        conversationId: input.conversationId,
        callerId: input.callerId,
        calleeId: input.calleeId,
        media: input.media,
        status: CallStatus.RINGING,
      },
    });
    return toDomainCall(row);
  }

  async findById(callId: string): Promise<Call | null> {
    const row = await this.prisma.call.findUnique({ where: { id: callId } });
    return row === null ? null : toDomainCall(row);
  }

  async markActive(callId: string): Promise<boolean> {
    const { count } = await this.prisma.call.updateMany({
      where: { id: callId, status: CallStatus.CONNECTING },
      data: { status: CallStatus.ACTIVE, answeredAt: new Date() },
    });
    return count === 1;
  }

  /**
   * Conditional by design. `call:accept` at 44.9s and the ring timeout at 45s race each other; a
   * read-modify-write would let the timeout stamp MISSED over a call that had just been answered.
   * The same guard makes a repeated `call:end` a no-op at the database layer.
   */
  async finish(callId: string, input: FinishCallInput): Promise<Call | null> {
    const endedAt = new Date();
    const { count } = await this.prisma.call.updateMany({
      where: { id: callId, status: { in: [...LIVE_STATUSES] } },
      data: {
        status: input.status,
        endReason: input.endReason,
        endedBy: input.endedBy,
        endedAt,
      },
    });
    if (count === 0) {
      return null;
    }
    return this.findById(callId);
  }

  /**
   * `WHERE caller_id = $1 OR callee_id = $1 ORDER BY started_at DESC` makes Postgres BitmapOr the
   * two indexes and then sort — the `started_at` half of each composite index goes unused. Two
   * ordered index scans merged with UNION ALL keep the plan on the indexes; the outer sort then
   * runs over at most 2×(page·size) rows instead of the whole history.
   */
  async listForStudent(studentId: string, page: number, size: number): Promise<CallPage> {
    const take = page * size;
    const skip = (page - 1) * size;
    const [rows, total] = await Promise.all([
      this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT * FROM (
          (SELECT * FROM "calls" WHERE "caller_id" = ${studentId} ORDER BY "started_at" DESC LIMIT ${take})
          UNION ALL
          (SELECT * FROM "calls" WHERE "callee_id" = ${studentId} ORDER BY "started_at" DESC LIMIT ${take})
        ) AS merged
        ORDER BY "started_at" DESC
        LIMIT ${size} OFFSET ${skip}
      `),
      this.prisma.call.count({
        where: { OR: [{ callerId: studentId }, { calleeId: studentId }] },
      }),
    ]);
    return { items: rows.map((row) => toDomainCall(fromSnakeCase(row))), total };
  }

  async hasCompletedCallBetween(a: string, b: string): Promise<boolean> {
    const found = await this.prisma.call.findFirst({
      where: {
        status: CallStatus.ENDED,
        OR: [
          { callerId: a, calleeId: b },
          { callerId: b, calleeId: a },
        ],
      },
      select: { id: true },
    });
    return found !== null;
  }

  async expireStale(startedBefore: Date): Promise<number> {
    const { count } = await this.prisma.call.updateMany({
      where: { status: { in: [...LIVE_STATUSES] }, startedAt: { lt: startedBefore } },
      data: { status: CallStatus.FAILED, endReason: CallEndReason.FAILED, endedAt: new Date() },
    });
    return count;
  }
}

/** `$queryRaw` returns the physical column names; the mapper expects the Prisma field names. */
function fromSnakeCase(row: Record<string, unknown>): never {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    callerId: row.caller_id,
    calleeId: row.callee_id,
    media: row.media,
    status: row.status,
    startedAt: row.started_at,
    answeredAt: row.answered_at,
    endedAt: row.ended_at,
    endReason: row.end_reason,
    endedBy: row.ended_by,
  } as never;
}
```

⚠️ `PrismaService` import yo'lini `src/modules/chat/infrastructure/chat.prisma.repository.ts` dagi bilan solishtirib to'g'rilang.

- [ ] **Step 4: Kompilyatsiya**

Run: `npx tsc --noEmit`
Expected: 1-vazifadan qolgan ikki xatodan boshqa yangi xato yo'q.

- [ ] **Step 5: Commit**

```bash
git add src/modules/calls/infrastructure/call.mapper.ts src/modules/calls/infrastructure/call.mapper.spec.ts src/modules/calls/infrastructure/call.prisma.repository.ts
git commit -m "feat(calls): add Prisma call repository with conditional terminal writes"
```

---

## Task 9: BullMQ taymerlari

**Files:**
- Create: `src/modules/calls/infrastructure/call-timers.queue.ts`
- Test: `src/modules/calls/infrastructure/call-timers.queue.spec.ts`

**Interfaces:**
- Consumes: `CallTimersRepository`, `CALL_TIMERS`, `CallTimerKind` (Task 6)
- Produces: `CallTimersQueue` klassi; `jobIdFor(kind, callId, studentId?): string`; `CallTimerHandler` tipi — `(kind: CallTimerKind, callId: string, studentId: string | null) => Promise<void>`.

- [ ] **Step 1: Job id testini yozish**

`src/modules/calls/infrastructure/call-timers.queue.spec.ts`:

```ts
import { jobIdFor } from './call-timers.queue';

describe('jobIdFor', () => {
  // Deterministic ids are the whole mechanism for cancelling a timer when a call ends normally.
  it('is stable for the same input', () => {
    expect(jobIdFor('ring', 'c1')).toBe('ring:c1');
    expect(jobIdFor('ring', 'c1')).toBe(jobIdFor('ring', 'c1'));
  });

  it('separates the kinds of a single call', () => {
    expect(jobIdFor('ring', 'c1')).not.toBe(jobIdFor('connect', 'c1'));
    expect(jobIdFor('max', 'c1')).not.toBe(jobIdFor('connect', 'c1'));
  });

  // A call has two participants, so grace is per participant — one id per side.
  it('separates grace timers per participant', () => {
    expect(jobIdFor('grace', 'c1', 'A')).toBe('grace:c1:A');
    expect(jobIdFor('grace', 'c1', 'A')).not.toBe(jobIdFor('grace', 'c1', 'B'));
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `npx jest src/modules/calls/infrastructure/call-timers.queue.spec.ts`
Expected: FAIL — `Cannot find module './call-timers.queue'`

- [ ] **Step 3: Implementatsiya**

`src/modules/calls/infrastructure/call-timers.queue.ts` — `media.queue.ts` naqshini takrorlaydi (o'z IORedis ulanishi, `maxRetriesPerRequest: null`, Redis'siz muhitda ogohlantirish):

```ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { Env } from '../../../config/env';
import { CallTimerKind, CallTimersRepository } from '../domain/call-timers.repository';

const QUEUE_NAME = 'call-timers';
const JOB_NAME = 'timer';

/** What the worker calls when a timer fires. Registered by `CallsService` at module init. */
export type CallTimerHandler = (
  kind: CallTimerKind,
  callId: string,
  studentId: string | null,
) => Promise<void>;

export function jobIdFor(kind: CallTimerKind, callId: string, studentId?: string): string {
  return studentId === undefined ? `${kind}:${callId}` : `${kind}:${callId}:${studentId}`;
}

/**
 * Delayed jobs that close a call nobody closed: 45s ring, 30s connect, 4h cap, 20s disconnect
 * grace (design §5.2).
 *
 * Cancellation is by deterministic job id, but a fired job is ALSO a no-op when the call has moved
 * on — both are needed. The id is the mechanism; the no-op is what saves a call whose cancel was
 * lost with the instance that scheduled it.
 */
@Injectable()
export class CallTimersQueue implements CallTimersRepository, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CallTimersQueue.name);
  private readonly redisUrl: string | undefined;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: IORedis | null = null;
  private handler: CallTimerHandler | null = null;

  constructor(config: ConfigService<Env, true>) {
    this.redisUrl = config.get('REDIS_URL', { infer: true });
  }

  /** `CallsService` registers itself here — the queue must not import the service (cycle). */
  register(handler: CallTimerHandler): void {
    this.handler = handler;
  }

  onModuleInit(): void {
    if (this.redisUrl === undefined || this.redisUrl.length === 0) {
      this.logger.error(
        'REDIS_URL is not set — call timers are disabled. A call nobody hangs up will ring forever ' +
          'and the reconciliation cron will be the only thing that closes it.',
      );
      return;
    }
    this.connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    this.connection.on('error', (error) =>
      this.logger.error(`Call timers Redis error: ${error.message}`),
    );
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const { kind, callId, studentId } = job.data as {
          kind: CallTimerKind;
          callId: string;
          studentId: string | null;
        };
        await this.handler?.(kind, callId, studentId);
      },
      { connection: this.connection, concurrency: 8 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Call timer ${job?.id ?? '?'} failed: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit().catch(() => undefined);
  }

  async schedule(
    kind: CallTimerKind,
    callId: string,
    delayMs: number,
    studentId?: string,
  ): Promise<void> {
    const jobId = jobIdFor(kind, callId, studentId);
    // Re-arming replaces the old job — a reconnect must restart the grace window, not stack on it.
    await this.cancelById(jobId);
    await this.queue?.add(
      JOB_NAME,
      { kind, callId, studentId: studentId ?? null },
      { jobId, delay: delayMs, removeOnComplete: true, removeOnFail: 50 },
    );
  }

  async cancel(kind: CallTimerKind, callId: string, studentId?: string): Promise<void> {
    await this.cancelById(jobIdFor(kind, callId, studentId));
  }

  /**
   * Every timer of a call, dropped on the terminal transition. Without this, ten declined calls a
   * minute leave 4-hour jobs resident in the same Redis that holds OTP state and the Socket.IO
   * adapter.
   */
  async cancelAll(callId: string): Promise<void> {
    const state = await this.queue?.getJob(jobIdFor('ring', callId));
    void state;
    for (const kind of ['ring', 'connect', 'max'] as const) {
      await this.cancelById(jobIdFor(kind, callId));
    }
    // Grace ids carry a studentId; they are removed by the caller, which knows both participants.
  }

  private async cancelById(jobId: string): Promise<void> {
    const job = await this.queue?.getJob(jobId);
    await job?.remove().catch(() => undefined);
  }
}
```

⚠️ `cancelAll` da `grace:` joblari qolmasin: `CallsService` terminal o'tishda ikkala ishtirokchi uchun `cancel('grace', callId, studentId)` ni alohida chaqiradi (12-vazifada).

- [ ] **Step 4: Testni ishga tushirish**

Run: `npx jest src/modules/calls/infrastructure/call-timers.queue.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/calls/infrastructure/call-timers.queue.ts src/modules/calls/infrastructure/call-timers.queue.spec.ts
git commit -m "feat(calls): add BullMQ call timers with deterministic job ids"
```

---

## Task 10: TURN hisobi va env o'zgaruvchilari

**Files:**
- Create: `src/modules/calls/infrastructure/ice-credentials.ts`
- Test: `src/modules/calls/infrastructure/ice-credentials.spec.ts`
- Modify: `src/config/env.ts`, `.env.example`

**Interfaces:**
- Produces:
  - `buildIceCredential(secret: string, studentId: string, ttlSeconds: number, nowMs: number): { username: string; credential: string }`
  - `buildIceServers(host: string, cred: {username,credential}): IceServer[]`, `interface IceServer { urls: string[]; username?: string; credential?: string }`
  - Env: `TURN_HOST`, `TURN_STATIC_SECRET`, `TURN_TTL_SECONDS`

- [ ] **Step 1: Yiqiladigan testni yozish**

`src/modules/calls/infrastructure/ice-credentials.spec.ts`:

```ts
import { createHmac } from 'node:crypto';
import { buildIceCredential, buildIceServers } from './ice-credentials';

describe('buildIceCredential', () => {
  const SECRET = 'test-secret';
  const NOW = 1_785_308_400_000; // 2026-07-28T00:20:00Z

  it('encodes expiry and student id in the username', () => {
    const { username } = buildIceCredential(SECRET, 'std_1', 3600, NOW);
    expect(username).toBe(`${NOW / 1000 + 3600}:std_1`);
  });

  // coturn's `use-auth-secret` scheme (draft-uberti-behave-turn-rest-00) accepts nothing else —
  // HMAC-SHA1, base64. SHA-1 collision weaknesses do not apply to HMAC; do not "upgrade" this.
  it('is base64 HMAC-SHA1 of the username', () => {
    const { username, credential } = buildIceCredential(SECRET, 'std_1', 3600, NOW);
    expect(credential).toBe(createHmac('sha1', SECRET).update(username).digest('base64'));
  });

  it('changes when the student changes', () => {
    const a = buildIceCredential(SECRET, 'std_1', 3600, NOW);
    const b = buildIceCredential(SECRET, 'std_2', 3600, NOW);
    expect(a.credential).not.toBe(b.credential);
  });
});

describe('buildIceServers', () => {
  const cred = { username: 'u', credential: 'c' };

  it('offers STUN plus UDP, TCP and TLS TURN', () => {
    const servers = buildIceServers('turn.elonuz.uz', cred);
    const urls = servers.flatMap((s) => s.urls);
    expect(urls).toContain('stun:turn.elonuz.uz:3478');
    expect(urls).toContain('turn:turn.elonuz.uz:3478?transport=udp');
    expect(urls).toContain('turn:turn.elonuz.uz:3478?transport=tcp');
    // 443/TLS is not optional: students call from university Wi-Fi where only 443 is open, and
    // without it a share of calls never connect at all.
    expect(urls).toContain('turns:turn.elonuz.uz:443?transport=tcp');
  });

  it('attaches credentials only to the TURN entry', () => {
    const [stun, turn] = buildIceServers('turn.elonuz.uz', cred);
    expect(stun.username).toBeUndefined();
    expect(turn.username).toBe('u');
    expect(turn.credential).toBe('c');
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `npx jest src/modules/calls/infrastructure/ice-credentials.spec.ts`
Expected: FAIL — `Cannot find module './ice-credentials'`

- [ ] **Step 3: Implementatsiya**

`src/modules/calls/infrastructure/ice-credentials.ts`:

```ts
import { createHmac } from 'node:crypto';

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

/**
 * A short-lived TURN account, per coturn's `use-auth-secret` REST scheme
 * (draft-uberti-behave-turn-rest-00). The username carries its own expiry, so coturn validates it
 * without any shared state with us.
 *
 * ⚠️ This is a bearer capability for relay bandwidth — it is not tied to a call or a peer. Anyone
 * holding it can relay traffic until it expires, which is why the TTL is an hour, the student id is
 * embedded (coturn's `user-quota` is per username), and the endpoint that issues it is throttled.
 *
 * HMAC-SHA1 is the protocol, not a choice: coturn accepts nothing else. SHA-1's collision
 * weaknesses do not apply to HMAC, which needs only PRF security.
 */
export function buildIceCredential(
  secret: string,
  studentId: string,
  ttlSeconds: number,
  nowMs: number,
): { username: string; credential: string } {
  const username = `${Math.floor(nowMs / 1000) + ttlSeconds}:${studentId}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential };
}

export function buildIceServers(
  host: string,
  cred: { username: string; credential: string },
): IceServer[] {
  return [
    { urls: [`stun:${host}:3478`] },
    {
      urls: [
        `turn:${host}:3478?transport=udp`,
        `turn:${host}:3478?transport=tcp`,
        // Restrictive networks (university Wi-Fi, corporate proxies) usually leave only 443 open.
        `turns:${host}:443?transport=tcp`,
      ],
      username: cred.username,
      credential: cred.credential,
    },
  ];
}
```

- [ ] **Step 4: Env o'zgaruvchilarini qo'shish**

`src/config/env.ts` sxemasiga:

```ts
  TURN_HOST: z.string().optional(),
  TURN_STATIC_SECRET: z.string().optional(),
  TURN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
```

⚠️ **`.default('change-me')` ishlatmang.** `JWT_ACCESS_SECRET: z.string().min(1).default('change-me-access')` (`env.ts:24`) — o'zgaruvchini unutgan production hammaga ma'lum kalit bilan ko'tariladi. Buni takrorlamang: `.optional()` qiling va mavjud `superRefine` bloki (`env.ts:96`) ga qo'shing:

```ts
  if (value.NODE_ENV === 'production') {
    if (value.TURN_HOST === undefined || value.TURN_STATIC_SECRET === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'TURN_HOST and TURN_STATIC_SECRET are required in production — without them ' +
          'GET /v1/calls/ice-servers returns nothing usable and calls behind NAT never connect.',
      });
    }
  }
```

`.env.example` ga izoh bilan:

```bash
# ── Calls / TURN ──────────────────────────────────────────────────────────────
# coturn host (see deploy/coturn/README.md). TURN_STATIC_SECRET must equal coturn's
# `static-auth-secret`. Required in production — the app refuses to boot without them.
TURN_HOST=
TURN_STATIC_SECRET=
TURN_TTL_SECONDS=3600
```

- [ ] **Step 5: Testni ishga tushirish**

Run: `npx jest src/modules/calls/infrastructure/ice-credentials.spec.ts && npx tsc --noEmit`
Expected: testlar PASS; tsc'da 1-vazifadan qolgan ikki xatodan boshqasi yo'q.

- [ ] **Step 6: Commit**

```bash
git add src/modules/calls/infrastructure/ice-credentials.ts src/modules/calls/infrastructure/ice-credentials.spec.ts src/config/env.ts .env.example
git commit -m "feat(calls): add coturn ICE credential builder and TURN env config"
```

---

## Task 11: Chastota chegaralagichi

**Files:**
- Create: `src/modules/calls/application/call-rate-limiter.ts`
- Test: `src/modules/calls/application/call-rate-limiter.spec.ts`

**Interfaces:**
- Consumes: `RedisService`
- Produces: `CallRateLimiter` klassi; `checkInvite(callerId: string, calleeId: string): Promise<void>` — chegara oshsa `AppException` (429, `RATE_LIMITED`); `countUnanswered(callerId: string, calleeId: string): Promise<void>`.

- [ ] **Step 1: Yiqiladigan testni yozish**

`src/modules/calls/application/call-rate-limiter.spec.ts`:

```ts
import { AppException } from '../../../common/exceptions/app.exception';
import { CallRateLimiter } from './call-rate-limiter';

describe('CallRateLimiter', () => {
  const counters = new Map<string, number>();
  const redis = {
    incr: jest.fn(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    expire: jest.fn(async () => undefined),
  };
  const limiter = new CallRateLimiter(redis as never);

  beforeEach(() => counters.clear());

  it('allows a call under both limits', async () => {
    await expect(limiter.checkInvite('A', 'B')).resolves.toBeUndefined();
  });

  it('rejects the eleventh invite in a minute', async () => {
    for (let i = 0; i < 10; i += 1) {
      await limiter.checkInvite('A', `peer${i}`);
    }
    await expect(limiter.checkInvite('A', 'peer10')).rejects.toBeInstanceOf(AppException);
  });

  // The global 10/min still permits ~600 rings an hour at one victim. The pair limit is the one
  // that actually stops harassment.
  it('rejects a fourth unanswered invite to the same person', async () => {
    for (let i = 0; i < 3; i += 1) {
      await limiter.countUnanswered('A', 'B');
    }
    await expect(limiter.checkInvite('A', 'B')).rejects.toMatchObject({ status: 429 });
  });

  it('keeps pair budgets separate', async () => {
    for (let i = 0; i < 3; i += 1) {
      await limiter.countUnanswered('A', 'B');
    }
    await expect(limiter.checkInvite('A', 'C')).resolves.toBeUndefined();
  });

  it('is directional — B may still call A', async () => {
    for (let i = 0; i < 3; i += 1) {
      await limiter.countUnanswered('A', 'B');
    }
    await expect(limiter.checkInvite('B', 'A')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `npx jest src/modules/calls/application/call-rate-limiter.spec.ts`
Expected: FAIL — `Cannot find module './call-rate-limiter'`

- [ ] **Step 3: Implementatsiya**

```ts
import { Injectable } from '@nestjs/common';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import { RedisService } from '../../../infrastructure/cache/redis.service';

const GLOBAL_LIMIT = 10;
const GLOBAL_WINDOW_SECONDS = 60;
/** Unanswered invites to one person before a cooldown — the anti-harassment limit. */
const PAIR_LIMIT = 3;
const PAIR_WINDOW_SECONDS = 15 * 60;

/**
 * Two layers, because one is not enough. The global 10-per-minute cap from the source spec still
 * permits roughly 600 rings an hour aimed at a single person; the per-pair budget is what stops
 * repeat ringing. A CANCELED invite counts against the pair budget too, otherwise an
 * invite→cancel loop is free — and in phase 2 each loop wakes a locked phone with a full-screen
 * CallKit ring.
 *
 * `@nestjs/throttler` cannot do this: it is HTTP/IP-scoped and never sees a `@SubscribeMessage`.
 */
@Injectable()
export class CallRateLimiter {
  constructor(private readonly redis: RedisService) {}

  async checkInvite(callerId: string, calleeId: string): Promise<void> {
    const global = await this.bump(
      `calls:rate:${callerId}:${Math.floor(Date.now() / 1000 / GLOBAL_WINDOW_SECONDS)}`,
      GLOBAL_WINDOW_SECONDS,
    );
    if (global > GLOBAL_LIMIT) {
      throw new AppException(
        ERROR_CODE.RATE_LIMITED,
        429,
        'Juda ko‘p qo‘ng‘iroq qildingiz. Biroz kuting.',
      );
    }
    const pair = await this.redis.incr(this.pairKey(callerId, calleeId));
    await this.redis.expire(this.pairKey(callerId, calleeId), PAIR_WINDOW_SECONDS);
    // `incr` returns the value after this read-only probe, so allow up to LIMIT + 1.
    if (pair > PAIR_LIMIT + 1) {
      throw new AppException(
        ERROR_CODE.RATE_LIMITED,
        429,
        'Bu foydalanuvchi javob bermayapti. Keyinroq urinib ko‘ring.',
      );
    }
  }

  /** Called when a call ends without being answered — MISSED, DECLINED or CANCELED. */
  async countUnanswered(callerId: string, calleeId: string): Promise<void> {
    await this.bump(this.pairKey(callerId, calleeId), PAIR_WINDOW_SECONDS);
  }

  private pairKey(callerId: string, calleeId: string): string {
    return `calls:pair:${callerId}:${calleeId}`;
  }

  private async bump(key: string, ttlSeconds: number): Promise<number> {
    const value = await this.redis.incr(key);
    await this.redis.expire(key, ttlSeconds);
    return value;
  }
}
```

⚠️ `checkInvite` ning juftlik hisobi **probe** — u ham `incr` qiladi, shuning uchun chegara `PAIR_LIMIT + 1`. Testni ishga tushirib aniq chegarani moslang; agar yiqilsa `checkInvite` da `incr` o'rniga `get` ishlatib, hisobni faqat `countUnanswered` da oshiring va `RedisService` ga `get` allaqachon bor.

- [ ] **Step 4: Testni ishga tushirish**

Run: `npx jest src/modules/calls/application/call-rate-limiter.spec.ts`
Expected: PASS — beshta test.

- [ ] **Step 5: Commit**

```bash
git add src/modules/calls/application/call-rate-limiter.ts src/modules/calls/application/call-rate-limiter.spec.ts
git commit -m "feat(calls): add global and per-pair call rate limits"
```

---

## Task 12: `CallsService` — taklif (invite)

**Files:**
- Create: `src/modules/calls/application/call-events.ts`, `src/modules/calls/application/calls.service.ts`
- Test: `src/modules/calls/application/calls.service.invite.spec.ts`

**Interfaces:**
- Consumes: barcha portlar (Task 6), `resolveGlare` (5), `CallRateLimiter` (11)
- Produces:
  - `CALL_EVENT` konstantasi (16 hodisa nomi)
  - `CallsService.invite(callerId, input): Promise<InviteResult>` — `interface InviteInput { calleeId: string; media: CallMedia; sdp: string }`, `interface InviteResult { callId: string; expiresAt: string; conversationId: string; caller: CallerSummary; relayOnly: boolean }`
  - `RING_TIMEOUT_MS = 45_000`, `CONNECT_TIMEOUT_MS = 30_000`, `MAX_DURATION_MS = 4*3600_000`, `DISCONNECT_GRACE_MS = 20_000`

- [ ] **Step 1: Hodisa nomlarini yozish**

`src/modules/calls/application/call-events.ts`:

```ts
/** `/calls` wire protocol. 15 events from the source spec §12.1 plus `call:connected` (design §5.1). */
export const CALL_EVENT = {
  INVITE: 'call:invite',
  INCOMING: 'call:incoming',
  RINGING: 'call:ringing',
  ACCEPT: 'call:accept',
  ACCEPTED: 'call:accepted',
  CONNECTED: 'call:connected',
  DECLINE: 'call:decline',
  DECLINED: 'call:declined',
  CANCEL: 'call:cancel',
  CANCELED: 'call:canceled',
  ICE: 'call:ice',
  END: 'call:end',
  ENDED: 'call:ended',
  MEDIA_STATE: 'call:media-state',
  RENEGOTIATE: 'call:renegotiate',
  TAKEN: 'call:taken',
} as const;
```

- [ ] **Step 2: Yiqiladigan testni yozish**

`src/modules/calls/application/calls.service.invite.spec.ts`:

```ts
import { AppException } from '../../../common/exceptions/app.exception';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { CallsService } from './calls.service';

const CALLER = 'std_caller';
const CALLEE = 'std_callee';

describe('CallsService.invite', () => {
  const calls = {
    create: jest.fn(async (input: { id: string }) => ({ id: input.id, status: CallStatus.RINGING })),
    finish: jest.fn(async () => null),
    findById: jest.fn(async () => null),
    hasCompletedCallBetween: jest.fn(async () => false),
  };
  const state = { claim: jest.fn(async () => ({ kind: 'CLAIM' })), release: jest.fn(), get: jest.fn() };
  const timers = { schedule: jest.fn(), cancel: jest.fn(), cancelAll: jest.fn() };
  const conversations = { findOrCreateDirect: jest.fn(async () => 'cnv_1') };
  const students = {
    summary: jest.fn(async () => ({ id: CALLER, fullName: 'Aziz', username: null, avatarUrl: null })),
  };
  const connections = { connectionState: jest.fn(async () => 'CONNECTED' as const) };
  const limiter = { checkInvite: jest.fn(), countUnanswered: jest.fn() };
  const bus = { publish: jest.fn() };

  const service = (): CallsService =>
    new CallsService(
      calls as never,
      state as never,
      timers as never,
      conversations as never,
      students as never,
      connections as never,
      limiter as never,
      bus as never,
    );

  const input = { calleeId: CALLEE, media: CallMedia.AUDIO, sdp: 'v=0...' };

  beforeEach(() => jest.clearAllMocks());

  it('creates a ringing call and arms the ring timeout', async () => {
    const result = await service().invite(CALLER, input);
    expect(result.callId).toEqual(expect.any(String));
    expect(calls.create).toHaveBeenCalledWith(
      expect.objectContaining({ callerId: CALLER, calleeId: CALLEE, conversationId: 'cnv_1' }),
    );
    expect(timers.schedule).toHaveBeenCalledWith('ring', result.callId, 45_000);
  });

  // ⚠️ The client sends no conversationId. Trusting one would let a caller name a conversation they
  // are not a member of, and the CALL message written at the end would land in strangers' chat.
  it('resolves the conversation from the pair, not from the client', async () => {
    await service().invite(CALLER, input);
    expect(conversations.findOrCreateDirect).toHaveBeenCalledWith(CALLER, CALLEE);
  });

  it('rejects a call to yourself', async () => {
    await expect(service().invite(CALLER, { ...input, calleeId: CALLER })).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('rejects an unconnected pair', async () => {
    connections.connectionState.mockResolvedValueOnce('NOT_CONNECTED');
    await expect(service().invite(CALLER, input)).rejects.toMatchObject({
      code: ERROR_CODE.NOT_CONNECTED,
    });
  });

  it('rejects a blocked pair with a distinct code', async () => {
    connections.connectionState.mockResolvedValueOnce('BLOCKED');
    await expect(service().invite(CALLER, input)).rejects.toMatchObject({
      code: ERROR_CODE.USER_BLOCKED,
    });
  });

  it('checks the rate limit before creating anything', async () => {
    limiter.checkInvite.mockRejectedValueOnce(new AppException(ERROR_CODE.RATE_LIMITED, 429, 'x'));
    await expect(service().invite(CALLER, input)).rejects.toMatchObject({ status: 429 });
    expect(calls.create).not.toHaveBeenCalled();
  });

  it('reports BUSY when the callee is already on a call', async () => {
    state.claim.mockResolvedValueOnce({ kind: 'BUSY' });
    await expect(service().invite(CALLER, input)).rejects.toMatchObject({
      code: ERROR_CODE.CALL_BUSY,
    });
  });

  it('closes the loser with BUSY when it preempts a mirror call', async () => {
    state.claim.mockResolvedValueOnce({ kind: 'PREEMPT', loserCallId: 'c_loser' });
    await service().invite(CALLER, input);
    expect(calls.finish).toHaveBeenCalledWith(
      'c_loser',
      expect.objectContaining({ status: CallStatus.DECLINED }),
    );
  });

  // Forced relay hides both IP addresses from an unfamiliar pair (design §9.2).
  it('forces relay for a pair that has never completed a call', async () => {
    expect((await service().invite(CALLER, input)).relayOnly).toBe(true);
  });

  it('allows P2P once the pair has talked before', async () => {
    calls.hasCompletedCallBetween.mockResolvedValueOnce(true);
    expect((await service().invite(CALLER, input)).relayOnly).toBe(false);
  });
});
```

- [ ] **Step 3: Testni ishga tushirib yiqilishini ko'rish**

Run: `npx jest src/modules/calls/application/calls.service.invite.spec.ts`
Expected: FAIL — `Cannot find module './calls.service'`

- [ ] **Step 4: `CallsService` skeleti va `invite` ni yozish**

`src/modules/calls/application/calls.service.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  CONNECTION_CHECK,
  ConnectionCheckRepository,
} from '../../chat/domain/connection-check.repository';
import { CALL_REPOSITORY, CallRepository } from '../domain/call.repository';
import { CALL_STATE_REPOSITORY, CallStateRepository } from '../domain/call-state.repository';
import { CALL_TIMERS, CallTimersRepository } from '../domain/call-timers.repository';
import {
  CONVERSATION_DIRECTORY,
  ConversationDirectoryRepository,
} from '../domain/conversation-directory.repository';
import {
  CALL_STUDENT_DIRECTORY,
  CallerSummary,
  StudentDirectoryRepository,
} from '../domain/student-directory.repository';
import { CallEndReason } from '../domain/enums/call-end-reason.enum';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { CallEndedBus } from './call-ended.bus';
import { CallRateLimiter } from './call-rate-limiter';

export const RING_TIMEOUT_MS = 45_000;
export const CONNECT_TIMEOUT_MS = 30_000;
export const MAX_DURATION_MS = 4 * 3600 * 1000;
export const DISCONNECT_GRACE_MS = 20_000;

export interface InviteInput {
  calleeId: string;
  media: CallMedia;
  sdp: string;
}

export interface InviteResult {
  callId: string;
  conversationId: string;
  expiresAt: string;
  caller: CallerSummary;
  /** `true` ⇒ the client must use `iceTransportPolicy: "relay"` and emit no host/srflx candidates. */
  relayOnly: boolean;
}

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    @Inject(CALL_REPOSITORY) private readonly calls: CallRepository,
    @Inject(CALL_STATE_REPOSITORY) private readonly state: CallStateRepository,
    @Inject(CALL_TIMERS) private readonly timers: CallTimersRepository,
    @Inject(CONVERSATION_DIRECTORY) private readonly conversations: ConversationDirectoryRepository,
    @Inject(CALL_STUDENT_DIRECTORY) private readonly students: StudentDirectoryRepository,
    @Inject(CONNECTION_CHECK) private readonly connections: ConnectionCheckRepository,
    private readonly limiter: CallRateLimiter,
    private readonly endedBus: CallEndedBus,
  ) {}

  async invite(callerId: string, input: InviteInput): Promise<InviteResult> {
    if (input.calleeId === callerId) {
      throw AppException.validation({ calleeId: 'O‘zingizga qo‘ng‘iroq qilib bo‘lmaydi' });
    }
    await this.assertMayCall(callerId, input.calleeId);
    await this.limiter.checkInvite(callerId, input.calleeId);

    // Resolved from the pair — a client-supplied conversationId would let a caller inject the CALL
    // message into a conversation they are not a member of (design §6.1.2).
    const conversationId = await this.conversations.findOrCreateDirect(callerId, input.calleeId);
    const callId = createId();
    const startedAt = new Date();

    const decision = await this.state.claim({
      callId,
      conversationId,
      callerId,
      calleeId: input.calleeId,
      media: input.media,
      status: CallStatus.RINGING,
      startedAt: startedAt.toISOString(),
      answeredAt: null,
    });

    if (decision.kind === 'BUSY') {
      throw AppException.conflict(ERROR_CODE.CALL_BUSY, 'Foydalanuvchi hozir band');
    }
    if (decision.kind === 'PREEMPT') {
      // Our invite won the glare race; the mirror call has already lost its busy keys.
      await this.closeCall(decision.loserCallId, CallStatus.DECLINED, CallEndReason.BUSY, null);
    }

    await this.calls.create({
      id: callId,
      conversationId,
      callerId,
      calleeId: input.calleeId,
      media: input.media,
    });
    await this.timers.schedule('ring', callId, RING_TIMEOUT_MS);

    const caller = await this.students.summary(callerId);
    if (caller === null) {
      throw AppException.notFound(ERROR_CODE.STUDENT_NOT_FOUND, 'Foydalanuvchi topilmadi');
    }
    return {
      callId,
      conversationId,
      expiresAt: new Date(startedAt.getTime() + RING_TIMEOUT_MS).toISOString(),
      caller,
      relayOnly: !(await this.calls.hasCompletedCallBetween(callerId, input.calleeId)),
    };
  }

  private async assertMayCall(a: string, b: string): Promise<void> {
    const state = await this.connections.connectionState(a, b);
    if (state === 'BLOCKED') {
      throw AppException.forbidden('Bu foydalanuvchiga qo‘ng‘iroq qilib bo‘lmaydi');
    }
    if (state === 'NOT_CONNECTED') {
      throw new AppException(
        ERROR_CODE.NOT_CONNECTED,
        403,
        'Avval do‘stlashishingiz kerak',
      );
    }
  }

  /** Terminal transition: cancel every timer, write the row conditionally, free Redis. */
  private async closeCall(
    callId: string,
    status: CallStatus,
    reason: CallEndReason,
    endedBy: import('../domain/enums/call-party.enum').CallParty | null,
  ): Promise<void> {
    const live = await this.state.get(callId);
    await this.timers.cancelAll(callId);
    if (live !== null) {
      await this.timers.cancel('grace', callId, live.callerId);
      await this.timers.cancel('grace', callId, live.calleeId);
    }
    const finished = await this.calls.finish(callId, { status, endReason: reason, endedBy });
    await this.state.release(callId);
    if (finished !== null) {
      if (finished.answeredAt === null) {
        await this.limiter.countUnanswered(finished.callerId, finished.calleeId);
      }
      this.endedBus.publish(finished);
    }
  }
}
```

⚠️ `AppException.forbidden` `USER_BLOCKED` emas, `FORBIDDEN` kodini beradi. Test `USER_BLOCKED` kutadi — shuning uchun bloklangan holat uchun `new AppException(ERROR_CODE.USER_BLOCKED, 403, '...')` yozing.

⚠️ `createId` importi: loyihada cuid qanday generatsiya qilinishini tekshiring. Prisma `@default(cuid())` DB tomonda ishlaydi, lekin bu yerda id **oldindan** kerak (Redis'ga yozamiz). Agar `@paralleldrive/cuid2` o'rnatilmagan bo'lsa, `node:crypto` `randomUUID()` ishlating va sxemadagi `@default(cuid())` ni saqlab qoling (biz aniq id beramiz, default ishlamaydi).

- [ ] **Step 5: Testni ishga tushirish**

Run: `npx jest src/modules/calls/application/calls.service.invite.spec.ts`
Expected: PASS — o'nta test. `CallEndedBus` hali yo'q bo'lsa, uni bo'sh klass sifatida yarating (17-vazifada to'ldiriladi):

```ts
// src/modules/calls/application/call-ended.bus.ts
import { Injectable } from '@nestjs/common';
import { Call } from '../domain/entities/call.entity';

type Listener = (call: Call) => void | Promise<void>;

/**
 * calls → chat, one way. Mirrors `MediaReadyBus`, and for the same reason: chat must write the CALL
 * message (it owns `seq`), but a port injected the other way round would make the two modules
 * import each other.
 */
@Injectable()
export class CallEndedBus {
  private readonly listeners: Listener[] = [];

  subscribe(listener: Listener): void {
    this.listeners.push(listener);
  }

  publish(call: Call): void {
    for (const listener of this.listeners) {
      void listener(call);
    }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/calls/application
git commit -m "feat(calls): add invite use-case with glare, rate limit and relay policy"
```

---

## Task 13: `CallsService` — hayot sikli va avtorizatsiya matritsasi

**Files:**
- Modify: `src/modules/calls/application/calls.service.ts`
- Test: `src/modules/calls/application/calls.service.lifecycle.spec.ts`

**Interfaces:**
- Produces:
  - `accept(studentId, callId, sdp): Promise<{ conversationId: string; callerId: string; relayOnly: boolean }>`
  - `markConnected(studentId, callId): Promise<void>`
  - `decline(studentId, callId, reason: 'DECLINED' | 'BUSY'): Promise<CallOutcome>`
  - `cancel(studentId, callId): Promise<CallOutcome>`
  - `end(studentId, callId): Promise<CallOutcome>`
  - `interface CallOutcome { callId: string; participants: string[]; reason: CallEndReason; durationMs: number; endedBy: CallParty | null }`
  - `assertParticipant(callId, studentId): Promise<CallState>` (private, lekin har metod ishlatadi)

- [ ] **Step 1: Yiqiladigan testni yozish**

`src/modules/calls/application/calls.service.lifecycle.spec.ts`:

```ts
import { ERROR_CODE } from '../../../common/errors/error-code';
import { CallMedia } from '../domain/enums/call-media.enum';
import { CallParty } from '../domain/enums/call-party.enum';
import { CallStatus } from '../domain/enums/call-status.enum';
import { CallEndReason } from '../domain/enums/call-end-reason.enum';
import { CallsService } from './calls.service';

const CALLER = 'std_caller';
const CALLEE = 'std_callee';
const STRANGER = 'std_stranger';
const CALL_ID = 'call_1';

const liveState = (status = CallStatus.RINGING) => ({
  callId: CALL_ID,
  conversationId: 'cnv_1',
  callerId: CALLER,
  calleeId: CALLEE,
  media: CallMedia.AUDIO,
  status,
  startedAt: '2026-08-01T10:00:00.000Z',
  answeredAt: null,
});

describe('CallsService lifecycle', () => {
  const calls = {
    finish: jest.fn(async () => ({
      id: CALL_ID,
      conversationId: 'cnv_1',
      callerId: CALLER,
      calleeId: CALLEE,
      media: CallMedia.AUDIO,
      status: CallStatus.ENDED,
      startedAt: new Date('2026-08-01T10:00:00.000Z'),
      answeredAt: new Date('2026-08-01T10:00:10.000Z'),
      endedAt: new Date('2026-08-01T10:03:14.000Z'),
      endReason: CallEndReason.HANGUP,
      endedBy: CallParty.CALLER,
    })),
    markActive: jest.fn(async () => true),
    hasCompletedCallBetween: jest.fn(async () => true),
  };
  const state = {
    get: jest.fn(async () => liveState()),
    compareAndSetStatus: jest.fn(async () => true),
    release: jest.fn(),
    claim: jest.fn(),
  };
  const timers = { schedule: jest.fn(), cancel: jest.fn(), cancelAll: jest.fn() };
  const limiter = { checkInvite: jest.fn(), countUnanswered: jest.fn() };
  const bus = { publish: jest.fn() };

  const service = (): CallsService =>
    new CallsService(
      calls as never,
      state as never,
      timers as never,
      { findOrCreateDirect: jest.fn() } as never,
      { summary: jest.fn() } as never,
      { connectionState: jest.fn() } as never,
      limiter as never,
      bus as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    state.get.mockResolvedValue(liveState());
  });

  // ⚠️ THE security test of this feature. Without it a stranger who learns a callId can accept
  // someone else's invite and become the peer — a live audio/video eavesdrop.
  describe('a non-participant', () => {
    it.each([
      ['accept', (s: CallsService) => s.accept(STRANGER, CALL_ID, 'sdp')],
      ['decline', (s: CallsService) => s.decline(STRANGER, CALL_ID, 'DECLINED')],
      ['cancel', (s: CallsService) => s.cancel(STRANGER, CALL_ID)],
      ['end', (s: CallsService) => s.end(STRANGER, CALL_ID)],
      ['markConnected', (s: CallsService) => s.markConnected(STRANGER, CALL_ID)],
    ])('cannot %s', async (_name, act) => {
      await expect(act(service())).rejects.toMatchObject({
        code: ERROR_CODE.FORBIDDEN,
        status: 403,
      });
    });
  });

  describe('role matrix', () => {
    it('lets only the callee accept', async () => {
      await expect(service().accept(CALLER, CALL_ID, 'sdp')).rejects.toMatchObject({ status: 403 });
      await expect(service().accept(CALLEE, CALL_ID, 'sdp')).resolves.toBeDefined();
    });

    it('lets only the callee decline', async () => {
      await expect(service().decline(CALLER, CALL_ID, 'DECLINED')).rejects.toMatchObject({ status: 403 });
    });

    it('lets only the caller cancel', async () => {
      await expect(service().cancel(CALLEE, CALL_ID)).rejects.toMatchObject({ status: 403 });
      await expect(service().cancel(CALLER, CALL_ID)).resolves.toBeDefined();
    });

    it('lets either side end', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      await expect(service().end(CALLER, CALL_ID)).resolves.toBeDefined();
      await expect(service().end(CALLEE, CALL_ID)).resolves.toBeDefined();
    });
  });

  it('reports CALL_NOT_FOUND for an unknown call', async () => {
    state.get.mockResolvedValueOnce(null);
    await expect(service().end(CALLER, CALL_ID)).rejects.toMatchObject({
      code: ERROR_CODE.CALL_NOT_FOUND,
    });
  });

  describe('accept', () => {
    it('moves to CONNECTING and arms the connect timeout', async () => {
      await service().accept(CALLEE, CALL_ID, 'sdp');
      expect(state.compareAndSetStatus).toHaveBeenCalledWith(
        CALL_ID,
        [CallStatus.RINGING],
        CallStatus.CONNECTING,
      );
      expect(timers.cancel).toHaveBeenCalledWith('ring', CALL_ID);
      expect(timers.schedule).toHaveBeenCalledWith('connect', CALL_ID, 30_000);
    });

    // First accept wins across devices — the CAS is what makes the second one lose.
    it('rejects a second accept from another device', async () => {
      state.compareAndSetStatus.mockResolvedValueOnce(false);
      await expect(service().accept(CALLEE, CALL_ID, 'sdp')).rejects.toMatchObject({
        code: ERROR_CODE.INVALID_CALL_STATE,
      });
    });
  });

  describe('markConnected', () => {
    it('moves to ACTIVE and swaps the connect timeout for the duration cap', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.CONNECTING));
      await service().markConnected(CALLEE, CALL_ID);
      expect(timers.cancel).toHaveBeenCalledWith('connect', CALL_ID);
      expect(timers.schedule).toHaveBeenCalledWith('max', CALL_ID, 4 * 3600 * 1000);
    });
  });

  describe('end', () => {
    it('returns both participants and the measured duration', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      const outcome = await service().end(CALLER, CALL_ID);
      expect(outcome.participants).toEqual(expect.arrayContaining([CALLER, CALLEE]));
      expect(outcome.durationMs).toBe(184_000);
      expect(outcome.endedBy).toBe(CallParty.CALLER);
    });

    it('cancels every timer and frees the live state', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      await service().end(CALLER, CALL_ID);
      expect(timers.cancelAll).toHaveBeenCalledWith(CALL_ID);
      expect(timers.cancel).toHaveBeenCalledWith('grace', CALL_ID, CALLER);
      expect(timers.cancel).toHaveBeenCalledWith('grace', CALL_ID, CALLEE);
      expect(state.release).toHaveBeenCalledWith(CALL_ID);
    });

    // A retrying client sends `call:end` twice — that must be silent, not an error.
    it('is idempotent when the row already reached a terminal status', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      calls.finish.mockResolvedValueOnce(null);
      await expect(service().end(CALLER, CALL_ID)).resolves.toBeNull();
      expect(bus.publish).not.toHaveBeenCalled();
    });
  });

  it('counts an unanswered call against the pair budget', async () => {
    calls.finish.mockResolvedValueOnce({
      id: CALL_ID,
      conversationId: 'cnv_1',
      callerId: CALLER,
      calleeId: CALLEE,
      media: CallMedia.AUDIO,
      status: CallStatus.DECLINED,
      startedAt: new Date(),
      answeredAt: null,
      endedAt: new Date(),
      endReason: CallEndReason.DECLINED,
      endedBy: CallParty.CALLEE,
    });
    await service().decline(CALLEE, CALL_ID, 'DECLINED');
    expect(limiter.countUnanswered).toHaveBeenCalledWith(CALLER, CALLEE);
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `npx jest src/modules/calls/application/calls.service.lifecycle.spec.ts`
Expected: FAIL — `service.accept is not a function`

- [ ] **Step 3: Implementatsiya**

`calls.service.ts` ga qo'shing (`invite` dan keyin, `closeCall` dan oldin):

```ts
export interface CallOutcome {
  callId: string;
  participants: string[];
  reason: CallEndReason;
  durationMs: number;
  endedBy: CallParty | null;
}
```

va metodlar:

```ts
  async accept(
    studentId: string,
    callId: string,
    _sdp: string,
  ): Promise<{ conversationId: string; callerId: string; relayOnly: boolean }> {
    const live = await this.assertRole(callId, studentId, CallParty.CALLEE);
    // CAS, not read-then-write: a student's other devices are ringing too, and only the first
    // accept may win. Losing devices get `call:taken` from the gateway.
    const won = await this.state.compareAndSetStatus(callId, [CallStatus.RINGING], CallStatus.CONNECTING);
    if (!won) {
      throw new AppException(
        ERROR_CODE.INVALID_CALL_STATE,
        409,
        'Qo‘ng‘iroq allaqachon javob berilgan',
      );
    }
    await this.timers.cancel('ring', callId);
    await this.timers.schedule('connect', callId, CONNECT_TIMEOUT_MS);
    return {
      conversationId: live.conversationId,
      callerId: live.callerId,
      relayOnly: !(await this.calls.hasCompletedCallBetween(live.callerId, live.calleeId)),
    };
  }

  /** Media is flowing. Swaps the 30s connect timeout for the 4-hour duration cap. */
  async markConnected(studentId: string, callId: string): Promise<void> {
    await this.assertParticipant(callId, studentId);
    const moved = await this.state.compareAndSetStatus(
      callId,
      [CallStatus.CONNECTING],
      CallStatus.ACTIVE,
      new Date().toISOString(),
    );
    if (!moved) {
      return; // both sides report `connected`; the second one is a no-op.
    }
    await this.calls.markActive(callId);
    await this.timers.cancel('connect', callId);
    await this.timers.schedule('max', callId, MAX_DURATION_MS);
  }

  async decline(
    studentId: string,
    callId: string,
    reason: 'DECLINED' | 'BUSY',
  ): Promise<CallOutcome | null> {
    await this.assertRole(callId, studentId, CallParty.CALLEE);
    return this.closeCall(
      callId,
      CallStatus.DECLINED,
      reason === 'BUSY' ? CallEndReason.BUSY : CallEndReason.DECLINED,
      CallParty.CALLEE,
    );
  }

  async cancel(studentId: string, callId: string): Promise<CallOutcome | null> {
    await this.assertRole(callId, studentId, CallParty.CALLER);
    return this.closeCall(callId, CallStatus.CANCELED, CallEndReason.CANCELED, CallParty.CALLER);
  }

  async end(studentId: string, callId: string): Promise<CallOutcome | null> {
    const live = await this.assertParticipant(callId, studentId);
    const endedBy = live.callerId === studentId ? CallParty.CALLER : CallParty.CALLEE;
    return this.closeCall(callId, CallStatus.ENDED, CallEndReason.HANGUP, endedBy);
  }

  /**
   * Rule 0 of the signalling protocol (design §6.0): every client→server event resolves the call
   * and asserts the socket's student is one of its two participants.
   *
   * A `callId` is an identifier, never a capability. Without this check anyone who learns one can
   * accept a stranger's invite (becoming the peer of a live call), push an SDP that redirects the
   * media, or hang up any call on the platform.
   */
  private async assertParticipant(callId: string, studentId: string): Promise<CallState> {
    const live = await this.state.get(callId);
    if (live === null) {
      throw AppException.notFound(ERROR_CODE.CALL_NOT_FOUND, 'Qo‘ng‘iroq topilmadi');
    }
    if (live.callerId !== studentId && live.calleeId !== studentId) {
      // 403, not 404: CLAUDE.md is explicit that someone else's resource is forbidden, not missing.
      throw AppException.forbidden('Bu qo‘ng‘iroq sizga tegishli emas');
    }
    return live;
  }

  private async assertRole(
    callId: string,
    studentId: string,
    role: CallParty,
  ): Promise<CallState> {
    const live = await this.assertParticipant(callId, studentId);
    const expected = role === CallParty.CALLER ? live.callerId : live.calleeId;
    if (expected !== studentId) {
      throw AppException.forbidden('Bu amal uchun ruxsat yo‘q');
    }
    return live;
  }
```

`closeCall` ni `CallOutcome | null` qaytaradigan qilib yangilang:

```ts
  private async closeCall(
    callId: string,
    status: CallStatus,
    reason: CallEndReason,
    endedBy: CallParty | null,
  ): Promise<CallOutcome | null> {
    const live = await this.state.get(callId);
    await this.timers.cancelAll(callId);
    if (live !== null) {
      await this.timers.cancel('grace', callId, live.callerId);
      await this.timers.cancel('grace', callId, live.calleeId);
    }
    const finished = await this.calls.finish(callId, { status, endReason: reason, endedBy });
    await this.state.release(callId);
    if (finished === null) {
      return null; // already terminal — a retried `call:end` is silent, not an error.
    }
    if (finished.answeredAt === null) {
      await this.limiter.countUnanswered(finished.callerId, finished.calleeId);
    }
    this.endedBus.publish(finished);
    return {
      callId,
      participants: [finished.callerId, finished.calleeId],
      reason,
      durationMs: durationMsOf(finished),
      endedBy,
    };
  }
```

`CallState`, `CallParty` va `durationMsOf` importlarini qo'shing.

- [ ] **Step 4: Testni ishga tushirish**

Run: `npx jest src/modules/calls/application/calls.service.lifecycle.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/calls/application/calls.service.ts src/modules/calls/application/calls.service.lifecycle.spec.ts
git commit -m "feat(calls): add call lifecycle with participant and role authorization"
```

---

## Task 14: `CallsService` — uzatuvchi hodisalar va taymer ishlovchisi

**Files:**
- Modify: `src/modules/calls/application/calls.service.ts`
- Test: `src/modules/calls/application/calls.service.relay.spec.ts`

**Interfaces:**
- Produces:
  - `relayTo(studentId, callId): Promise<{ peerId: string }>` — `ice` / `renegotiate` / `media-state` uchun umumiy
  - `onSocketPresent(studentId, callId): Promise<void>` · `onSocketGone(studentId, callId): Promise<void>`
  - `onTimer(kind: CallTimerKind, callId: string, studentId: string | null): Promise<CallOutcome | null>`

- [ ] **Step 1: Yiqiladigan testni yozish**

`src/modules/calls/application/calls.service.relay.spec.ts` — 13-vazifadagi mock to'plamini aynan takrorlang (`calls`, `state`, `timers`, `limiter`, `bus` va `service()` fabrikasi), so'ng:

```ts
  describe('relayTo', () => {
    it('routes to the other participant', async () => {
      expect(await service().relayTo(CALLER, CALL_ID)).toEqual({ peerId: CALLEE });
      expect(await service().relayTo(CALLEE, CALL_ID)).toEqual({ peerId: CALLER });
    });

    // ⚠️ Without this a stranger could inject ICE candidates or push an SDP that redirects the
    // media stream to an endpoint they control.
    it('refuses a non-participant', async () => {
      await expect(service().relayTo(STRANGER, CALL_ID)).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('timers', () => {
    it('misses a call still ringing at 45s', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.RINGING));
      await service().onTimer('ring', CALL_ID, null);
      expect(calls.finish).toHaveBeenCalledWith(
        CALL_ID,
        expect.objectContaining({ status: CallStatus.MISSED, endReason: CallEndReason.TIMEOUT }),
      );
    });

    // The job may fire after a cancel that was lost with the instance that scheduled it.
    it('does nothing when the call already moved on', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      await service().onTimer('ring', CALL_ID, null);
      expect(calls.finish).not.toHaveBeenCalled();
    });

    it('does nothing when the live state is gone', async () => {
      state.get.mockResolvedValue(null);
      await service().onTimer('ring', CALL_ID, null);
      expect(calls.finish).not.toHaveBeenCalled();
    });

    it('fails a call stuck in CONNECTING at 30s', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.CONNECTING));
      await service().onTimer('connect', CALL_ID, null);
      expect(calls.finish).toHaveBeenCalledWith(
        CALL_ID,
        expect.objectContaining({ status: CallStatus.FAILED }),
      );
    });

    it('ends an active call at the four hour cap', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      await service().onTimer('max', CALL_ID, null);
      expect(calls.finish).toHaveBeenCalledWith(
        CALL_ID,
        expect.objectContaining({ status: CallStatus.ENDED, endReason: CallEndReason.TIMEOUT }),
      );
    });

    // A short drop — a tunnel, a lift — must not kill the call: WebRTC media is independent of
    // the signalling socket.
    it('spares a call whose participant came back', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      state.isPresent = jest.fn(async () => true);
      await service().onTimer('grace', CALL_ID, CALLER);
      expect(calls.finish).not.toHaveBeenCalled();
    });

    it('fails a call whose participant never came back', async () => {
      state.get.mockResolvedValue(liveState(CallStatus.ACTIVE));
      state.isPresent = jest.fn(async () => false);
      await service().onTimer('grace', CALL_ID, CALLER);
      expect(calls.finish).toHaveBeenCalledWith(
        CALL_ID,
        expect.objectContaining({ status: CallStatus.FAILED }),
      );
    });
  });
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `npx jest src/modules/calls/application/calls.service.relay.spec.ts`
Expected: FAIL — `service.relayTo is not a function`

- [ ] **Step 3: Implementatsiya**

```ts
  /**
   * Who a signalling payload goes to. Shared by `call:ice`, `call:renegotiate` and
   * `call:media-state` — all three carry client-authored content the server forwards untouched, so
   * all three need the same participant check first.
   */
  async relayTo(studentId: string, callId: string): Promise<{ peerId: string }> {
    const live = await this.assertParticipant(callId, studentId);
    return { peerId: live.callerId === studentId ? live.calleeId : live.callerId };
  }

  async onSocketPresent(studentId: string, callId: string): Promise<void> {
    await this.state.markPresent(callId, studentId);
    await this.timers.cancel('grace', callId, studentId);
  }

  async onSocketGone(studentId: string, callId: string): Promise<void> {
    await this.state.clearPresent(callId, studentId);
    await this.timers.schedule('grace', callId, DISCONNECT_GRACE_MS, studentId);
  }

  /**
   * A delayed job fired. Every branch re-reads the live state and does nothing if the call already
   * moved on — the deterministic job id is how a timer is cancelled, but this no-op is what saves
   * a call whose cancel was lost with the instance that scheduled it.
   */
  async onTimer(
    kind: CallTimerKind,
    callId: string,
    studentId: string | null,
  ): Promise<CallOutcome | null> {
    const live = await this.state.get(callId);
    if (live === null) {
      return null;
    }
    switch (kind) {
      case 'ring':
        return live.status === CallStatus.RINGING
          ? this.closeCall(callId, CallStatus.MISSED, CallEndReason.TIMEOUT, null)
          : null;
      case 'connect':
        return live.status === CallStatus.CONNECTING
          ? this.closeCall(callId, CallStatus.FAILED, CallEndReason.FAILED, null)
          : null;
      case 'max':
        return live.status === CallStatus.ACTIVE
          ? this.closeCall(callId, CallStatus.ENDED, CallEndReason.TIMEOUT, null)
          : null;
      case 'grace': {
        if (studentId === null || (await this.state.isPresent(callId, studentId))) {
          return null;
        }
        return this.closeCall(callId, CallStatus.FAILED, CallEndReason.FAILED, null);
      }
    }
  }
```

`CallTimerKind` importini qo'shing.

- [ ] **Step 4: Testni ishga tushirish**

Run: `npx jest src/modules/calls/application`
Expected: PASS — invite, lifecycle va relay testlarining hammasi.

- [ ] **Step 5: Commit**

```bash
git add src/modules/calls/application
git commit -m "feat(calls): add signalling relay routing and timer handlers"
```

---

## Task 15: WS payload DTO'lari

**Files:**
- Create: `src/modules/calls/presentation/dto/call-ws.dto.ts`
- Test: `src/modules/calls/presentation/dto/call-ws.dto.spec.ts`

**Interfaces:**
- Produces: `InviteDto`, `CallIdDto`, `AcceptDto`, `DeclineDto`, `IceDto`, `RenegotiateDto`, `MediaStateDto` klasslari; `validateWsPayload<T>(cls, payload): Promise<T>`.

- [ ] **Step 1: Yiqiladigan testni yozish**

```ts
import { CallMedia } from '../../domain/enums/call-media.enum';
import { AppException } from '../../../../common/exceptions/app.exception';
import { IceDto, InviteDto, validateWsPayload } from './call-ws.dto';

describe('validateWsPayload', () => {
  const validInvite = { calleeId: 'c'.repeat(25), media: CallMedia.AUDIO, sdp: 'v=0\r\n' };

  it('accepts a well-formed invite', async () => {
    await expect(validateWsPayload(InviteDto, validInvite)).resolves.toMatchObject({
      media: CallMedia.AUDIO,
    });
  });

  // ⚠️ The global ValidationPipe never sees a @MessageBody() typed as an interface — its metatype
  // is Object, so it validates nothing. Without this helper all 16 events ship unvalidated.
  it('rejects a non-object payload', async () => {
    await expect(validateWsPayload(InviteDto, null)).rejects.toBeInstanceOf(AppException);
    await expect(validateWsPayload(InviteDto, 'nope')).rejects.toBeInstanceOf(AppException);
  });

  it('rejects an unknown media type', async () => {
    await expect(validateWsPayload(InviteDto, { ...validInvite, media: 'HOLOGRAM' })).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('rejects extra properties', async () => {
    await expect(validateWsPayload(InviteDto, { ...validInvite, evil: 1 })).rejects.toBeInstanceOf(
      AppException,
    );
  });

  // Every forwarded event is republished through the Redis adapter to every instance, so an
  // oversized SDP is multiplied by the instance count on each send.
  it('rejects an oversized sdp', async () => {
    await expect(
      validateWsPayload(InviteDto, { ...validInvite, sdp: 'x'.repeat(65_537) }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects an oversized ICE candidate', async () => {
    await expect(
      validateWsPayload(IceDto, {
        callId: 'c'.repeat(25),
        candidate: { candidate: 'x'.repeat(513), sdpMid: '0', sdpMLineIndex: 0 },
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects an out-of-range sdpMLineIndex', async () => {
    await expect(
      validateWsPayload(IceDto, {
        callId: 'c'.repeat(25),
        candidate: { candidate: 'a', sdpMid: '0', sdpMLineIndex: 999 },
      }),
    ).rejects.toBeInstanceOf(AppException);
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `npx jest src/modules/calls/presentation/dto/call-ws.dto.spec.ts`
Expected: FAIL — `Cannot find module './call-ws.dto'`

- [ ] **Step 3: Implementatsiya**

```ts
import { plainToInstance } from 'class-transformer';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  validate,
} from 'class-validator';
import { AppException } from '../../../../common/exceptions/app.exception';
import { CallMedia } from '../../domain/enums/call-media.enum';

const ID = { min: 20, max: 32 } as const;
/** An SDP offer with many codecs is a few KB; 64 KB is generous and still bounded. */
const SDP_MAX = 65_536;
const CANDIDATE_MAX = 512;

export class CallIdDto {
  @IsString()
  @Length(ID.min, ID.max)
  callId!: string;
}

export class InviteDto {
  @IsString()
  @Length(ID.min, ID.max)
  calleeId!: string;

  @IsEnum(CallMedia)
  media!: CallMedia;

  @IsString()
  @IsNotEmpty()
  @MaxLength(SDP_MAX)
  sdp!: string;
}

export class AcceptDto extends CallIdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(SDP_MAX)
  sdp!: string;
}

export class DeclineDto extends CallIdDto {
  @IsIn(['DECLINED', 'BUSY'])
  reason!: 'DECLINED' | 'BUSY';
}

class IceCandidateDto {
  @IsString()
  @MaxLength(CANDIDATE_MAX)
  candidate!: string;

  @IsString()
  @MaxLength(32)
  sdpMid!: string;

  @IsInt()
  @Min(0)
  @Max(64)
  sdpMLineIndex!: number;
}

export class IceDto extends CallIdDto {
  @IsObject()
  @ValidateNested()
  @Type(() => IceCandidateDto)
  candidate!: IceCandidateDto;
}

export class RenegotiateDto extends CallIdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(SDP_MAX)
  sdp!: string;
}

export class MediaStateDto extends CallIdDto {
  @IsBoolean()
  audioEnabled!: boolean;

  @IsBoolean()
  videoEnabled!: boolean;
}

/**
 * Validate a WebSocket payload explicitly.
 *
 * The global `ValidationPipe` cannot do this: it skips any parameter whose metatype is `Object`,
 * which is every `@MessageBody()` typed as an interface. Without an explicit call, `callId` could
 * arrive as an array and be used as a Redis key, and `sdp` could be a megabyte that the Redis
 * adapter then fans out to every instance.
 */
export async function validateWsPayload<T extends object>(
  cls: new () => T,
  payload: unknown,
): Promise<T> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw AppException.validation({ payload: 'Ma’lumot noto‘g‘ri' });
  }
  const instance = plainToInstance(cls, payload, { enableImplicitConversion: false });
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });
  if (errors.length > 0) {
    const fields: Record<string, string> = {};
    for (const error of errors) {
      fields[error.property] = Object.values(error.constraints ?? {})[0] ?? 'Noto‘g‘ri qiymat';
    }
    throw AppException.validation(fields);
  }
  return instance;
}
```

- [ ] **Step 4: Testni ishga tushirish**

Run: `npx jest src/modules/calls/presentation/dto/call-ws.dto.spec.ts`
Expected: PASS — yettita test.

- [ ] **Step 5: Commit**

```bash
git add src/modules/calls/presentation/dto
git commit -m "feat(calls): add validated websocket payload DTOs with size caps"
```

---

## Task 16: `/calls` gateway

**Files:**
- Create: `src/modules/calls/calls.gateway.ts`
- Test: `src/modules/calls/calls.gateway.spec.ts`

**Interfaces:**
- Consumes: `CallsService` (12–14), `CALL_EVENT` (12), WS DTO'lar (15), umumiy WS yordamchilari (2)
- Produces: `CallsGateway` klassi.

- [ ] **Step 1: Yiqiladigan testni yozish**

```ts
import { CALL_EVENT } from './application/call-events';
import { CallsGateway } from './calls.gateway';
import { CallMedia } from './domain/enums/call-media.enum';

const socket = (studentId: string, expOffsetSeconds = 900) =>
  ({
    id: `sock_${studentId}`,
    data: { user: { id: studentId }, tokenExp: Math.floor(Date.now() / 1000) + expOffsetSeconds },
    join: jest.fn(),
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  }) as never;

describe('CallsGateway', () => {
  const calls = {
    invite: jest.fn(async () => ({
      callId: 'call_1',
      conversationId: 'cnv_1',
      expiresAt: '2026-08-01T10:00:45.000Z',
      caller: { id: 'A', fullName: 'Aziz', username: null, avatarUrl: null },
      relayOnly: true,
    })),
    end: jest.fn(async () => ({
      callId: 'call_1',
      participants: ['A', 'B'],
      reason: 'HANGUP',
      durationMs: 1000,
      endedBy: 'CALLER',
    })),
    relayTo: jest.fn(async () => ({ peerId: 'B' })),
    onSocketPresent: jest.fn(),
    onSocketGone: jest.fn(),
  };
  let gateway: CallsGateway;
  const server = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new CallsGateway(calls as never, {} as never, {} as never);
    Object.defineProperty(gateway, 'server', { value: server, writable: true });
  });

  it('acks an invite with the callId and rings the callee', async () => {
    const ack = await gateway.onInvite(socket('A'), {
      calleeId: 'b'.repeat(25),
      media: CallMedia.AUDIO,
      sdp: 'v=0',
    });
    expect(ack).toMatchObject({ status: 'ok', callId: 'call_1', relayOnly: true });
    expect(server.emit).toHaveBeenCalledWith(CALL_EVENT.INCOMING, expect.objectContaining({ callId: 'call_1' }));
  });

  it('acks an error instead of throwing', async () => {
    calls.invite.mockRejectedValueOnce(new Error('boom'));
    const ack = await gateway.onInvite(socket('A'), {
      calleeId: 'b'.repeat(25),
      media: CallMedia.AUDIO,
      sdp: 'v=0',
    });
    expect(ack).toMatchObject({ status: 'error' });
  });

  it('rejects a malformed payload before reaching the service', async () => {
    const ack = await gateway.onInvite(socket('A'), { calleeId: 'short' } as never);
    expect(ack).toMatchObject({ status: 'error' });
    expect(calls.invite).not.toHaveBeenCalled();
  });

  // ⚠️ A 4-hour call outlives a 15-minute access token. Refusing `call:end` would leave the
  // microphone and camera streaming until the duration cap fires (design §6.4).
  it('accepts call:end on an expired token', async () => {
    const ack = await gateway.onEnd(socket('A', -60), { callId: 'c'.repeat(25) });
    expect(ack).toMatchObject({ status: 'ok' });
  });

  it('refuses call:invite on an expired token', async () => {
    const ack = await gateway.onInvite(socket('A', -60), {
      calleeId: 'b'.repeat(25),
      media: CallMedia.AUDIO,
      sdp: 'v=0',
    });
    expect(ack).toMatchObject({ status: 'error' });
    expect(calls.invite).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `npx jest src/modules/calls/calls.gateway.spec.ts`
Expected: FAIL — `Cannot find module './calls.gateway'`

- [ ] **Step 3: Implementatsiya**

`src/modules/calls/calls.gateway.ts` — `chat.gateway.ts` tuzilishini takrorlaydi. To'liq 16 hodisa; quyida naqsh va eng muhim uch hodisaning to'liq kodi, qolganlari aynan shu shaklda:

```ts
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  assertTokenFresh,
  personalRoom,
  toWsError,
  userOf,
  wsUnauthorized,
} from '../../common/websocket/ws-helpers';
import { verifyStudentSocket } from '../../common/websocket/ws-jwt';
import type { Env } from '../../config/env';
import { CALL_EVENT } from './application/call-events';
import { CallsService } from './application/calls.service';
import {
  AcceptDto,
  CallIdDto,
  DeclineDto,
  IceDto,
  InviteDto,
  MediaStateDto,
  RenegotiateDto,
  validateWsPayload,
} from './presentation/dto/call-ws.dto';

type Ack = Record<string, unknown>;

/**
 * WebRTC signalling (`/calls`). Mirrors `/chat`: JWT on the handshake, one personal room per
 * student, Redis adapter for fan-out across instances.
 *
 * Two rules this gateway exists to keep:
 *
 *  1. **It never reads SDP or ICE.** Payloads are forwarded byte-for-byte — that is the only
 *     guarantee the client's Opus (`useinbandfec`, `usedtx`) and H.264 settings survive. They are
 *     also never logged: an SDP carries the user's home IP address.
 *  2. **Authorization lives in the service, not here.** Every handler passes the socket's student
 *     id down, and `CallsService` asserts participation before acting (design §6.0).
 *
 * ⚠️ It deliberately does NOT touch `PresenceRepository`. That counter is refcounted by `/chat`
 * sockets; incrementing it here would leave every caller permanently "online".
 */
@WebSocketGateway({ namespace: '/calls', cors: false })
export class CallsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(CallsGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly calls: CallsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const verified = await verifyStudentSocket(client, this.jwt, this.config);
      client.data.user = verified.user;
      client.data.tokenExp = verified.expiresAt;
      client.data.callIds = new Set<string>();
      await client.join(personalRoom(verified.user.id));
    } catch {
      this.logger.warn('Rejected an unauthenticated /calls socket');
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const user = userOf(client);
    const callIds = client.data.callIds as Set<string> | undefined;
    if (user === undefined || callIds === undefined) {
      return;
    }
    // A short drop (tunnel, lift) must not kill the call — WebRTC media is independent of this
    // socket. The grace timer gives the client 20 seconds to come back.
    for (const callId of callIds) {
      await this.calls.onSocketGone(user.id, callId);
    }
  }

  @SubscribeMessage(CALL_EVENT.INVITE)
  async onInvite(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: wsUnauthorized() };
    }
    try {
      // State-creating: a fresh token is required, and refusing is safe.
      assertTokenFresh(client);
      const dto = await validateWsPayload(InviteDto, body);
      const result = await this.calls.invite(user.id, dto);
      this.track(client, result.callId);
      await this.calls.onSocketPresent(user.id, result.callId);
      this.server.to(personalRoom(dto.calleeId)).emit(CALL_EVENT.INCOMING, {
        callId: result.callId,
        conversationId: result.conversationId,
        caller: result.caller,
        media: dto.media,
        sdp: dto.sdp,
        relayOnly: result.relayOnly,
        expiresAt: result.expiresAt,
      });
      return {
        status: 'ok',
        callId: result.callId,
        expiresAt: result.expiresAt,
        relayOnly: result.relayOnly,
      };
    } catch (error) {
      return { status: 'error', error: toWsError(error) };
    }
  }

  @SubscribeMessage(CALL_EVENT.ACCEPT)
  async onAccept(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: wsUnauthorized() };
    }
    try {
      assertTokenFresh(client);
      const dto = await validateWsPayload(AcceptDto, body);
      const result = await this.calls.accept(user.id, dto.callId, dto.sdp);
      this.track(client, dto.callId);
      await this.calls.onSocketPresent(user.id, dto.callId);
      this.server
        .to(personalRoom(result.callerId))
        .emit(CALL_EVENT.ACCEPTED, { callId: dto.callId, sdp: dto.sdp, relayOnly: result.relayOnly });
      // The student's OTHER devices stop ringing. `client.to(...)` excludes the socket that just
      // answered — `server.to(...)` would tell the answering device to stop ringing too.
      client.to(personalRoom(user.id)).emit(CALL_EVENT.TAKEN, { callId: dto.callId });
      return { status: 'ok', callId: dto.callId, relayOnly: result.relayOnly };
    } catch (error) {
      return { status: 'error', error: toWsError(error) };
    }
  }

  @SubscribeMessage(CALL_EVENT.END)
  async onEnd(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: wsUnauthorized() };
    }
    try {
      // ⚠️ NO assertTokenFresh. Terminating is fail-safe, and a call may run four hours past a
      // fifteen-minute token — refusing here would leave the microphone streaming (design §6.4).
      const dto = await validateWsPayload(CallIdDto, body);
      const outcome = await this.calls.end(user.id, dto.callId);
      if (outcome !== null) {
        this.server.to(outcome.participants.map(personalRoom)).emit(CALL_EVENT.ENDED, {
          callId: outcome.callId,
          reason: outcome.reason,
          durationMs: outcome.durationMs,
          endedBy: outcome.endedBy,
        });
      }
      return { status: 'ok', callId: dto.callId };
    } catch (error) {
      return { status: 'error', error: toWsError(error) };
    }
  }

  @SubscribeMessage(CALL_EVENT.ICE)
  async onIce(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    return this.relay(client, body, IceDto, CALL_EVENT.ICE, (dto) => ({
      callId: dto.callId,
      candidate: dto.candidate,
    }));
  }

  @SubscribeMessage(CALL_EVENT.RENEGOTIATE)
  async onRenegotiate(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    return this.relay(client, body, RenegotiateDto, CALL_EVENT.RENEGOTIATE, (dto) => ({
      callId: dto.callId,
      sdp: dto.sdp,
    }));
  }

  @SubscribeMessage(CALL_EVENT.MEDIA_STATE)
  async onMediaState(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<Ack> {
    return this.relay(client, body, MediaStateDto, CALL_EVENT.MEDIA_STATE, (dto) => ({
      callId: dto.callId,
      audioEnabled: dto.audioEnabled,
      videoEnabled: dto.videoEnabled,
    }));
  }

  /** In-call events: forwarded untouched to the peer, allowed while the call itself is alive. */
  private async relay<T extends CallIdDto>(
    client: Socket,
    body: unknown,
    cls: new () => T,
    event: string,
    payloadOf: (dto: T) => Record<string, unknown>,
  ): Promise<Ack> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: wsUnauthorized() };
    }
    try {
      const dto = await validateWsPayload(cls, body);
      const { peerId } = await this.calls.relayTo(user.id, dto.callId);
      await this.calls.onSocketPresent(user.id, dto.callId);
      this.server.to(personalRoom(peerId)).emit(event, payloadOf(dto));
      return { status: 'ok' };
    } catch (error) {
      return { status: 'error', error: toWsError(error) };
    }
  }

  private track(client: Socket, callId: string): void {
    (client.data.callIds as Set<string>).add(callId);
  }
}
```

Qolgan hodisalarni **aynan shu naqshda** qo'shing:

| Handler | DTO | Token yangiligi | Servis | Chiqadigan hodisa → kimga |
|---|---|---|---|---|
| `onConnected` | `CallIdDto` | qo'ng'iroq ichidagi (yo'q) | `markConnected` | — |
| `onDecline` | `DeclineDto` | yo'q (tugatuvchi) | `decline` | `call:declined` → chaquvchi; `call:taken` → o'z boshqa qurilmalari |
| `onCancel` | `CallIdDto` | yo'q (tugatuvchi) | `cancel` | `call:canceled` → chaqirilgan |

`call:ringing` — chaqirilganning qurilmasi `call:incoming` ni olgach yuboradigan ack; server uni chaquvchining personal room'iga uzatadi.

- [ ] **Step 4: Testni ishga tushirish**

Run: `npx jest src/modules/calls/calls.gateway.spec.ts`
Expected: PASS — beshta test.

- [ ] **Step 5: Commit**

```bash
git add src/modules/calls/calls.gateway.ts src/modules/calls/calls.gateway.spec.ts
git commit -m "feat(calls): add /calls signalling gateway with per-event token policy"
```

---

## Task 17: Chat integratsiyasi — qo'ng'iroq yozuvi

**Files:**
- Modify: `src/modules/chat/chat.gateway.ts`, `src/modules/chat/application/chat.service.ts`, `src/modules/chat/domain/chat.repository.ts`, `src/modules/chat/infrastructure/chat.prisma.repository.ts`, `src/modules/chat/domain/entities/message.entity.ts`, `src/modules/chat/presentation/dto/message.dto.ts`, `src/modules/chat/domain/message-composition.ts`, `src/modules/chat/chat.module.ts`
- Test: `src/modules/chat/application/chat.service.call-message.spec.ts`

**Interfaces:**
- Consumes: `CallEndedBus` (12), `Call`, `durationMsOf` (3)
- Produces: `ChatService.appendCallMessage(call: Call): Promise<Message>`; `MessageDto.call` maydoni.

- [ ] **Step 1: Yiqiladigan testni yozish**

```ts
import { AppException } from '../../../common/exceptions/app.exception';
import { MessageType } from '../domain/enums/message-type.enum';

describe('ChatService call messages', () => {
  // ⚠️ `sendMessage` blocks only SYSTEM today, and `toMessageType` accepts any enum member. The
  // moment CALL exists a client can post `message:send { type: "CALL" }` and forge call history.
  it('rejects a client-sent CALL message', async () => {
    const service = buildService();
    await expect(
      service.sendMessage({ id: 'A', type: 'STUDENT' } as never, {
        conversationId: 'cnv_1',
        type: MessageType.CALL,
        body: null,
      } as never),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('writes a CALL message through appendMessage so seq stays contiguous', async () => {
    const service = buildService();
    await service.appendCallMessage(endedCall());
    expect(repo.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.CALL,
        senderId: 'A',
        callId: 'call_1',
        callDuration: 184_000,
      }),
    );
  });

  // §14.2 asks for MISSED to be unread. An answered three-minute call must NOT bump the badge.
  it('marks an answered call read for the callee', async () => {
    const service = buildService();
    await service.appendCallMessage(endedCall());
    expect(repo.markReadUpTo).toHaveBeenCalled();
  });

  it('leaves a missed call unread', async () => {
    const service = buildService();
    await service.appendCallMessage(missedCall());
    expect(repo.markReadUpTo).not.toHaveBeenCalled();
  });
});
```

⚠️ `buildService`, `repo`, `endedCall()`, `missedCall()` yordamchilarini `src/modules/chat/application/chat.service.spec.ts` dagi mavjud mock to'plamidan nusxa oling — u yerda `ChatRepository` mocki allaqachon to'liq yozilgan. `markReadUpTo` nomini o'sha fayldagi haqiqiy metod nomiga moslang (`markRead` bo'lishi mumkin).

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `npx jest src/modules/chat/application/chat.service.call-message.spec.ts`
Expected: FAIL — `service.appendCallMessage is not a function`

- [ ] **Step 3: `CALL` ni klient yo'lidan bloklash**

`chat.service.ts:88` dagi tekshiruvni kengaytiring:

```ts
    // Server-authored types. SYSTEM and CALL rows are written by the server itself — accepting one
    // from a client would let anyone forge system notices or a call history that never happened.
    if (type === MessageType.SYSTEM || type === MessageType.CALL) {
      throw AppException.validation({ type: 'Bu turdagi xabarni yuborib bo‘lmaydi' });
    }
```

Bu **WS va REST ikkalasini ham** yopadi, chunki ikkalasi `sendMessage` ga boradi. REST kontrollerida alohida yo'l bo'lsa, u yerni ham tekshiring.

- [ ] **Step 4: `appendCallMessage` ni yozish**

`chat.repository.ts` dagi `AppendMessageInput` ga qo'shing:

```ts
  callId?: string;
  callMedia?: CallMedia;
  callStatus?: CallStatus;
  callDuration?: number;
  callEndReason?: CallEndReason;
```

`chat.service.ts` ga:

```ts
  /**
   * Write the chat record for a finished call. Called from the CallEndedBus subscription, not by a
   * client — chat owns `seq`, so the row must go through `appendMessage` (which increments
   * `Conversation.nextSeq` inside a transaction) rather than a fresh insert.
   *
   * The call details are snapshotted onto the message rather than joined from `calls`: if either
   * participant's account is deleted the call row cascades away, and a join would leave the client
   * rendering an empty bubble. Same reasoning as the `replyTo*` and `sticker*` columns.
   */
  async appendCallMessage(call: Call): Promise<Message> {
    const message = await this.messages.appendMessage({
      conversationId: call.conversationId,
      senderId: call.callerId,
      type: MessageType.CALL,
      body: null,
      clientMsgId: null,
      callId: call.id,
      callMedia: call.media,
      callStatus: call.status,
      callDuration: durationMsOf(call),
      callEndReason: call.endReason ?? undefined,
    });
    // Only a MISSED call is unread (§14.2). Without this every completed call would bump the
    // callee's badge, because the row's senderId is the caller.
    if (call.status !== CallStatus.MISSED) {
      await this.messages.markRead(call.calleeId, call.conversationId, message.seq);
    }
    return message;
  }
```

`chat.prisma.repository.ts` dagi `appendMessage` ning `data` blokiga yangi maydonlarni uzating.

- [ ] **Step 5: `MessageDto.call` va `pushTextFor` ni tuzatish**

`message.dto.ts` ga ichki DTO va maydon qo'shing:

```ts
export class MessageCallDto {
  @ApiProperty() callId!: string;
  @ApiProperty({ enum: CallMedia, enumName: 'CallMediaDto' }) media!: CallMedia;
  @ApiProperty({ enum: CallStatus, enumName: 'CallStatusDto' }) status!: CallStatus;
  @ApiProperty() durationMs!: number;
  @ApiProperty({ enum: CallEndReason, enumName: 'CallEndReasonDto', nullable: true })
  endReason!: CallEndReason | null;
}
```

`MessageDto` ga `@ApiProperty({ type: MessageCallDto, nullable: true }) call!: MessageCallDto | null;` va `fromDomain` da snapshot ustunlaridan yig'ing.

`chat.gateway.ts` dagi `pushTextFor` ga (1-vazifadagi kompilyatsiya xatosi shu yerda):

```ts
    case MessageType.CALL:
      return '📞 Javobsiz qo‘ng‘iroq';
```

va `switch` oxiriga `default: return 'Xabar';` — eski nusxada (generatsiya qilingan klienti `CALL` dan oldingi) `undefined` qaytmasin.

`message-composition.ts` dagi `REQUIRED_KIND` ga `[MessageType.CALL]: null` qo'shing (ikkinchi kompilyatsiya xatosi).

- [ ] **Step 6: `CallEndedBus` ga obuna bo'lish**

`chat.gateway.ts` ni `OnModuleInit` da (mavjud `mediaReady.subscribe` yonida):

```ts
    // A call record appears in chat when the call ends. The bus keeps the dependency one-way:
    // chat imports calls, never the reverse.
    this.callEnded.subscribe(async (call) => {
      const message = await this.chat.appendCallMessage(call);
      await this.broadcastMessage(message);
    });
```

Konstruktorga `private readonly callEnded: CallEndedBus` qo'shing va `ChatModule` ga `imports: [CallsModule]`.

- [ ] **Step 7: Testlarni ishga tushirish**

Run: `npx jest src/modules/chat && npx tsc --noEmit`
Expected: hammasi PASS; **tsc endi toza** — 1-vazifadagi ikki xato yopildi.

- [ ] **Step 8: Commit**

```bash
git add src/modules/chat
git commit -m "feat(chat): record finished calls as CALL messages with snapshot columns"
```

---

## Task 18: REST endpointlar va modul ulanishi

**Files:**
- Create: `src/modules/calls/presentation/calls.controller.ts`, `src/modules/calls/presentation/dto/call.dto.ts`, `src/modules/calls/presentation/dto/ice-servers.dto.ts`, `src/modules/calls/infrastructure/conversation-directory.prisma.repository.ts`, `src/modules/calls/infrastructure/student-directory.prisma.repository.ts`, `src/modules/calls/calls.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Produces: `GET /v1/calls`, `GET /v1/calls/ice-servers`; `CallsModule` (eksport: `CallsService`, `CallEndedBus`).

- [ ] **Step 1: Yiqiladigan e2e testni yozish**

`test/calls.e2e-spec.ts` — `test/chat-ws.e2e-spec.ts` dagi bootstrap'ni nusxa oling, so'ng:

```ts
  it('requires authentication for ice-servers', async () => {
    await request(app.getHttpServer()).get('/v1/calls/ice-servers').expect(401);
  });

  it('issues a TURN credential to a student', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/calls/ice-servers')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.result.ttlSeconds).toBe(3600);
    expect(res.body.result.iceServers[1].username).toContain(':');
  });

  // ⚠️ IDOR — the filter must be in SQL, not in a mapper.
  it('never returns another student\'s calls', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/calls?page=1&size=20')
      .set('Authorization', `Bearer ${tokenC}`)
      .expect(200);
    expect(res.body.result.items).toEqual([]);
  });

  it('paginates with the project envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/calls?page=1&size=20')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body).toMatchObject({ success: true, status: 200 });
    expect(Object.keys(res.body.result)).toEqual(
      expect.arrayContaining(['items', 'page', 'size', 'total', 'hasNext']),
    );
  });
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `npx jest --config test/jest-e2e.json calls`
Expected: FAIL — 404, marshrut hali yo'q.

- [ ] **Step 3: Kontroller va DTO'larni yozish**

```ts
@ApiTags('Calls')
@UseGuards(JwtAuthGuard, StudentGuard)
@ApiBearerAuth()
@Controller('calls')
export class CallsController {
  constructor(
    @Inject(CALL_REPOSITORY) private readonly calls: CallRepository,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * ⚠️ The student id comes from the token, never from a parameter — this endpoint mints a bearer
   * capability for relay bandwidth, and coturn's per-user quota is keyed on the username. Throttled
   * for the same reason: without it one token farms unlimited credentials.
   */
  @Get('ice-servers')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Vaqtinchalik TURN/STUN hisobi' })
  @ApiEnvelope(IceServersDto)
  iceServers(@CurrentUser() user: AuthenticatedUser): IceServersDto {
    const host = this.config.get('TURN_HOST', { infer: true });
    const secret = this.config.get('TURN_STATIC_SECRET', { infer: true });
    const ttl = this.config.get('TURN_TTL_SECONDS', { infer: true });
    if (host === undefined || secret === undefined) {
      throw new AppException(ERROR_CODE.NOT_IMPLEMENTED, 503, 'Qo‘ng‘iroq xizmati sozlanmagan');
    }
    const cred = buildIceCredential(secret, user.id, ttl, Date.now());
    return { iceServers: buildIceServers(host, cred), ttlSeconds: ttl };
  }

  @Get()
  @ApiOperation({ summary: 'Qo‘ng‘iroqlar tarixi' })
  @ApiEnvelope(CallListDto)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PageQueryDto,
  ): Promise<CallListDto> {
    const { items, total } = await this.calls.listForStudent(user.id, query.page, query.size);
    return {
      items: items.map((call) => CallDto.fromDomain(call, user.id)),
      page: query.page,
      size: query.size,
      total,
      hasNext: query.page * query.size < total,
    };
  }
}
```

⚠️ `PageQueryDto`, `ApiEnvelope`, `CurrentUser`, `JwtAuthGuard`, `StudentGuard` — mavjudlarini `src/modules/discounts/presentation/search.controller.ts` dan aniq import yo'llari bilan nusxa oling.

`CallDto.fromDomain(call, viewerId)` `durationMsOf` ni ishlatadi va `direction: 'INCOMING' | 'OUTGOING'` maydonini `partyOf` orqali to'ldiradi.

- [ ] **Step 4: Qolgan repozitoriylarni va modulni yozish**

`conversation-directory.prisma.repository.ts`:

```ts
@Injectable()
export class ConversationDirectoryPrismaRepository implements ConversationDirectoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreateDirect(a: string, b: string): Promise<string> {
    const directKey = directKeyFor(a, b);
    const existing = await this.prisma.conversation.findUnique({
      where: { directKey },
      select: { id: true },
    });
    if (existing !== null) {
      return existing.id;
    }
    const created = await this.prisma.conversation.create({
      data: {
        directKey,
        type: 'DIRECT',
        members: { create: [{ studentId: a }, { studentId: b }] },
      },
      select: { id: true },
    });
    return created.id;
  }
}
```

⚠️ `create` bloki `chat.prisma.repository.ts:117` dagi `createDirect` bilan **aynan bir xil** bo'lishi kerak — u yerda `nextSeq` yoki boshqa maydon berilsa, bu yerda ham bering.

`calls.module.ts`:

```ts
@Module({
  imports: [ChatModule /* CONNECTION_CHECK uchun */],
  controllers: [CallsController],
  providers: [
    CallsGateway,
    CallsService,
    CallRateLimiter,
    CallEndedBus,
    CallTimersQueue,
    { provide: CALL_REPOSITORY, useClass: CallPrismaRepository },
    { provide: CALL_STATE_REPOSITORY, useClass: CallStateRedisRepository },
    { provide: CALL_TIMERS, useExisting: CallTimersQueue },
    { provide: CONVERSATION_DIRECTORY, useClass: ConversationDirectoryPrismaRepository },
    { provide: CALL_STUDENT_DIRECTORY, useClass: StudentDirectoryPrismaRepository },
  ],
  exports: [CallsService, CallEndedBus, CALL_REPOSITORY],
})
export class CallsModule {}
```

⚠️ **Sikl xavfi.** 17-vazifada `ChatModule` `CallsModule` ni import qiladi, bu yerda `CallsModule` `ChatModule` ni. Buni `forwardRef` bilan **yopmang** — o'rniga `CONNECTION_CHECK` provayderini `ChatModule` dan chiqarib, alohida `SocialGraphModule` ga (yoki `connections` moduliga) ko'chiring va ikkala modul o'shani import qilsin. Bu chalkashlikni butunlay yo'q qiladi.

`CallTimersQueue.register(...)` ni `CallsService` `OnModuleInit` da chaqiring:

```ts
  onModuleInit(): void {
    this.timersQueue.register((kind, callId, studentId) => this.onTimer(kind, callId, studentId).then(() => undefined));
  }
```

Taymer natijasi `call:ended` hodisasini yuborishi kerak — buning uchun `CallsService` ga ixtiyoriy `broadcaster` callback qo'ying va `CallsGateway` `onModuleInit` da ro'yxatdan o'tsin.

`app.module.ts` ga `CallsModule` ni qo'shing.

- [ ] **Step 5: Testni ishga tushirish**

Run: `npx jest --config test/jest-e2e.json calls`
Expected: PASS — to'rtta test.

- [ ] **Step 6: Commit**

```bash
git add src/modules/calls src/app.module.ts test/calls.e2e-spec.ts
git commit -m "feat(calls): add REST endpoints and wire the calls module"
```

---

## Task 19: Rekonsiliatsiya cron'i

**Files:**
- Create: `src/cron/call-reconciliation.cron.ts`
- Test: `src/cron/call-reconciliation.cron.spec.ts`
- Modify: `src/cron/cron.module.ts`, `docker-compose.yml`

**Interfaces:**
- Consumes: `CallRepository.expireStale` (Task 6/8)
- Produces: `CallReconciliationCron.sweep(): Promise<void>`

- [ ] **Step 1: Yiqiladigan testni yozish**

```ts
import { CallReconciliationCron } from './call-reconciliation.cron';

describe('CallReconciliationCron', () => {
  const calls = { expireStale: jest.fn(async () => 0) };

  // ⚠️ Redis restarts with `appendonly` off lose up to a minute of writes, including BullMQ delayed
  // jobs. Without this backstop the Postgres row stays RINGING forever and the user's history shows
  // a call that never stops ringing.
  it('closes calls left live for longer than the duration cap', async () => {
    await new CallReconciliationCron(calls as never).sweep();
    const cutoff = calls.expireStale.mock.calls[0][0] as Date;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(4 * 3600 * 1000);
  });

  it('logs nothing when there was nothing to close', async () => {
    calls.expireStale.mockResolvedValueOnce(0);
    await expect(new CallReconciliationCron(calls as never).sweep()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Testni ishga tushirib yiqilishini ko'rish**

Run: `npx jest src/cron/call-reconciliation.cron.spec.ts`
Expected: FAIL — modul yo'q.

- [ ] **Step 3: Implementatsiya**

`story-cleanup.cron.ts` naqshini takrorlang:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CALL_REPOSITORY, CallRepository } from '../modules/calls/domain/call.repository';

const MAX_CALL_MS = 4 * 3600 * 1000;

/**
 * Backstop for calls Redis or BullMQ lost.
 *
 * The design rejected a cron sweeper as the PRIMARY timer — 45 seconds of ringing must be 45, not
 * 50. This is the other thing: a safety net at cron granularity. Without it a call whose live state
 * vanished stays RINGING in Postgres forever, and the user sees a call that never ends in their
 * history.
 */
@Injectable()
export class CallReconciliationCron {
  private readonly logger = new Logger(CallReconciliationCron.name);

  constructor(@Inject(CALL_REPOSITORY) private readonly calls: CallRepository) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep(): Promise<void> {
    const closed = await this.calls.expireStale(new Date(Date.now() - MAX_CALL_MS));
    if (closed > 0) {
      this.logger.warn(
        `Reconciliation closed ${closed} call(s) left live past the duration cap — ` +
          'this means live state or a timer job was lost. Check Redis persistence.',
      );
    }
  }
}
```

`cron.module.ts` ga provayder sifatida qo'shing va `imports` ga `CallsModule`.

- [ ] **Step 4: Redis chidamliligini yoqish**

`docker-compose.yml` da Redis xizmatiga:

```yaml
    command: redis-server --appendonly yes
```

Izoh qo'shing: `# Without AOF an ungraceful restart loses up to a minute of writes — including the delayed BullMQ jobs that close ringing calls.`

- [ ] **Step 5: Testni ishga tushirish**

Run: `npx jest src/cron/call-reconciliation.cron.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cron docker-compose.yml
git commit -m "feat(calls): add reconciliation cron and enable Redis AOF"
```

---

## Task 20: coturn konfiguratsiyasi, hujjatlar va yakuniy tekshiruv

**Files:**
- Create: `deploy/coturn/turnserver.conf`, `deploy/coturn/README.md`, `docs/architecture/calls.md`
- Modify: `docs/handoff/RUNBOOK.md`

- [ ] **Step 1: coturn konfiguratsiyasini yozish**

`deploy/coturn/turnserver.conf` — manba spec §11.1 ni asos qiling, lekin **kengaytirilgan deny ro'yxati bilan**:

```conf
listening-port=3478
tls-listening-port=5349
# Vital for restrictive networks (university Wi-Fi, corporate proxies) where only 443 is open.
# Without it a share of calls never connect at all.
alt-tls-listening-port=443

fingerprint
lt-cred-mech
use-auth-secret
# ⚠️ PLACEHOLDER — rendered from TURN_STATIC_SECRET at deploy time. Never commit a real secret:
# anyone holding it can mint TURN credentials for any studentId.
static-auth-secret=__TURN_STATIC_SECRET__
realm=elonuz.uz

listening-ip=__SERVER_PRIVATE_IP__
external-ip=__SERVER_PUBLIC_IP__

# ── Relay deny list ───────────────────────────────────────────────────────────
# Stops TURN being used as a route into anything but the public internet.
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
# ⚠️ Cloud metadata (169.254.169.254). Without this, anyone with a TURN credential can allocate a
# relay and read the instance's IAM credentials from the TURN host. This is SSRF with a
# stolen-cloud-role payoff — the single most important line in this file.
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
# ⚠️ IPv6. A dual-stack host bypasses every IPv4 rule above without these.
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
# TCP relay (RFC 6062) is what turns the above into an HTTP client. Leave off unless proven needed.
no-tcp-relay

# 2 concurrent calls per student. The spec's 12 lets one abusive account eat the global quota and
# deny relay to everyone.
user-quota=4
total-quota=1200
cert=/etc/letsencrypt/live/turn.elonuz.uz/fullchain.pem
pkey=/etc/letsencrypt/live/turn.elonuz.uz/privkey.pem
```

`deploy/coturn/README.md` — o'rnatish, sertifikat, va **deploy'ni bloklovchi ro'yxat**: 443/TLS ochiqmi · `denied-peer-ip` to'liqmi · `static-auth-secret` env'dan render qilinganmi va `TURN_STATIC_SECRET` bilan bir xilmi · coturn xosti API/DB/metadata'ga marshrutsiz segmentdami.

- [ ] **Step 2: Protokol hujjatini yozish**

`docs/architecture/calls.md` — `docs/architecture/chat.md` dagi «Real-time protocol» bo'limi uslubida:
16 hodisa jadvali (yo'nalish + payload) · holat diagrammasi · taymerlar · xato kodlari · **mobil jamoaga ikki qo'shimcha**: `call:connected` va `relayOnly` (spec §17).

`docs/handoff/RUNBOOK.md` ga bo'lim: TURN env o'zgaruvchilari, coturn ishlayotganini tekshirish (`turnutils_uclient`), rekonsiliatsiya cron ogohlantirishi nimani anglatishi.

- [ ] **Step 3: To'liq tekshiruv**

Run: `npx tsc --noEmit && npm run lint && npx jest --silent && npx jest --config test/jest-e2e.json`
Expected: hammasi toza.

- [ ] **Step 4: OpenAPI spec'ini yangilash**

Run: `npm run openapi:dump`
Expected: `docs/api/generated/student.json` da `/v1/calls` va `/v1/calls/ice-servers` paydo bo'ladi, `MessageTypeDto` da `CALL` bor, `MessageDto.call` maydoni bor.

- [ ] **Step 5: Commit**

```bash
git add deploy/coturn docs/architecture/calls.md docs/handoff/RUNBOOK.md docs/api/generated
git commit -m "docs(calls): add coturn config, calls protocol doc and regenerate OpenAPI"
```

---

## Self-review

**Spec qamrovi.** Spec bo'limlari → vazifalar: §4 modeli → 1 · §5 holat/taymer/glare → 4, 5, 9, 13, 14 · §6.0 avtorizatsiya → 13 · §6.1 ruxsat va `conversationId` → 12 · §6.3 validatsiya → 15 · §6.4 token siyosati → 16 · §6.5 umumiy kod → 2 · §6.6 rate-limit → 11 · §6.8 uzilish → 14, 16 · §7 chat yozuvi → 17 · §9 TURN → 10, 20 · §10 REST → 18 · §11 rekonsiliatsiya → 19 · §15 qabul mezonlari → 20.

**Bo'shliqlar (ongli).** 1-bosqichda `POST /v1/calls/{id}/stats`, `Report.callId` va «IP manzilimni yashirish» profil sozlamasi **yo'q** — ular 3-bosqichda. `CallStat` jadvali 1-vazifada yaratiladi (bir migratsiya bo'lsin), lekin unga hech narsa yozilmaydi.

**Ikki joyda ehtiyot bo'lish kerak** (rejada belgilangan, lekin ta'kidlayman):
1. **18-vazifadagi modul sikli** — `ChatModule ↔ CallsModule`. `forwardRef` bilan yopish o'rniga `CONNECTION_CHECK` ni umumiy modulga chiqarish kerak. Bu implementatsiya paytida qaror talab qiladi.
2. **12-vazifadagi cuid generatsiyasi** — id Redis'ga yozish uchun oldindan kerak, ya'ni Prisma `@default(cuid())` ishlamaydi. Loyihada allaqachon o'rnatilgan generatorni tekshiring.

**Tip muvofiqligi.** `closeCall` 12-vazifada `Promise<void>`, 13-vazifada `Promise<CallOutcome | null>` — 13-vazifa uni ochiq yangilaydi. `CallStateRepository.compareAndSetStatus` ning to'rtinchi argumenti hamma joyda `answeredAt?: string`. `CallTimerKind` — `'ring' | 'connect' | 'max' | 'grace'`, job id'lari `jobIdFor` orqali.

