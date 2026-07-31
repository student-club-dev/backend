# Chat: selection, history clearing & quoted replies — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `docs/api/mobile_questions/CHAT_SELECTION_AND_HISTORY_BACKEND.md` — multi-select delete with `ME`/`EVERYONE` scope, history clearing, conversation deletion, and quoted replies — without ever renumbering `seq`.

**Architecture:** Two per-member watermarks do all the hiding, so no message row is ever renumbered or removed on the request path. `message_hidden(student_id, message_id)` hides individual rows from one member; `conversation_members.cleared_before_seq` hides everything below a point. Every history read funnels through one shared `WHERE` fragment so a filter can never be forgotten in one query and applied in another. Quoted replies are denormalised snapshot columns on `messages` (the same pattern the sticker columns already use) plus a self-FK for the "jump to" target.

**Tech Stack:** NestJS 10, Prisma 5 + PostgreSQL 16, Socket.IO (`/chat` namespace), class-validator, Jest (unit + e2e via `test/jest-e2e.json`), Swagger → `npm run openapi:dump`.

---

## Deviations from the spec — read before starting

These are places where the spec cannot be followed literally in this repo. Each is a deliberate decision; the reasoning goes into the mobile-facing response doc (Task 21).

| # | Spec says | We do | Why |
|---|---|---|---|
| D1 | Ship A2 (bulk delete) in step 1, A1 (`scope=ME`) in step 2 | **Both in Stage 1** | `scope` is a required enum in the A2 request body. Shipping `POST /v1/messages/delete` before `message_hidden` exists means the generated Kotlin client gets a `ME` value that 422s. One contract, one stage. |
| D2 | `uuid`, `REFERENCES users(id)` | `String` cuid, `REFERENCES students(id)` | Chat is students-only; `ConversationMember.studentId → Student`. There is no `users` table. |
| D3 | `CREATE INDEX message_hidden_user_idx ON message_hidden(user_id, message_id)` | Dropped; `@@index([messageId])` instead | The spec's index duplicates the primary key exactly (same columns, same order) — Postgres would never use it. The reverse direction is the one that is actually missing. |
| D4 | `?around=141&limit=50` | `?around=141&size=50` | Every list in this API pages with `size` (CLAUDE.md, `HistoryQueryDto`). Introducing `limit` on one endpoint splits the contract. |
| D5 | WS `message:deleted` keeps `{ id, seq }` | Keeps `{ messageId, seq }` | The deployed event already sends `messageId`, not `id` (`chat.gateway.ts:242-246`). Backward compatibility means keeping what ships today. |
| D6 | `TOO_MANY_IDS` / `QUOTE_TOO_LONG` as error codes | Thrown from the service, not `@ArrayMaxSize`/`@MaxLength` | class-validator would emit `VALIDATION_ERROR` with `fields`, not the spec's code. DTOs still validate shape (`@IsArray`, `@ArrayMinSize(1)`, element type). |
| D7 | Undefined: every id in `ids` is unknown | `404 MESSAGE_NOT_FOUND` | The `200` response requires `conversationId`, `unreadCount` and `lastMessage`. With zero resolvable ids there is no conversation to report on. ≥1 resolvable id ⇒ `200` with the rest in `skipped`. |
| D8 | `hasMore` for `?around=` unspecified | `hasMore` = older messages exist below the window | The client scrolls up from a jump target; that is the direction that needs the flag. |

---

## File structure

**Stage 1 — Part A (multi-delete + `ME` scope + WS)**

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `MessageHidden` model, `Message.hidden` back-relation, `ConversationMember.clearedBeforeSeq` |
| `src/modules/chat/domain/enums/delete-scope.enum.ts` | **Create.** `DeleteScope` enum — the only definition, reused by DTO, service and WS |
| `src/modules/chat/domain/entities/conversation.entity.ts` | `ConversationMember.clearedBeforeSeq` |
| `src/modules/chat/domain/chat.repository.ts` | `BulkDeleteResult`, `SkippedMessage`, new port methods, viewer-aware read signatures |
| `src/modules/chat/infrastructure/chat.prisma.repository.ts` | `visibleTo()` shared WHERE, bulk-delete transaction, filtered reads |
| `src/modules/chat/infrastructure/chat.mapper.ts` | Map `clearedBeforeSeq` |
| `src/modules/chat/application/chat.service.ts` | `deleteMessages()` use-case, `assertMember` returns the membership |
| `src/modules/chat/presentation/dto/requests.dto.ts` | `DeleteMessagesDto` |
| `src/modules/chat/presentation/dto/message.dto.ts` | `BulkDeleteResultDto`, `SkippedMessageDto` |
| `src/modules/chat/presentation/messages.controller.ts` | `POST /v1/messages/delete`, `?scope=` on `DELETE /v1/messages/:id` |
| `src/modules/chat/application/chat-events.ts` | `MessageDeletedPayload` |
| `src/modules/chat/chat.gateway.ts` | `broadcastBulkDeleted()` |
| `src/common/errors/error-code.ts` | `NOT_MEMBER`, `TOO_MANY_IDS`, `MIXED_CONVERSATIONS` |

**Stage 2 — Part B1 (clear history) + purge cron**

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | (no change — `clearedBeforeSeq` landed in Stage 1) |
| `src/modules/chat/presentation/conversations.controller.ts` | `DELETE /v1/conversations/:id/history` |
| `src/modules/chat/presentation/dto/queries.dto.ts` | `ScopeQueryDto` |
| `src/cron/message-purge.cron.ts` | **Create.** Weekly physical purge below both members' watermarks |
| `src/cron/cron.module.ts` | Register `MessagePurgeCron` |

**Stage 3 — Part C (reply/quote + `?around=`)**

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `Message.replyTo*`, `Message.quote*`, self-relation |
| `src/modules/chat/domain/entities/message.entity.ts` | `ReplySnapshot` value object |
| `src/modules/chat/domain/message-composition.ts` | `assertQuoteMatches()` — pure validation |
| `src/modules/chat/presentation/dto/message.dto.ts` | `ReplyToDto`, `QuoteDto` |
| `src/modules/chat/presentation/dto/queries.dto.ts` | `around` on `HistoryQueryDto` |

**Stage 4 — Part B2 (delete conversation)**

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `ConversationMember.hidden` |
| `src/modules/chat/presentation/conversations.controller.ts` | `DELETE /v1/conversations/:id` |

**Docs (every stage)**

- `docs/handoff/mobile/03-WEBSOCKET.md` — WS events
- `docs/api/generated/student.json` + `docs/handoff/mobile/student-api.json` — via `npm run openapi:dump`
- `docs/api/mobile_questions/CHAT_SELECTION_AND_HISTORY_RESPONSE.md` — the reply to the mobile dev

---

# STAGE 1 — Part A: multi-select delete

## Task 1: Error codes

**Files:**
- Modify: `src/common/errors/error-code.ts:113-118`

- [ ] **Step 1: Add the three codes to the chat block**

In the `// chat` block, after `MESSAGE_NOT_FOUND`:

```ts
  // chat — bulk delete (§A2). NOT_MEMBER is 403 and distinct from CONVERSATION_NOT_FOUND (404):
  // once at least one id resolves to a real conversation, hiding its existence is pointless — the
  // caller already holds a message id from it.
  NOT_MEMBER: 'NOT_MEMBER',
  TOO_MANY_IDS: 'TOO_MANY_IDS',
  MIXED_CONVERSATIONS: 'MIXED_CONVERSATIONS',
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/common/errors/error-code.ts
git commit -m "feat(chat): add bulk-delete error codes"
```

---

## Task 2: `DeleteScope` enum

**Files:**
- Create: `src/modules/chat/domain/enums/delete-scope.enum.ts`

- [ ] **Step 1: Create the enum**

```ts
/**
 * Who a delete applies to (§A1).
 *
 * `EVERYONE` is the existing soft delete: the row keeps its `seq`, `body` is blanked, both members
 * see a tombstone. It is only allowed on your own messages.
 *
 * `ME` touches no message row at all — it writes a `message_hidden` tombstone for the caller, so the
 * message vanishes on every device they own and stays put for the other member. Because nothing is
 * mutated, it applies to any message in the conversation, theirs included.
 */
export enum DeleteScope {
  ME = 'ME',
  EVERYONE = 'EVERYONE',
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/chat/domain/enums/delete-scope.enum.ts
git commit -m "feat(chat): add DeleteScope enum"
```

---

## Task 3: Prisma schema — `message_hidden` + `cleared_before_seq`

**Files:**
- Modify: `prisma/schema.prisma:973-1038`

> Invoke the `prisma-migration` skill before this task and `db-review` after it — CLAUDE.md makes both mandatory for a schema change.

- [ ] **Step 1: Add `clearedBeforeSeq` to `ConversationMember`**

After `lastDeliveredSeq` (line 978):

```prisma
  /// History watermark (§B1). Reads filter `seq > clearedBeforeSeq` for THIS member only, so
  /// "clear history" costs one integer instead of deleting rows — which would tear holes in the
  /// `seq` axis the other member's cursors still walk.
  clearedBeforeSeq Int       @default(0) @map("cleared_before_seq")
```

- [ ] **Step 2: Add the `hidden` back-relation to `Message`**

In `model Message`, next to the other relations (after `attachment MediaAsset?`, line 1029):

```prisma
  hidden       MessageHidden[]
```

- [ ] **Step 3: Add the `MessageHidden` model**

After `model Message`'s closing brace (line 1038):

```prisma
/// Per-member "delete for me" tombstone (§A1). Deliberately not a column on `messages`: the same
/// row is visible to one member and hidden from the other, which a per-message flag cannot express.
model MessageHidden {
  studentId String   @map("student_id")
  messageId String   @map("message_id")
  hiddenAt  DateTime @default(now()) @map("hidden_at")

  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)

  // The PK covers every read this table serves: "is (me, message) hidden" and "everything I hid".
  // A second index on the same columns in the same order — as the spec sketched — would never be
  // chosen by the planner. The reverse direction is the one worth having: the purge cron and the
  // FK cascade both look rows up by message.
  @@id([studentId, messageId])
  @@index([messageId])
  @@map("message_hidden")
}
```

- [ ] **Step 4: Add the reverse relation on `Student`**

Find `model Student` and add to its relation list:

```prisma
  hiddenMessages MessageHidden[]
```

- [ ] **Step 5: Generate the migration**

Run: `npx prisma migrate dev --name chat_message_hidden_and_cleared_watermark`
Expected: a new folder under `prisma/migrations/`, and `prisma generate` runs.

- [ ] **Step 6: Read the generated SQL**

Run: `cat prisma/migrations/*chat_message_hidden_and_cleared_watermark/migration.sql`
Expected — verify all four, do not skip:
- `ALTER TABLE "conversation_members" ADD COLUMN "cleared_before_seq" INTEGER NOT NULL DEFAULT 0;` — additive with a default, safe on a populated table.
- `CREATE TABLE "message_hidden"` with a composite PK.
- `CREATE INDEX "message_hidden_message_id_idx"`.
- Two `ADD CONSTRAINT ... FOREIGN KEY ... ON DELETE CASCADE`.
- **No `DROP`, no `NOT NULL` without a default.** If any appears, stop and fix the schema.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(chat): add message_hidden table and cleared_before_seq watermark"
```

---

## Task 4: Domain — entity + port

**Files:**
- Modify: `src/modules/chat/domain/entities/conversation.entity.ts:12-17`
- Modify: `src/modules/chat/domain/chat.repository.ts`

- [ ] **Step 1: Add `clearedBeforeSeq` to the member entity**

```ts
/** A member's row, carrying the per-member read/delivered cursors (C5) and history watermark (§B1). */
export interface ConversationMember {
  conversationId: string;
  studentId: string;
  lastReadSeq: number;
  lastDeliveredSeq: number;
  /** Reads hide `seq <= clearedBeforeSeq` for this member. `0` ⇒ nothing cleared. */
  clearedBeforeSeq: number;
}
```

- [ ] **Step 2: Add the result types to the port**

In `src/modules/chat/domain/chat.repository.ts`, after `UnreadSummary`:

```ts
/** Why one id in a bulk delete was left alone (§A2). */
export interface SkippedMessage {
  id: string;
  reason: 'NOT_OWN' | 'NOT_FOUND' | 'NOT_MEMBER';
}

/**
 * The outcome of one bulk delete. `unreadCount` and `lastMessage` are recomputed once, inside the
 * same transaction, so the client can settle its list without a follow-up round trip (§A2).
 */
export interface BulkDeleteResult {
  conversationId: string;
  deleted: string[];
  deletedSeqs: number[];
  skipped: SkippedMessage[];
  unreadCount: number;
  lastMessage: Message | null;
}

/** Who is reading — every history query is filtered through this (§A4.3). */
export interface MessageViewer {
  studentId: string;
  clearedBeforeSeq: number;
}
```

- [ ] **Step 3: Change the read signatures to take a viewer**

Replace the `listMessages` and `listSince` declarations:

```ts
  /**
   * History strictly before `beforeSeq` (null = latest), newest-first, capped at `size`. Callers
   * pass `size + 1` and drop the extra row to compute `hasMore` exactly (§17.5). Rows the viewer
   * hid or cleared past are excluded in the `WHERE`, never after `take` — filtering a page that is
   * already limited returns short pages, which the client reads as "history over" (§A4.3).
   */
  listMessages(
    conversationId: string,
    viewer: MessageViewer,
    beforeSeq: number | null,
    size: number,
  ): Promise<Message[]>;

  /**
   * Messages strictly after `afterSeq`, oldest-first — for reconnect catch-up (C6). Same `size + 1`
   * convention and the same viewer filtering as `listMessages`.
   */
  listSince(
    conversationId: string,
    viewer: MessageViewer,
    afterSeq: number,
    size: number,
  ): Promise<Message[]>;
```

- [ ] **Step 4: Add the bulk-delete port method**

```ts
  /** Every message named by `ids`, with just the columns the delete has to authorise against. */
  findMessagesByIds(
    ids: string[],
  ): Promise<{ id: string; conversationId: string; senderId: string; seq: number; deletedAt: Date | null }[]>;

  /**
   * Applies one delete to many messages in a single transaction (§A4.4), then recomputes the
   * conversation's unread count and last-visible message once. Either everything lands or nothing
   * does — a half-applied delete leaves the badge and the list disagreeing with the history.
   */
  deleteMessages(
    conversationId: string,
    viewer: MessageViewer,
    ids: string[],
    scope: DeleteScope,
  ): Promise<{ deletedSeqs: number[]; unreadCount: number; lastMessage: Message | null }>;
```

Add the import at the top:

```ts
import { DeleteScope } from './enums/delete-scope.enum';
```

- [ ] **Step 5: Typecheck — expect failures**

Run: `npx tsc --noEmit`
Expected: FAIL — `ChatPrismaRepository` does not implement the new methods, and `chat.service.ts` calls `listMessages` with the old arity. Those are Tasks 5 and 6.

---

## Task 5: Repository — shared filter + filtered reads

**Files:**
- Modify: `src/modules/chat/infrastructure/chat.prisma.repository.ts`
- Modify: `src/modules/chat/infrastructure/chat.mapper.ts`

- [ ] **Step 1: Map the new column**

In `chat.mapper.ts`, in `toMember`, add:

```ts
      clearedBeforeSeq: row.clearedBeforeSeq,
```

- [ ] **Step 2: Add the shared WHERE fragment**

In `chat.prisma.repository.ts`, above the class:

```ts
/**
 * The `WHERE` every history read shares (§A4.3): rows below this member's clear watermark, and rows
 * they hid for themselves. It exists as one function rather than being spelled out per query
 * because the failure mode of forgetting it in one place is silent — a cleared message reappears in
 * `lastMessage` while the history hides it, and the two views of the same conversation disagree.
 */
function visibleTo(conversationId: string, viewer: MessageViewer): Prisma.MessageWhereInput {
  return {
    conversationId,
    seq: { gt: viewer.clearedBeforeSeq },
    hidden: { none: { studentId: viewer.studentId } },
  };
}
```

Import `MessageViewer`, `BulkDeleteResult`, `SkippedMessage` and `DeleteScope` alongside the existing repository imports.

- [ ] **Step 3: Rewrite `listMessages` and `listSince`**

```ts
  async listMessages(
    conversationId: string,
    viewer: MessageViewer,
    beforeSeq: number | null,
    size: number,
  ): Promise<Message[]> {
    const rows = await this.prisma.message.findMany({
      where: {
        ...visibleTo(conversationId, viewer),
        ...(beforeSeq === null ? {} : { seq: { gt: viewer.clearedBeforeSeq, lt: beforeSeq } }),
      },
      // `seq` is unique per conversation, so it alone is already a total order — `createdAt`/`id`
      // are there to keep the plan deterministic if that invariant is ever violated (§A4.2).
      orderBy: [{ seq: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: size,
      include: MESSAGE_INCLUDE,
    });
    return rows.map(ChatMapper.toMessage);
  }

  async listSince(
    conversationId: string,
    viewer: MessageViewer,
    afterSeq: number,
    size: number,
  ): Promise<Message[]> {
    const rows = await this.prisma.message.findMany({
      where: {
        ...visibleTo(conversationId, viewer),
        seq: { gt: Math.max(afterSeq, viewer.clearedBeforeSeq) },
      },
      orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: size,
      include: MESSAGE_INCLUDE,
    });
    return rows.map(ChatMapper.toMessage);
  }
```

- [ ] **Step 4: Filter `toListItem`**

Replace the `Promise.all` body in `toListItem` so both reads respect the viewer. Change the signature to take the whole membership row:

```ts
  private async toListItem(
    conversation: PrismaConversation,
    membership: { lastReadSeq: number; clearedBeforeSeq: number },
    otherMember: OtherMemberRow | undefined,
    studentId: string,
  ): Promise<ConversationListItem> {
    const viewer: MessageViewer = {
      studentId,
      clearedBeforeSeq: membership.clearedBeforeSeq,
    };
    const [lastRow, unreadCount] = await Promise.all([
      this.prisma.message.findFirst({
        where: visibleTo(conversation.id, viewer),
        orderBy: [{ seq: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        include: MESSAGE_INCLUDE,
      }),
      this.prisma.message.count({
        where: {
          ...visibleTo(conversation.id, viewer),
          seq: { gt: Math.max(membership.lastReadSeq, membership.clearedBeforeSeq) },
          senderId: { not: studentId },
          // A deleted message must not keep the badge lit: it is invisible, so it can never be read.
          deletedAt: null,
        },
      }),
    ]);
    const otherRow = otherMember?.student;
    return {
      conversation: ChatMapper.toConversation(conversation),
      other: otherRow === undefined ? MISSING_MEMBER : ChatMapper.toSummary(otherRow),
      // Shown even when deleted — the client draws the tombstone. Hidden and cleared rows are gone
      // from `visibleTo`, so the two members can legitimately see different last messages (§A4.5).
      lastMessage: lastRow === null ? null : ChatMapper.toMessage(lastRow),
      unreadCount,
      myReadSeq: membership.lastReadSeq,
      peerReadSeq: otherMember?.lastReadSeq ?? 0,
      peerDeliveredSeq: otherMember?.lastDeliveredSeq ?? 0,
    };
  }
```

Update both call sites (`listConversations`, `findConversationItem`) to pass `membership` instead of `membership.lastReadSeq`, and add `clearedBeforeSeq: true` to the `select` where the membership is loaded (it is loaded whole today, so no change is needed — verify).

- [ ] **Step 5: Filter `unreadSummary`**

Replace the raw SQL's `LEFT JOIN` predicate list:

```ts
    const rows = await this.prisma.$queryRaw<{ total: number; conversations: number }[]>`
      SELECT
        COALESCE(SUM(c.unread), 0)::int             AS total,
        (COUNT(*) FILTER (WHERE c.unread > 0))::int AS conversations
      FROM (
        SELECT COUNT(m.id) AS unread
        FROM conversation_members cm
        LEFT JOIN messages m
          ON m.conversation_id = cm.conversation_id
         AND m.seq > GREATEST(cm.last_read_seq, cm.cleared_before_seq)
         AND m.sender_id <> cm.student_id
         AND m.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM message_hidden h
           WHERE h.message_id = m.id AND h.student_id = cm.student_id
         )
        WHERE cm.student_id = ${studentId}
        GROUP BY cm.id
      ) c
    `;
```

- [ ] **Step 6: Implement `findMessagesByIds`**

```ts
  findMessagesByIds(
    ids: string[],
  ): Promise<{ id: string; conversationId: string; senderId: string; seq: number; deletedAt: Date | null }[]> {
    return this.prisma.message.findMany({
      where: { id: { in: ids } },
      select: { id: true, conversationId: true, senderId: true, seq: true, deletedAt: true },
    });
  }
```

- [ ] **Step 7: Implement `deleteMessages`**

```ts
  async deleteMessages(
    conversationId: string,
    viewer: MessageViewer,
    ids: string[],
    scope: DeleteScope,
  ): Promise<{ deletedSeqs: number[]; unreadCount: number; lastMessage: Message | null }> {
    return this.prisma.$transaction(async (tx) => {
      if (scope === DeleteScope.EVERYONE) {
        // Only rows not already deleted are touched, so a retry keeps the original `deletedAt`
        // instead of sliding it forward on every call (§0.4 idempotency).
        await tx.message.updateMany({
          where: { id: { in: ids }, conversationId, deletedAt: null },
          data: { deletedAt: new Date(), body: null },
        });
      } else {
        await tx.messageHidden.createMany({
          data: ids.map((messageId) => ({ studentId: viewer.studentId, messageId })),
          skipDuplicates: true,
        });
      }

      const rows = await tx.message.findMany({
        where: { id: { in: ids } },
        select: { seq: true },
        orderBy: { seq: 'asc' },
      });

      // Recomputed once, from the post-delete state — decrementing per message races with a
      // concurrent send and drives the badge negative (§A4.4.3).
      const [lastRow, unreadCount] = await Promise.all([
        tx.message.findFirst({
          where: visibleTo(conversationId, viewer),
          orderBy: [{ seq: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
          include: MESSAGE_INCLUDE,
        }),
        tx.message.count({
          where: {
            ...visibleTo(conversationId, viewer),
            seq: { gt: viewer.clearedBeforeSeq },
            senderId: { not: viewer.studentId },
            deletedAt: null,
          },
        }),
      ]);

      return {
        deletedSeqs: rows.map((row) => row.seq),
        unreadCount,
        lastMessage: lastRow === null ? null : ChatMapper.toMessage(lastRow),
      };
    });
  }
```

> The unread recount deliberately drops the `lastReadSeq` bound the list query uses: this result feeds the open conversation, where the client has just read everything above the delete. Cross-check against `toListItem` during review — if they must agree, factor one helper.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL only in `chat.service.ts` (old call arity) — fixed in Task 6.

---

## Task 6: Service — `deleteMessages` use-case

**Files:**
- Modify: `src/modules/chat/application/chat.service.ts`
- Test: `src/modules/chat/application/chat.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `chat.service.spec.ts` (follow the existing `makeService`/mock-repo helpers in that file):

```ts
describe('deleteMessages', () => {
  const me = { id: 'me', role: 'STUDENT' } as AuthenticatedUser;

  it('skips messages that are not yours when the scope is EVERYONE', async () => {
    const repo = makeRepo({
      findMessagesByIds: jest.fn().mockResolvedValue([
        { id: 'a', conversationId: 'c1', senderId: 'me', seq: 1, deletedAt: null },
        { id: 'b', conversationId: 'c1', senderId: 'other', seq: 2, deletedAt: null },
      ]),
      findMembership: jest.fn().mockResolvedValue({
        conversationId: 'c1', studentId: 'me', lastReadSeq: 0, lastDeliveredSeq: 0, clearedBeforeSeq: 0,
      }),
      deleteMessages: jest.fn().mockResolvedValue({ deletedSeqs: [1], unreadCount: 0, lastMessage: null }),
    });
    const result = await makeService(repo).deleteMessages(me, ['a', 'b'], DeleteScope.EVERYONE);

    expect(result.deleted).toEqual(['a']);
    expect(result.skipped).toEqual([{ id: 'b', reason: 'NOT_OWN' }]);
    expect(repo.deleteMessages).toHaveBeenCalledWith('c1', expect.anything(), ['a'], DeleteScope.EVERYONE);
  });

  it('hides anyone\'s message when the scope is ME', async () => {
    const repo = makeRepo({
      findMessagesByIds: jest.fn().mockResolvedValue([
        { id: 'b', conversationId: 'c1', senderId: 'other', seq: 2, deletedAt: null },
      ]),
      findMembership: jest.fn().mockResolvedValue({
        conversationId: 'c1', studentId: 'me', lastReadSeq: 0, lastDeliveredSeq: 0, clearedBeforeSeq: 0,
      }),
      deleteMessages: jest.fn().mockResolvedValue({ deletedSeqs: [2], unreadCount: 0, lastMessage: null }),
    });
    const result = await makeService(repo).deleteMessages(me, ['b'], DeleteScope.ME);

    expect(result.deleted).toEqual(['b']);
    expect(result.skipped).toEqual([]);
  });

  it('rejects ids drawn from more than one conversation', async () => {
    const repo = makeRepo({
      findMessagesByIds: jest.fn().mockResolvedValue([
        { id: 'a', conversationId: 'c1', senderId: 'me', seq: 1, deletedAt: null },
        { id: 'b', conversationId: 'c2', senderId: 'me', seq: 1, deletedAt: null },
      ]),
    });
    await expect(makeService(repo).deleteMessages(me, ['a', 'b'], DeleteScope.ME)).rejects.toMatchObject({
      code: ERROR_CODE.MIXED_CONVERSATIONS,
      status: 422,
    });
  });

  it('rejects more than 100 ids', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `m${i}`);
    await expect(makeService(makeRepo({})).deleteMessages(me, ids, DeleteScope.ME)).rejects.toMatchObject({
      code: ERROR_CODE.TOO_MANY_IDS,
      status: 422,
    });
  });

  it('reports unknown ids as skipped rather than failing the batch', async () => {
    const repo = makeRepo({
      findMessagesByIds: jest.fn().mockResolvedValue([
        { id: 'a', conversationId: 'c1', senderId: 'me', seq: 1, deletedAt: null },
      ]),
      findMembership: jest.fn().mockResolvedValue({
        conversationId: 'c1', studentId: 'me', lastReadSeq: 0, lastDeliveredSeq: 0, clearedBeforeSeq: 0,
      }),
      deleteMessages: jest.fn().mockResolvedValue({ deletedSeqs: [1], unreadCount: 0, lastMessage: null }),
    });
    const result = await makeService(repo).deleteMessages(me, ['a', 'ghost'], DeleteScope.EVERYONE);

    expect(result.deleted).toEqual(['a']);
    expect(result.skipped).toEqual([{ id: 'ghost', reason: 'NOT_FOUND' }]);
  });

  it('403s when the caller does not belong to the conversation', async () => {
    const repo = makeRepo({
      findMessagesByIds: jest.fn().mockResolvedValue([
        { id: 'a', conversationId: 'c1', senderId: 'other', seq: 1, deletedAt: null },
      ]),
      findMembership: jest.fn().mockResolvedValue(null),
    });
    await expect(makeService(repo).deleteMessages(me, ['a'], DeleteScope.ME)).rejects.toMatchObject({
      code: ERROR_CODE.NOT_MEMBER,
      status: 403,
    });
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx jest src/modules/chat/application/chat.service.spec.ts -t deleteMessages`
Expected: FAIL — `chat.deleteMessages is not a function`.

- [ ] **Step 3: Make `assertMember` return the membership**

```ts
  private async assertMember(conversationId: string, studentId: string): Promise<ConversationMember> {
    const membership = await this.chat.findMembership(conversationId, studentId);
    if (membership === null) {
      throw AppException.notFound(ERROR_CODE.CONVERSATION_NOT_FOUND, 'Suhbat topilmadi');
    }
    return membership;
  }
```

Update `history` and `messagesSince` to use it:

```ts
  async messagesSince(
    user: AuthenticatedUser,
    conversationId: string,
    afterSeq: number,
    size: number,
  ): Promise<MessagePage> {
    const membership = await this.assertMember(conversationId, user.id);
    return trim(await this.chat.listSince(conversationId, viewerOf(membership), afterSeq, size + 1), size);
  }

  async history(
    user: AuthenticatedUser,
    conversationId: string,
    beforeSeq: number | null,
    size: number,
  ): Promise<MessagePage> {
    const membership = await this.assertMember(conversationId, user.id);
    return trim(
      await this.chat.listMessages(conversationId, viewerOf(membership), beforeSeq, size + 1),
      size,
    );
  }
```

And at the bottom of the file, beside `trim`:

```ts
/** A membership row is all a read needs to know about who is looking (§A4.3). */
function viewerOf(membership: ConversationMember): MessageViewer {
  return { studentId: membership.studentId, clearedBeforeSeq: membership.clearedBeforeSeq };
}
```

- [ ] **Step 4: Implement `deleteMessages`**

```ts
  /**
   * Deletes many messages at once (§A2). One transaction, one recount, one WS event — 50 selected
   * messages used to mean 50 requests, and a partial failure left the list and the badge disagreeing
   * with the history.
   *
   * `EVERYONE` may only touch your own messages; anyone else's are reported in `skipped` rather than
   * failing the batch, because the client selected them in good faith and half a delete is still a
   * useful result. `ME` may touch any message in the conversation — it mutates no message row.
   */
  async deleteMessages(
    user: AuthenticatedUser,
    ids: string[],
    scope: DeleteScope,
  ): Promise<BulkDeleteResult> {
    if (ids.length > MAX_DELETE_IDS) {
      throw new AppException(
        ERROR_CODE.TOO_MANY_IDS,
        422,
        `Bir vaqtda ${MAX_DELETE_IDS} tadan ko'p xabarni o'chirib bo'lmaydi`,
      );
    }
    const unique = [...new Set(ids)];
    const found = await this.chat.findMessagesByIds(unique);

    const conversationIds = new Set(found.map((message) => message.conversationId));
    if (conversationIds.size > 1) {
      throw new AppException(
        ERROR_CODE.MIXED_CONVERSATIONS,
        422,
        'Xabarlar bitta suhbatdan bo‘lishi kerak',
      );
    }
    const conversationId = found[0]?.conversationId;
    if (conversationId === undefined) {
      // Nothing resolved, so there is no conversation to report `unreadCount`/`lastMessage` for.
      throw AppException.notFound(ERROR_CODE.MESSAGE_NOT_FOUND, 'Xabar topilmadi');
    }

    const membership = await this.chat.findMembership(conversationId, user.id);
    if (membership === null) {
      throw new AppException(ERROR_CODE.NOT_MEMBER, 403, 'Siz bu suhbat a’zosi emassiz');
    }

    const byId = new Map(found.map((message) => [message.id, message]));
    const deletable: string[] = [];
    const skipped: SkippedMessage[] = [];
    for (const id of unique) {
      const message = byId.get(id);
      if (message === undefined) {
        skipped.push({ id, reason: 'NOT_FOUND' });
      } else if (scope === DeleteScope.EVERYONE && message.senderId !== user.id) {
        skipped.push({ id, reason: 'NOT_OWN' });
      } else {
        deletable.push(id);
      }
    }

    const viewer = viewerOf(membership);
    if (deletable.length === 0) {
      const item = await this.chat.findConversationItem(conversationId, user.id);
      return {
        conversationId,
        deleted: [],
        deletedSeqs: [],
        skipped,
        unreadCount: item?.unreadCount ?? 0,
        lastMessage: item?.lastMessage ?? null,
      };
    }

    const outcome = await this.chat.deleteMessages(conversationId, viewer, deletable, scope);
    return {
      conversationId,
      deleted: deletable,
      deletedSeqs: outcome.deletedSeqs,
      skipped,
      unreadCount: outcome.unreadCount,
      lastMessage: outcome.lastMessage,
    };
  }
```

Add near the top of the file:

```ts
/** §A2 caps one batch at 100 ids — the client's selection mode cannot exceed it in practice. */
const MAX_DELETE_IDS = 100;
```

and extend the imports with `DeleteScope`, `BulkDeleteResult`, `SkippedMessage`, `MessageViewer`, `ConversationMember`.

- [ ] **Step 5: Run the tests**

Run: `npx jest src/modules/chat/application/chat.service.spec.ts`
Expected: PASS, including the pre-existing tests.

- [ ] **Step 6: Commit**

```bash
git add src/modules/chat
git commit -m "feat(chat): bulk message delete with ME/EVERYONE scope"
```

---

## Task 7: WS event

**Files:**
- Modify: `src/modules/chat/application/chat-events.ts`
- Modify: `src/modules/chat/chat.gateway.ts:237-252`

- [ ] **Step 1: Add the payload type**

In `chat-events.ts`:

```ts
/**
 * `message:deleted` — one event for a whole batch (§A3). `messageId`/`seq` repeat the first element
 * so clients built against the single-message version keep working; new clients read `ids`/`seqs`.
 */
export interface MessageDeletedPayload {
  conversationId: string;
  ids: string[];
  seqs: number[];
  scope: string;
  deletedBy: string;
  /** @deprecated Use `ids`. First element of `ids`, kept for already-shipped clients. */
  messageId: string;
  /** @deprecated Use `seqs`. */
  seq: number;
}
```

- [ ] **Step 2: Add `broadcastBulkDeleted`**

In `chat.gateway.ts`, beside `broadcastDeleted`:

```ts
  /**
   * Tell the right audience a batch was deleted (§A3). A `ME` delete never reaches the other member
   * — the message is still there for them — but it does reach the deleter's other devices, which is
   * the only way a "hidden for me" survives a reinstall or a second phone.
   */
  async broadcastBulkDeleted(
    conversationId: string,
    deletedBy: string,
    ids: string[],
    seqs: number[],
    scope: DeleteScope,
  ): Promise<void> {
    if (this.server === undefined || ids.length === 0) {
      return;
    }
    const rooms = [personalRoom(deletedBy)];
    if (scope === DeleteScope.EVERYONE) {
      const otherId = await this.chat.otherMemberId(conversationId, deletedBy);
      if (otherId !== null) {
        rooms.push(personalRoom(otherId));
      }
    }
    const payload: MessageDeletedPayload = {
      conversationId,
      ids,
      seqs,
      scope,
      deletedBy,
      messageId: ids[0]!,
      seq: seqs[0] ?? 0,
    };
    this.server.to(rooms).emit(CHAT_EVENT.MESSAGE_DELETED, payload);
  }
```

- [ ] **Step 3: Route the single-message delete through the same payload**

Rewrite `broadcastDeleted` so both paths emit one shape:

```ts
  async broadcastDeleted(message: Message): Promise<void> {
    await this.broadcastBulkDeleted(
      message.conversationId,
      message.senderId,
      [message.id],
      [message.seq],
      DeleteScope.EVERYONE,
    );
  }
```

- [ ] **Step 4: Run the gateway tests**

Run: `npx jest src/modules/chat/chat.gateway.spec.ts`
Expected: PASS. If an assertion checks the old payload shape, update it to the new one — `messageId` and `seq` are still present, so only added keys should differ.

- [ ] **Step 5: Commit**

```bash
git add src/modules/chat
git commit -m "feat(chat): single message:deleted event for batch deletes"
```

---

## Task 8: DTOs + controller

**Files:**
- Modify: `src/modules/chat/presentation/dto/requests.dto.ts`
- Modify: `src/modules/chat/presentation/dto/message.dto.ts`
- Modify: `src/modules/chat/presentation/messages.controller.ts`

- [ ] **Step 1: Request DTO**

Append to `requests.dto.ts`:

```ts
/** Body of `POST /v1/messages/delete` — one batch, one transaction (§A2). */
export class DeleteMessagesDto {
  @ApiProperty({
    type: [String],
    description:
      'Message ids, 1–100, all from the same conversation. Duplicates are collapsed. Ids that do ' +
      'not exist come back in `skipped` rather than failing the batch.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];

  @ApiProperty({
    enum: DeleteScope,
    enumName: 'DeleteScopeDto',
    description:
      '`EVERYONE` deletes for both members and is allowed only on your own messages. `ME` hides ' +
      'the message on every device you own and leaves it untouched for the other member — it works ' +
      'on any message in the conversation.',
  })
  @IsEnum(DeleteScope)
  scope!: DeleteScope;
}
```

Extend the class-validator import with `IsArray`, `ArrayMinSize`, and import `DeleteScope`.

- [ ] **Step 2: Response DTOs**

Append to `message.dto.ts`:

```ts
/** One id the batch left alone, with the reason (§A2). */
export class SkippedMessageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    enum: ['NOT_OWN', 'NOT_FOUND', 'NOT_MEMBER'],
    description:
      '`NOT_OWN` — someone else\'s message under `EVERYONE`. `NOT_FOUND` — no such id. ' +
      '`NOT_MEMBER` — the id belongs to a conversation you are not in.',
  })
  reason!: 'NOT_OWN' | 'NOT_FOUND' | 'NOT_MEMBER';
}

/**
 * The outcome of `POST /v1/messages/delete`. `unreadCount` and `lastMessage` are the recomputed
 * values for the caller, so the conversation list can settle without re-fetching (§A2).
 */
export class BulkDeleteResultDto {
  @ApiProperty()
  conversationId!: string;

  @ApiProperty({ type: [String], description: 'Ids actually deleted — or already deleted.' })
  deleted!: string[];

  @ApiProperty({ type: [SkippedMessageDto] })
  skipped!: SkippedMessageDto[];

  @ApiProperty({ type: 'integer', format: 'int32' })
  unreadCount!: number;

  @ApiProperty({
    type: () => MessageDto,
    nullable: true,
    description: 'The newest message still visible to you, or `null` if none is left.',
  })
  lastMessage!: MessageDto | null;

  static fromDomain(result: BulkDeleteResult, viewerId: string, apiBase = '/v1'): BulkDeleteResultDto {
    const dto = new BulkDeleteResultDto();
    dto.conversationId = result.conversationId;
    dto.deleted = result.deleted;
    dto.skipped = result.skipped.map((entry) => {
      const skipped = new SkippedMessageDto();
      skipped.id = entry.id;
      skipped.reason = entry.reason;
      return skipped;
    });
    dto.unreadCount = result.unreadCount;
    dto.lastMessage =
      result.lastMessage === null
        ? null
        : MessageDto.fromDomain(result.lastMessage, viewerId, apiBase);
    return dto;
  }
}
```

- [ ] **Step 3: Controller route**

Add to `messages.controller.ts`. **`@Post('delete')` must be declared before any `@Delete(':id')`-style wildcard**; there is no conflict today, but keep it first.

```ts
  @Post('delete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete many messages at once',
    description:
      'One transaction for the whole batch (§A2): either all the permitted ids are applied or none ' +
      'are, the unread count and last message are recomputed once, and both members get a single ' +
      '`message:deleted` event instead of one per id. Idempotent — re-deleting returns 200. ' +
      'Ids you may not delete come back in `skipped`; an empty `deleted` is a result, not an error.',
  })
  @ApiOkEnvelope(BulkDeleteResultDto, 'What was deleted, what was skipped, and the settled counters.')
  @ApiForbiddenEnvelope('Not a member of that conversation (`NOT_MEMBER`), or not a STUDENT account.')
  @ApiNotFoundEnvelope(
    ERROR_CODE.MESSAGE_NOT_FOUND,
    'None of the ids exist.',
    'Xabar topilmadi',
  )
  async removeMany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteMessagesDto,
  ): Promise<BulkDeleteResultDto> {
    const result = await this.chat.deleteMessages(user, dto.ids, dto.scope);
    await this.gateway.broadcastBulkDeleted(
      result.conversationId,
      user.id,
      result.deleted,
      result.deletedSeqs,
      dto.scope,
    );
    return BulkDeleteResultDto.fromDomain(result, user.id);
  }
```

- [ ] **Step 4: Add `?scope=` to the single delete**

Per §A2, `DELETE /v1/messages/:id` stays and gains an optional scope; omitted means `EVERYONE`, so today's behaviour is unchanged. Replace `remove`:

```ts
  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete one message',
    description:
      'Kept for clients built before `POST /v1/messages/delete`. `scope` defaults to `EVERYONE`, ' +
      'which is exactly what this route did before the parameter existed.',
  })
  @ApiParam({ name: 'id', description: 'Message id' })
  @ApiQuery({ name: 'scope', enum: DeleteScope, required: false })
  @ApiOkEnvelope(BulkDeleteResultDto, 'What was deleted, and the settled counters.')
  @ApiForbiddenEnvelope('Not your message (`NOT_MEMBER`/`FORBIDDEN`), or not a STUDENT account.')
  @ApiNotFoundEnvelope(ERROR_CODE.MESSAGE_NOT_FOUND, 'No such message.', 'Xabar topilmadi')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: ScopeQueryDto,
  ): Promise<BulkDeleteResultDto> {
    const scope = query.scope ?? DeleteScope.EVERYONE;
    const result = await this.chat.deleteMessages(user, [id], scope);
    await this.gateway.broadcastBulkDeleted(
      result.conversationId,
      user.id,
      result.deleted,
      result.deletedSeqs,
      scope,
    );
    return BulkDeleteResultDto.fromDomain(result, user.id);
  }
```

> **Contract change:** this route used to return `MessageDto`. Flag it in the response doc — the mobile client regenerates from the spec, and §A2 tells clients to move to the batch route anyway.

- [ ] **Step 5: Add `ScopeQueryDto`**

In `queries.dto.ts`:

```ts
/** `?scope=` on the delete/clear routes. Omitted means `EVERYONE` on message deletes (§A2). */
export class ScopeQueryDto {
  @ApiPropertyOptional({ enum: DeleteScope, enumName: 'DeleteScopeDto' })
  @IsOptional()
  @IsEnum(DeleteScope)
  scope?: DeleteScope;
}
```

- [ ] **Step 6: Typecheck, lint, unit tests**

Run: `npx tsc --noEmit && npm run lint && npx jest src/modules/chat`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/chat
git commit -m "feat(chat): POST /v1/messages/delete endpoint"
```

---

## Task 9: E2E — §A4.6 acceptance criteria 1, 2, 3 and 5

**Files:**
- Modify: `test/chat.e2e-spec.ts`

- [ ] **Step 1: Write the four scenarios**

Reuse the existing helpers in that file for registering two connected students and opening a conversation. Add:

```ts
describe('bulk delete (§A4.6)', () => {
  it('1. EVERYONE keeps the list length and the seq positions on both sides', async () => {
    const { a, b, conversationId } = await twoStudentsWithMessages(50);
    const ids = await seqRange(a, conversationId, 21, 30);

    await request(app.getHttpServer())
      .post('/v1/messages/delete')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ ids, scope: 'EVERYONE' })
      .expect(200);

    for (const viewer of [a, b]) {
      const history = await fullHistory(viewer, conversationId);
      expect(history).toHaveLength(50);
      expect(history.map((m) => m.seq)).toEqual([...Array(50).keys()].map((i) => i + 1));
      expect(history.filter((m) => m.deletedAt !== null).map((m) => m.seq)).toEqual(
        [21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      );
    }
  });

  it('2. ME shortens the requester\'s list and leaves the peer untouched', async () => {
    const { a, b, conversationId } = await twoStudentsWithMessages(50);
    const ids = await seqRange(a, conversationId, 21, 30);

    await request(app.getHttpServer())
      .post('/v1/messages/delete')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ ids, scope: 'ME' })
      .expect(200);

    const mine = await fullHistory(a, conversationId);
    const theirs = await fullHistory(b, conversationId);
    expect(mine).toHaveLength(40);
    expect(theirs).toHaveLength(50);
    expect(mine.map((m) => m.seq)).toEqual(theirs.map((m) => m.seq).filter((s) => s < 21 || s > 30));
  });

  it('3. paging with ?before= yields every message exactly once, no gaps', async () => {
    const { a, conversationId } = await twoStudentsWithMessages(50);
    await hideSeqs(a, conversationId, [10, 11, 12]);

    const seen = await fullHistory(a, conversationId, 7); // page size that does not divide 47
    const seqs = seen.map((m) => m.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs).toEqual([...Array(50).keys()].map((i) => i + 1).filter((s) => ![10, 11, 12].includes(s)));
  });

  it('5. the badge drops by the number deleted, never below zero, and is idempotent', async () => {
    const { a, b, conversationId } = await twoStudentsWithMessages(0);
    const ids = await sendFrom(b, conversationId, 5);
    expect(await unreadOf(a)).toBe(5);

    const body = { ids: ids.slice(0, 3), scope: 'ME' };
    await request(app.getHttpServer())
      .post('/v1/messages/delete')
      .set('Authorization', `Bearer ${a.token}`)
      .send(body)
      .expect(200);
    expect(await unreadOf(a)).toBe(2);

    await request(app.getHttpServer())
      .post('/v1/messages/delete')
      .set('Authorization', `Bearer ${a.token}`)
      .send(body)
      .expect(200);
    expect(await unreadOf(a)).toBe(2);
  });
});
```

Write the helpers (`twoStudentsWithMessages`, `seqRange`, `fullHistory`, `hideSeqs`, `sendFrom`, `unreadOf`) at the top of the describe block, following the style already in `test/chat.e2e-spec.ts`. `fullHistory` must page with `?before=` until `hasMore` is false and concatenate — that is what criterion 3 actually tests.

> Criterion 4 (clear history) needs `DELETE …/history` and lands in Stage 2, Task 12.

- [ ] **Step 2: Run**

Run: `npm run test:e2e -- chat`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/chat.e2e-spec.ts
git commit -m "test(chat): e2e coverage for bulk delete acceptance criteria"
```

---

## Task 10: Regenerate the contract + WS doc

**Files:**
- Modify: `docs/api/generated/student.json`, `docs/handoff/mobile/student-api.json`
- Modify: `docs/handoff/mobile/03-WEBSOCKET.md`

- [ ] **Step 1: Dump the spec**

Run: `npm run openapi:dump`
Expected: both JSON files change; `git diff --stat` shows `POST /v1/messages/delete`, `DeleteScopeDto`, `BulkDeleteResultDto`, `SkippedMessageDto`.

- [ ] **Step 2: Document the WS event**

In `docs/handoff/mobile/03-WEBSOCKET.md`, replace the `message:deleted` section with the batch payload, and state plainly that `scope: "ME"` is emitted only to the deleter's own devices.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs(chat): regenerate OpenAPI and document batch message:deleted"
```

---

## Task 11: Stage 1 review gate

- [ ] Run `npm run lint && npx tsc --noEmit && npx jest && npm run test:e2e`
- [ ] Run the `senior-code-review` skill on `git diff main...HEAD`
- [ ] Run the `db-review` skill on the migration SQL
- [ ] Run the `security-review` skill — this diff changes an authorization path (who may delete whose message)
- [ ] **STOP. Report to the user before starting Stage 2.**

---

# STAGE 2 — Part B1: clear history + purge cron

## Task 12: `DELETE /v1/conversations/:id/history`

**Files:**
- Modify: `src/modules/chat/domain/chat.repository.ts`
- Modify: `src/modules/chat/infrastructure/chat.prisma.repository.ts`
- Modify: `src/modules/chat/application/chat.service.ts`
- Modify: `src/modules/chat/presentation/conversations.controller.ts`
- Test: `src/modules/chat/application/chat.service.spec.ts`, `test/chat.e2e-spec.ts`

- [ ] **Step 1: Port method**

```ts
  /**
   * Raises the clear watermark to the conversation's highest `seq` for one member (`ME`) or both
   * (`EVERYONE`), and parks their read cursor there so the badge does not light up for history they
   * just discarded. Returns the watermark written.
   */
  clearHistory(conversationId: string, studentId: string, scope: DeleteScope): Promise<number>;
```

- [ ] **Step 2: Implementation**

```ts
  async clearHistory(
    conversationId: string,
    studentId: string,
    scope: DeleteScope,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const newest = await tx.message.findFirst({
        where: { conversationId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });
      const watermark = newest?.seq ?? 0;
      await tx.conversationMember.updateMany({
        where: {
          conversationId,
          ...(scope === DeleteScope.EVERYONE ? {} : { studentId }),
        },
        // `lastReadSeq` moves with it: everything below the watermark is invisible, and an invisible
        // message can never be read, so leaving the cursor behind lights the badge forever (§A1).
        data: { clearedBeforeSeq: watermark, lastReadSeq: watermark },
      });
      return watermark;
    });
  }
```

- [ ] **Step 3: Service use-case**

```ts
  /**
   * Clears history (§B1). Nothing is deleted — a per-member watermark rises, so the other member's
   * cursors keep pointing at rows that still exist. Messages sent after the clear appear normally,
   * because `seq` keeps climbing past the watermark.
   */
  async clearHistory(
    user: AuthenticatedUser,
    conversationId: string,
    scope: DeleteScope,
  ): Promise<{ conversationId: string; clearedBeforeSeq: number; unreadCount: number }> {
    await this.assertMember(conversationId, user.id);
    const clearedBeforeSeq = await this.chat.clearHistory(conversationId, user.id, scope);
    return { conversationId, clearedBeforeSeq, unreadCount: 0 };
  }
```

- [ ] **Step 4: Controller + DTO**

`ClearHistoryResultDto` with `conversationId`, `clearedBeforeSeq`, `unreadCount`; route:

```ts
  @Delete(':id/history')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Clear the conversation history',
    description:
      'Raises a per-member watermark (§B1) — no row is removed, so `seq` stays gapless and the ' +
      'other member\'s read cursors keep working. The conversation itself stays in the list with a ' +
      'null `lastMessage`, exactly as Telegram leaves it. Messages sent after the clear are visible.',
  })
```

- [ ] **Step 5: WS `history:cleared`**

Add `HISTORY_CLEARED: 'history:cleared'` to `CHAT_EVENT` and a `broadcastHistoryCleared(conversationId, by, clearedBeforeSeq, scope)` that targets the requester's room for `ME` and both rooms for `EVERYONE` — same audience rule as `broadcastBulkDeleted`.

- [ ] **Step 6: E2E — §A4.6 criterion 4**

```ts
it('4. after clearing, a new message stands alone for me and the peer keeps everything', async () => {
  const { a, b, conversationId } = await twoStudentsWithMessages(20);

  await request(app.getHttpServer())
    .delete(`/v1/conversations/${conversationId}/history?scope=ME`)
    .set('Authorization', `Bearer ${a.token}`)
    .expect(200);

  expect(await fullHistory(a, conversationId)).toHaveLength(0);

  const [sent] = await sendFrom(b, conversationId, 1);
  const mine = await fullHistory(a, conversationId);
  expect(mine).toHaveLength(1);
  expect(mine[0].seq).toBe(21);
  expect(await fullHistory(b, conversationId)).toHaveLength(21);
  expect(sent).toBeDefined();
});
```

- [ ] **Step 7: Run and commit**

```bash
npx jest src/modules/chat && npm run test:e2e -- chat
git add src/modules/chat test/chat.e2e-spec.ts
git commit -m "feat(chat): DELETE /v1/conversations/:id/history"
```

---

## Task 13: Weekly purge cron

**Files:**
- Create: `src/cron/message-purge.cron.ts`
- Create: `src/cron/message-purge.cron.spec.ts`
- Modify: `src/cron/cron.module.ts`
- Modify: `src/modules/chat/domain/chat.repository.ts`, `chat.prisma.repository.ts`, `chat.service.ts`

- [ ] **Step 1: Port + implementation**

```ts
  /**
   * Physically removes messages every member of their conversation has cleared past (§B1). The
   * `MIN` is what makes this safe: a row is only gone once nobody can still see it, so no live
   * cursor is left pointing into a hole. Returns how many rows went.
   */
  purgeClearedMessages(): Promise<number>;
```

```ts
  async purgeClearedMessages(): Promise<number> {
    // Raw SQL: the predicate is "seq below the minimum watermark across the conversation's members",
    // an aggregate over a sibling table that Prisma's `deleteMany` cannot express.
    const rows = await this.prisma.$executeRaw`
      DELETE FROM messages m
      USING (
        SELECT conversation_id, MIN(cleared_before_seq) AS floor
        FROM conversation_members
        GROUP BY conversation_id
      ) w
      WHERE m.conversation_id = w.conversation_id
        AND m.seq <= w.floor
    `;
    return rows;
  }
```

> `message_hidden` rows and `media_assets` for those messages disappear with them via `ON DELETE CASCADE`. Confirm during `db-review` that `media_assets.message_id` cascades rather than restricting — if it restricts, the delete throws and the cron logs an error forever.

- [ ] **Step 2: Cron**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChatService } from '../modules/chat/application/chat.service';

/**
 * Physically removes chat messages that every member has already cleared past (§B1).
 *
 * Clearing history only raises a watermark, because `seq` has to stay gapless while the other member
 * still reads through it. Once *both* members are above a row, nothing can reach it again and the
 * bytes are pure cost — this is the only place a message row is ever really deleted.
 *
 * Weekly, not nightly: the rows are invisible either way, so the only thing urgency buys is a bigger
 * chance of a long lock on `messages` during a busy hour.
 */
@Injectable()
export class MessagePurgeCron {
  private readonly logger = new Logger(MessagePurgeCron.name);

  constructor(private readonly chat: ChatService) {}

  @Cron(CronExpression.EVERY_WEEK)
  async purge(): Promise<void> {
    try {
      const removed = await this.chat.purgeClearedMessages();
      if (removed > 0) {
        this.logger.log(`Purged ${removed} cleared chat messages`);
      }
    } catch (error) {
      // Never rethrow: a failed sweep must not take the scheduler down. Next week retries, and the
      // rows stay invisible in the meantime.
      this.logger.error('Message purge failed', error);
    }
  }
}
```

- [ ] **Step 3: Unit test**

Mirror `src/cron/listing-status.cron.spec.ts`: one test that the sweep runs, one that a rejected sweep resolves rather than throwing.

- [ ] **Step 4: Register**

Add `ChatModule` to `CronModule`'s imports and `MessagePurgeCron` to its providers.

- [ ] **Step 5: Run and commit**

```bash
npx jest src/cron && npx tsc --noEmit
git add src/cron src/modules/chat
git commit -m "feat(chat): weekly purge of fully-cleared messages"
```

---

## Task 14: Stage 2 review gate

- [ ] Full suite: `npm run lint && npx tsc --noEmit && npx jest && npm run test:e2e`
- [ ] `npm run openapi:dump`, commit the spec
- [ ] `senior-code-review` + `db-review` (the cron issues a `DELETE`) + `security-review`
- [ ] **STOP. Report to the user.**

---

# STAGE 3 — Part C: reply / quote

## Task 15: Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the columns to `Message`**

```prisma
  // Quoted reply (§C). Denormalised on purpose — the same reason the sticker columns are: the quote
  // is a snapshot taken at send time and must keep rendering after the target is deleted or purged.
  // The FK is only for "jump to original"; it is nulled by the purge cron, which is exactly when
  // jumping stops being possible.
  replyToMessageId  String?      @map("reply_to_message_id")
  replyToSenderId   String?      @map("reply_to_sender_id")
  replyToSenderName String?      @map("reply_to_sender_name")
  replyToSeq        Int?         @map("reply_to_seq")
  replyToType       MessageType? @map("reply_to_type")
  replyToPreview    String?      @map("reply_to_preview")
  quoteText         String?      @map("quote_text")
  quoteOffset       Int?         @map("quote_offset")

  replyTo Message?  @relation("MessageReply", fields: [replyToMessageId], references: [id], onDelete: SetNull)
  replies Message[] @relation("MessageReply")
```

Add `@@index([replyToMessageId])`.

- [ ] **Step 2: Migrate and read the SQL**

Run: `npx prisma migrate dev --name chat_reply_and_quote`
Then: `cat prisma/migrations/*chat_reply_and_quote/migration.sql`
Expected: eight `ADD COLUMN`, all nullable; one `CREATE INDEX`; one self-referencing FK with `ON DELETE SET NULL`. No `DROP`.

- [ ] **Step 3: Commit**

```bash
git add prisma
git commit -m "feat(chat): add reply/quote snapshot columns"
```

---

## Task 16: Quote validation (pure domain)

**Files:**
- Modify: `src/modules/chat/domain/message-composition.ts`
- Test: `src/modules/chat/domain/message-composition.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('assertQuoteMatches', () => {
  it('accepts a quote that is the exact slice at the offset', () => {
    expect(() => assertQuoteMatches('ertaga soat 10 da uchrashamizmi', 'soat 10 da', 7)).not.toThrow();
  });

  it('rejects a quote whose text is not at the offset', () => {
    expect(() => assertQuoteMatches('ertaga soat 10 da', 'soat 10 da', 0)).toThrow();
  });

  it('rejects a quote longer than 300 characters', () => {
    const body = 'a'.repeat(400);
    expect(() => assertQuoteMatches(body, 'a'.repeat(301), 0)).toThrow();
  });

  it('rejects a quote against a message with no text', () => {
    expect(() => assertQuoteMatches(null, 'anything', 0)).toThrow();
  });

  it('counts offsets in UTF-16 code units, matching the client', () => {
    // '😀' is one code point but two UTF-16 units — JS string indexing already works this way,
    // which is why the client's Kotlin/Swift offsets line up without conversion.
    expect(() => assertQuoteMatches('😀 salom', 'salom', 3)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `npx jest message-composition`
Expected: FAIL — `assertQuoteMatches is not defined`.

- [ ] **Step 3: Implement**

```ts
/** §C1 caps a quote at 300 characters — longer selections are the whole message, not a quote. */
export const MAX_QUOTE_LENGTH = 300;

/**
 * Checks that a quote really is the slice of the target it claims to be (§C1).
 *
 * The offset is trusted from the client but verified here, because the quote is stored as a snapshot:
 * a mismatched one would render as text the target never contained, and nothing downstream could
 * ever detect it. Offsets are UTF-16 code units, which is what `String.prototype.slice` already
 * uses — the same units Kotlin and Swift count in.
 */
export function assertQuoteMatches(body: string | null, text: string, offset: number): void {
  if (text.length > MAX_QUOTE_LENGTH) {
    throw new AppException(
      ERROR_CODE.QUOTE_TOO_LONG,
      422,
      `Sitata ${MAX_QUOTE_LENGTH} belgidan oshmasligi kerak`,
    );
  }
  if (body === null || body.slice(offset, offset + text.length) !== text) {
    throw new AppException(ERROR_CODE.QUOTE_NOT_FOUND, 422, 'Sitata asl xabarda topilmadi');
  }
}
```

- [ ] **Step 4: Run and commit**

```bash
npx jest message-composition
git add src/modules/chat/domain
git commit -m "feat(chat): quote validation against the target body"
```

---

## Task 17: Reply/quote through send

**Files:**
- Modify: `src/modules/chat/domain/entities/message.entity.ts`, `chat.repository.ts`, `chat.io.ts`
- Modify: `src/modules/chat/application/chat.service.ts`
- Modify: `src/modules/chat/infrastructure/chat.prisma.repository.ts`, `chat.mapper.ts`
- Modify: `src/modules/chat/presentation/dto/requests.dto.ts`, `message.dto.ts`
- Modify: `src/modules/chat/chat.gateway.ts`, `chat-events.ts`

- [ ] **Step 1: Domain value object**

In `message.entity.ts`:

```ts
/**
 * A frozen copy of what was replied to (§C2). Never re-read from the target: the point of a snapshot
 * is that the quote survives the original being deleted, and re-reading would erase it exactly when
 * it matters. `originalDeleted` is the one live field — it decides whether "jump to" is offered.
 */
export interface ReplySnapshot {
  id: string | null;
  seq: number;
  senderId: string;
  senderName: string | null;
  type: MessageType;
  preview: string | null;
  quote: { text: string; offset: number } | null;
  originalDeleted: boolean;
}
```

Add `replyTo: ReplySnapshot | null;` to `Message`.

Then in `src/modules/chat/domain/chat.repository.ts`, the write-side counterpart — the flat columns
`appendMessage` persists. It is deliberately *not* `ReplySnapshot`: that one carries the computed
`originalDeleted`, which is read-side only and has no column behind it.

```ts
/** The reply/quote columns written on a new message (§C1). All-or-nothing: null means no reply. */
export interface ReplyColumns {
  replyToMessageId: string;
  replyToSenderId: string;
  replyToSenderName: string | null;
  replyToSeq: number;
  replyToType: MessageType;
  replyToPreview: string | null;
  quoteText: string | null;
  quoteOffset: number | null;
}
```

and extend `AppendMessageInput` with `reply: ReplyColumns | null;`.

- [ ] **Step 2: Service validation in `sendMessage`**

Insert after the membership/connection checks, before `resolveAttachment`:

```ts
    const replyTo = await this.resolveReply(input);
```

and the helper:

```ts
  /**
   * Validates a reply target and freezes the snapshot stored on the new message (§C1).
   *
   * The target has to be in the same conversation — otherwise the field leaks one line of a
   * conversation the sender may not belong to, straight into someone else's chat.
   */
  private async resolveReply(input: SendMessageInput): Promise<ReplyColumns | null> {
    const targetId = input.replyToMessageId ?? null;
    const quote = input.quote ?? null;

    if (targetId === null) {
      if (quote !== null) {
        throw new AppException(
          ERROR_CODE.QUOTE_WITHOUT_REPLY,
          422,
          'Sitata uchun javob beriladigan xabar kerak',
        );
      }
      return null;
    }

    const target = await this.chat.findMessage(targetId);
    if (target === null || target.conversationId !== input.conversationId) {
      throw new AppException(ERROR_CODE.REPLY_TARGET_NOT_FOUND, 422, 'Javob beriladigan xabar topilmadi');
    }
    if (target.deletedAt !== null) {
      throw new AppException(ERROR_CODE.REPLY_TARGET_DELETED, 422, "O'chirilgan xabarga javob berib bo'lmaydi");
    }
    if (quote !== null) {
      assertQuoteMatches(target.body, quote.text, quote.offset);
    }

    return {
      replyToMessageId: target.id,
      replyToSenderId: target.senderId,
      replyToSenderName: await this.chat.displayNameOf(target.senderId),
      replyToSeq: target.seq,
      replyToType: target.type,
      // Media has no text to preview — §C2 has the client draw "📷 Rasm" from `type` instead.
      replyToPreview: target.body === null ? null : target.body.slice(0, MAX_REPLY_PREVIEW),
      quoteText: quote?.text ?? null,
      quoteOffset: quote?.offset ?? null,
    };
  }
```

with `const MAX_REPLY_PREVIEW = 120;` beside `MAX_DELETE_IDS`, and a `displayNameOf(studentId): Promise<string | null>` port method returning `firstName + ' ' + lastName` trimmed, or `username`, or `null`.

- [ ] **Step 3: Persist and map**

Add the `ReplyColumns` fields to `AppendMessageInput`, write them in `appendMessage`, and in `ChatMapper.toMessage` assemble `replyTo` — with `originalDeleted` computed as `row.replyToMessageId === null || row.replyTo?.deletedAt != null`. Include `replyTo: { select: { deletedAt: true } }` in `MESSAGE_INCLUDE`.

- [ ] **Step 4: DTOs**

`QuoteDto` (`@IsString() text`, `@IsInt() @Min(0) offset`) and `ReplyToDto` matching §C2 exactly, both fields optional on `SendMessageDto`, `replyTo` on `MessageDto`. Add `replyToMessageId` and `quote` to `SendMessagePayload` and pass them through `onSend` in the gateway — §C1 requires REST **and** WS.

- [ ] **Step 5: Error codes**

Add `REPLY_TARGET_NOT_FOUND`, `REPLY_TARGET_DELETED`, `QUOTE_NOT_FOUND`, `QUOTE_TOO_LONG`, `QUOTE_WITHOUT_REPLY` to `ERROR_CODE`.

- [ ] **Step 6: Tests, run, commit**

Unit tests for each of the five rejections; an e2e that sends a quoted reply, deletes the target, and asserts the quote survives with `originalDeleted: true`.

```bash
npx jest src/modules/chat && npm run test:e2e -- chat
git add src/modules/chat src/common/errors/error-code.ts
git commit -m "feat(chat): quoted replies with immutable snapshots"
```

---

## Task 18: `?around=`

**Files:**
- Modify: `src/modules/chat/presentation/dto/queries.dto.ts`, `chat.repository.ts`, `chat.prisma.repository.ts`, `chat.service.ts`, `conversations.controller.ts`

- [ ] **Step 1: Query DTO**

```ts
  @ApiPropertyOptional({
    description:
      'Jump target: return the window centred on this `seq` — half before it, half from it on. ' +
      'Mutually exclusive with `before` and `after` (422). Used when a quote is tapped and the ' +
      'original is not in the local cache (§C3).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  around?: number;
```

- [ ] **Step 2: Reject combinations in the controller**

```ts
    const cursors = [query.before, query.after, query.around].filter((v) => v !== undefined);
    if (cursors.length > 1) {
      throw AppException.validation({ around: 'before, after va around birga kelmasin' });
    }
```

- [ ] **Step 3: Repository**

```ts
  /**
   * A window centred on `seq` (§C3): `floor(size / 2)` older rows and the rest from `seq` onward,
   * both filtered by the same `visibleTo` as every other read — a hidden row must not eat one of
   * the window's slots and it must not appear in it either.
   */
  async listAround(
    conversationId: string,
    viewer: MessageViewer,
    seq: number,
    size: number,
  ): Promise<{ items: Message[]; hasMore: boolean }> {
    const half = Math.floor(size / 2);
    const [older, newer] = await Promise.all([
      this.prisma.message.findMany({
        where: { ...visibleTo(conversationId, viewer), seq: { gt: viewer.clearedBeforeSeq, lt: seq } },
        orderBy: [{ seq: 'desc' }],
        // One extra row: its existence is what `hasMore` reports, and it is dropped from the result.
        take: half + 1,
        include: MESSAGE_INCLUDE,
      }),
      this.prisma.message.findMany({
        where: { ...visibleTo(conversationId, viewer), seq: { gte: seq } },
        orderBy: [{ seq: 'asc' }],
        take: size - half,
        include: MESSAGE_INCLUDE,
      }),
    ]);
    const hasMore = older.length > half;
    const items = [...older.slice(0, half).reverse(), ...newer].map(ChatMapper.toMessage);
    return { items, hasMore };
  }
```

> `hasMore` means "older messages exist below this window" (D8) — that is the direction the client scrolls after a jump. Say so in the Swagger description.

- [ ] **Step 4: Wire through service + controller, test, commit**

E2E: clear nothing, hide seq 25, request `?around=25`, assert 25 is absent and the window is still `size` long.

```bash
npx jest src/modules/chat && npm run test:e2e -- chat
git add src/modules/chat
git commit -m "feat(chat): ?around= history window for quote jumps"
```

---

## Task 19: Stage 3 review gate

- [ ] Full suite + `npm run openapi:dump`
- [ ] `senior-code-review`, `db-review`, `security-review` (the reply target check is a cross-conversation leak guard)
- [ ] **STOP. Report to the user.**

---

# STAGE 4 — Part B2: delete conversation

## Task 20: `DELETE /v1/conversations/:id`

**Files:**
- Modify: `prisma/schema.prisma` — `ConversationMember.hidden Boolean @default(false)`
- Modify: `chat.repository.ts`, `chat.prisma.repository.ts`, `chat.service.ts`, `conversations.controller.ts`

- [ ] **Step 1: Schema + migration**

```prisma
  /// Removed from this member's list (§B2). Not a delete: a new message clears the flag and the
  /// conversation comes back with the same id, so `POST /v1/conversations` stays idempotent and the
  /// history does not fork into a second row.
  hidden Boolean @default(false)
```

Run `npx prisma migrate dev --name chat_conversation_hidden`, read the SQL, confirm it is one nullable-safe `ADD COLUMN ... DEFAULT false`.

- [ ] **Step 2: Behaviour**

- `deleteConversation` = `clearHistory(scope)` + set `hidden = true` for the same member(s).
- `listConversations` and its `count` filter `hidden: false`.
- `appendMessage` sets `hidden: false` for every member of the conversation in the same transaction — that is what makes it "come back on its own".
- `openDirect` is unchanged: `findDirect` already returns the existing row, so it un-hides via the send path rather than forking.

- [ ] **Step 3: WS**

`CONVERSATION_DELETED: 'conversation:deleted'` with `{ conversationId, scope, by }`, same audience rule as the other two.

- [ ] **Step 4: E2E**

Delete with `scope=ME`; assert the conversation is gone from the list, that the peer still sees it, that a new message from the peer brings it back with the same `conversationId`, and that only post-clear messages are in it.

- [ ] **Step 5: Run and commit**

```bash
npx jest src/modules/chat && npm run test:e2e -- chat
git add prisma src/modules/chat test
git commit -m "feat(chat): DELETE /v1/conversations/:id"
```

---

## Task 21: Mobile response document

**Files:**
- Create: `docs/api/mobile_questions/CHAT_SELECTION_AND_HISTORY_RESPONSE.md`

- [ ] **Step 1: Write it**

Match the register of `STICKER_SEARCH_RESPONSE.md` and `STORY_AND_PROFILE_RESPONSE.md`: Uzbek, endpoint-by-endpoint, real JSON envelopes, and an explicit list of every deviation in the D1–D8 table above with the reasoning. It must cover:

- Which spec section landed in which stage, and what shipped.
- The `DELETE /v1/messages/:id` response-shape change (`MessageDto` → `BulkDeleteResultDto`).
- `?around=…&size=` rather than `limit`.
- WS `message:deleted` keeping `messageId`, and the `scope: "ME"` audience rule.
- The `message_hidden` index change and why.
- The all-ids-unknown → 404 decision.
- That the spec's §A4.6 criteria 1–5 are covered by named e2e tests, with the file and test names.
- Regeneration instructions: `docs/api/generated/student.json`.

- [ ] **Step 2: Commit**

```bash
git add docs/api/mobile_questions/CHAT_SELECTION_AND_HISTORY_RESPONSE.md
git commit -m "docs(chat): answer the selection/history backend spec"
```

---

## Task 22: Final gate

- [ ] `npm run lint && npx tsc --noEmit && npx jest && npm run test:e2e` — all green, output pasted into the report
- [ ] `npm run openapi:dump` committed
- [ ] `verification-before-completion` skill run before reporting done
- [ ] Report to the user with the test output, not a summary of it
