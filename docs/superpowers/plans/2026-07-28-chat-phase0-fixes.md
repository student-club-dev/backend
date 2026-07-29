# Chat Bosqich 0 — mavjud muammolarni tuzatish (implementatsiya rejasi)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobil jamoaning §17 (chat xatolari) va §19 (OpenAPI tip sifati) shikoyatlarini yopish — schema migratsiyasisiz, tarqatilgan Kotlin klientini buzmasdan.

**Architecture:** Mavjud DDD qatlamlariga rioya qilinadi (`presentation → application → domain ← infrastructure`). Prisma faqat `infrastructure/` da. Barcha yangi maydonlar nullable va WS ack shakli o'zgarmaydi — eski klientlar ishlab turaveradi.

**Tech Stack:** NestJS 10 · Prisma 5.20 · Socket.IO 4 · Jest (unit `src/**/*.spec.ts`, e2e `test/*.e2e-spec.ts`) · `@nestjs/swagger` 7

**Spec:** `docs/superpowers/specs/2026-07-28-chat-phase0-fixes-design.md`

## Global Constraints

- **Hech qanday Prisma migratsiyasi yo'q.** `messages.client_msg_id` va `reports.content_snapshot` bazada allaqachon mavjud.
- **WS ack shakli o'zgarmaydi:** muvaffaqiyat `{ clientMsgId, id, seq, createdAt, status: "sent" }`, xato `{ clientMsgId, status: "error", error: { code, message } }`.
- **`MessageDto.body` string bo'lib qoladi.** Hech qachon `object` emas.
- TypeScript strict — **`any` ishlatilmaydi**.
- `console.log` yo'q — Nest `Logger` / Pino.
- `throw new Error()` yo'q — `AppException`.
- Foydalanuvchiga ko'rinadigan `message` matnlari **o'zbekcha**.
- Unit testlar: `npm test`. E2E: `npm run test:e2e` (real DB kerak).
- Har bir task oxirida commit. Conventional Commits (`fix:`, `feat:`, `refactor:`, `docs:`, `test:`).

---

## File Structure

**O'zgaradi:**

| Fayl | Mas'uliyat | Task |
|---|---|---|
| `src/modules/chat/domain/entities/message.entity.ts` | `clientMsgId` domenga chiqadi | 2 |
| `src/modules/chat/domain/chat.repository.ts` | port izohlari (`size` semantikasi) | 1 |
| `src/modules/chat/application/chat.service.ts` | `history`/`messagesSince` endi `hasMore` bilan sahifa qaytaradi | 1 |
| `src/modules/chat/infrastructure/chat.mapper.ts` | `clientMsgId` maplanadi | 2 |
| `src/modules/chat/infrastructure/chat.prisma.repository.ts` | `NULLS LAST` + barqaror tartib | 5 |
| `src/modules/chat/presentation/dto/message.dto.ts` | `clientMsgId`, `viewerId`, aniq `hasMore` | 1, 2 |
| `src/modules/chat/presentation/dto/conversation.dto.ts` | `viewerId` uzatiladi | 2 |
| `src/modules/chat/presentation/dto/requests.dto.ts` | `MarkDeliveredDto` | 4 |
| `src/modules/chat/presentation/conversations.controller.ts` | `viewerId`, `/delivered` | 1, 2, 4 |
| `src/modules/chat/chat.gateway.ts` | ikkita payload, `TOKEN_EXPIRED`, ack'lar, `broadcastDelivered` | 2, 3, 4 |
| `src/modules/chat/infrastructure/ws-jwt.ts` | `exp` qaytaradi | 3 |
| `src/modules/connections/application/reports.service.ts` | `messageId` tekshiruvi + snapshot | 6 |
| `src/modules/connections/connections.module.ts` | yangi port bog'lanadi | 6 |
| `src/common/errors/error-code.ts` | `MESSAGE_NOT_FOUND` | 6 |
| `src/main.ts` | Swagger qurish `openapi-document.ts` ga ko'chadi | 7 |
| ~200 ta DTO fayli | aniq OpenAPI tiplari | 8, 9 |
| `docs/architecture/chat.md` | WS protokoli | 10 |

**Yaratiladi:**

| Fayl | Mas'uliyat | Task |
|---|---|---|
| `src/modules/chat/presentation/dto/message.dto.spec.ts` | `viewerId` mantiqi | 2 |
| `src/modules/chat/chat.gateway.spec.ts` | broadcast, ack, `TOKEN_EXPIRED` | 2, 3 |
| `src/modules/connections/domain/message-directory.repository.ts` | shikoyat qilinadigan xabar porti | 6 |
| `src/modules/connections/infrastructure/message-directory.prisma.repository.ts` | Prisma impl | 6 |
| `src/common/swagger/openapi-document.ts` | ikkala hujjatni qurish (main.ts + skript umumiy ishlatadi) | 7 |
| `scripts/dump-openapi.ts` | JSON'ni diskka yozadi | 7 |
| `test/openapi.e2e-spec.ts` | §19 guard testi | 7 |
| `docs/api/mobile_questions/CHAT_MEDIA_AND_CALLS_RESPONSE.md` | mobil jamoaga to'liq javob | 10 |
| `deploy/nginx/socket-io.conf` + `deploy/nginx/README.md` | §17.2 konfiguratsiyasi | 10 |

---

### Task 1: §17.5 — `hasMore` aniq hisoblansin

**Files:**
- Modify: `src/modules/chat/application/chat.service.ts:65-85`
- Modify: `src/modules/chat/presentation/dto/message.dto.ts:41-55`
- Modify: `src/modules/chat/presentation/conversations.controller.ts:65-81`
- Modify: `src/modules/chat/domain/chat.repository.ts:46-50`
- Test: `src/modules/chat/application/chat.service.spec.ts`

**Interfaces:**
- Produces: `MessagePage { items: Message[]; hasMore: boolean }` — `chat.io.ts` dan eksport qilinadi.
- Produces: `ChatService.history(user, conversationId, beforeSeq, size): Promise<MessagePage>`
- Produces: `ChatService.messagesSince(user, conversationId, afterSeq, size): Promise<MessagePage>`
- Produces: `MessageListDto.from(messages: Message[], hasMore: boolean): MessageListDto` (Task 2 da `viewerId` qo'shiladi)

- [ ] **Step 1: Write the failing test**

`src/modules/chat/application/chat.service.spec.ts` ga qo'shing (mavjud `describe` ichiga):

```ts
  describe('history — hasMore (§17.5)', () => {
    it('asks the repository for size + 1 and reports hasMore when the extra row exists', async () => {
      const rows = Array.from({ length: 4 }, (_, i) => message({ seq: 10 - i }));
      chatRepo.listMessages.mockResolvedValue(rows);

      const page = await service.history(user, 'cnv_1', null, 3);

      expect(chatRepo.listMessages).toHaveBeenCalledWith('cnv_1', null, 4);
      expect(page.items).toHaveLength(3);
      expect(page.hasMore).toBe(true);
    });

    it('reports hasMore = false on the last page even when it is exactly `size` long', async () => {
      chatRepo.listMessages.mockResolvedValue([message({ seq: 3 }), message({ seq: 2 })]);

      const page = await service.history(user, 'cnv_1', null, 2);

      expect(page.items).toHaveLength(2);
      expect(page.hasMore).toBe(false);
    });

    it('applies the same rule to the catch-up direction', async () => {
      chatRepo.listSince.mockResolvedValue([message({ seq: 1 }), message({ seq: 2 })]);

      const page = await service.messagesSince(user, 'cnv_1', 0, 1);

      expect(chatRepo.listSince).toHaveBeenCalledWith('cnv_1', 0, 2);
      expect(page.items).toHaveLength(1);
      expect(page.hasMore).toBe(true);
    });
  });
```

Agar `message(...)` va `user` helperlari faylda hali bo'lmasa, mavjud testlardagi nomlarni ishlating — avval faylni o'qing va shu fayldagi mavjud fixture nomlariga moslang.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/chat/application/chat.service.spec.ts -t "hasMore"`
Expected: FAIL — `page.items is undefined` (hozir `history` massiv qaytaradi).

- [ ] **Step 3: `MessagePage` tipini qo'shing**

`src/modules/chat/application/chat.io.ts` oxiriga:

```ts
/** A cursor page of messages plus whether more exist beyond it (§17.5). */
export interface MessagePage {
  items: Message[];
  hasMore: boolean;
}
```

Fayl boshiga import qo'shing: `import { Message } from '../domain/entities/message.entity';`

- [ ] **Step 4: Servisni o'zgartiring**

`src/modules/chat/application/chat.service.ts` — importga `MessagePage` qo'shing (`import { directKeyOf, MessagePage, Page } from './chat.io';`) va ikkala metodni almashtiring:

```ts
  /**
   * Reconnect catch-up (C6): messages after `afterSeq`, oldest-first, for a conversation member.
   * Reads one row past `size` so `hasMore` is exact on the last page too (§17.5).
   */
  async messagesSince(
    user: AuthenticatedUser,
    conversationId: string,
    afterSeq: number,
    size: number,
  ): Promise<MessagePage> {
    await this.assertMember(conversationId, user.id);
    return trim(await this.chat.listSince(conversationId, afterSeq, size + 1), size);
  }

  /** History for a conversation the caller belongs to (newest-first, `seq`-cursor). */
  async history(
    user: AuthenticatedUser,
    conversationId: string,
    beforeSeq: number | null,
    size: number,
  ): Promise<MessagePage> {
    await this.assertMember(conversationId, user.id);
    return trim(await this.chat.listMessages(conversationId, beforeSeq, size + 1), size);
  }
```

Fayl oxiriga (klass tashqarisiga):

```ts
/**
 * Turns a `size + 1` read into an exact page: the extra row is the proof that more exist, and it is
 * dropped from the result. Works in both directions — `hasMore` means "more rows past this page in
 * the direction you are scrolling", so it is correct for `before` and `after` alike.
 */
function trim(rows: Message[], size: number): MessagePage {
  return { items: rows.slice(0, size), hasMore: rows.length > size };
}
```

- [ ] **Step 5: DTO'ni o'zgartiring**

`src/modules/chat/presentation/dto/message.dto.ts` — `MessageListDto` ni almashtiring:

```ts
/** A cursor page of messages (newest-first). `hasMore` ⇒ page again with `before = last item's seq`. */
export class MessageListDto {
  @ApiProperty({ type: [MessageDto], description: 'Newest-first' })
  items!: MessageDto[];

  @ApiProperty({
    type: Boolean,
    description:
      'More messages exist past this page, in the direction you are paging. Exact — the server ' +
      'reads one row beyond `size` rather than guessing from the page length (§17.5).',
  })
  hasMore!: boolean;

  static from(messages: Message[], hasMore: boolean): MessageListDto {
    const dto = new MessageListDto();
    dto.items = messages.map((message) => MessageDto.fromDomain(message));
    dto.hasMore = hasMore;
    return dto;
  }
}
```

> `messages.map(MessageDto.fromDomain)` qasddan `map((message) => ...)` ga o'zgartirildi — Task 2 da `fromDomain` ikkinchi argument oladi va to'g'ridan-to'g'ri uzatilsa `map` indeksni o'sha argumentga tiqib qo'yardi.

- [ ] **Step 6: Kontrollerni o'zgartiring**

`src/modules/chat/presentation/conversations.controller.ts` — `history` metodi tanasini almashtiring:

```ts
    const size = query.size ?? 30;
    const page =
      query.after === undefined
        ? await this.chat.history(user, id, query.before ?? null, size)
        : await this.chat.messagesSince(user, id, query.after, size);
    return MessageListDto.from(page.items, page.hasMore);
```

- [ ] **Step 7: Port izohini haqiqatga moslang**

`src/modules/chat/domain/chat.repository.ts` — ikkala metod izohini almashtiring:

```ts
  /**
   * History strictly before `beforeSeq` (null = latest), newest-first, capped at `size`. Callers
   * pass `size + 1` and drop the extra row to compute `hasMore` exactly (§17.5).
   */
  listMessages(conversationId: string, beforeSeq: number | null, size: number): Promise<Message[]>;

  /**
   * Messages strictly after `afterSeq`, oldest-first — for reconnect catch-up (C6). Same
   * `size + 1` convention as `listMessages`.
   */
  listSince(conversationId: string, afterSeq: number, size: number): Promise<Message[]>;
```

- [ ] **Step 8: Run tests**

Run: `npx jest src/modules/chat && npx tsc --noEmit`
Expected: PASS, tip xatolari yo'q. Agar mavjud testlar `history` dan massiv kutayotgan bo'lsa — ularni `page.items` ga moslang.

- [ ] **Step 9: Commit**

```bash
git add src/modules/chat docs/superpowers
git commit -m "fix(chat): compute MessageListDto.hasMore exactly by reading one row past the page"
```

---

### Task 2: §17.1 — `message:new` da `clientMsgId`

**Files:**
- Modify: `src/modules/chat/domain/entities/message.entity.ts`
- Modify: `src/modules/chat/infrastructure/chat.mapper.ts:44-54`
- Modify: `src/modules/chat/presentation/dto/message.dto.ts`
- Modify: `src/modules/chat/presentation/dto/conversation.dto.ts:64-106`
- Modify: `src/modules/chat/presentation/conversations.controller.ts`
- Modify: `src/modules/chat/chat.gateway.ts:159-181`
- Create: `src/modules/chat/presentation/dto/message.dto.spec.ts`
- Create: `src/modules/chat/chat.gateway.spec.ts`

**Interfaces:**
- Consumes: `MessageListDto.from(messages, hasMore)` (Task 1)
- Produces: `Message.clientMsgId: string | null`
- Produces: `MessageDto.fromDomain(message: Message, viewerId: string | null): MessageDto`
- Produces: `MessageListDto.from(messages: Message[], hasMore: boolean, viewerId: string): MessageListDto`
- Produces: `ConversationListItemDto.fromItem(item: ConversationListItem, viewerId: string)`
- Produces: `ConversationPageDto.fromPage(result, page, size, viewerId: string)`

- [ ] **Step 1: Write the failing test**

Create `src/modules/chat/presentation/dto/message.dto.spec.ts`:

```ts
import { MessageType } from '../../domain/enums/message-type.enum';
import { Message } from '../../domain/entities/message.entity';
import { MessageDto } from './message.dto';

const message: Message = {
  id: 'msg_1',
  conversationId: 'cnv_1',
  senderId: 'std_sender',
  seq: 7,
  type: MessageType.TEXT,
  body: 'salom',
  clientMsgId: 'cmid-1',
  createdAt: new Date('2026-07-28T09:14:22.531Z'),
};

describe('MessageDto — clientMsgId visibility (§17.1)', () => {
  it('exposes clientMsgId to the sender', () => {
    expect(MessageDto.fromDomain(message, 'std_sender').clientMsgId).toBe('cmid-1');
  });

  it('hides clientMsgId from the recipient', () => {
    expect(MessageDto.fromDomain(message, 'std_other').clientMsgId).toBeNull();
  });

  it('hides clientMsgId when there is no viewer', () => {
    expect(MessageDto.fromDomain(message, null).clientMsgId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/chat/presentation/dto/message.dto.spec.ts`
Expected: FAIL — `clientMsgId` `Message` da ham, `MessageDto` da ham yo'q (TS xatosi).

- [ ] **Step 3: Domain entity + mapper**

`src/modules/chat/domain/entities/message.entity.ts`:

```ts
import { MessageType } from '../enums/message-type.enum';

/** A chat message with a per-conversation monotonic `seq` (C4). */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  seq: number;
  type: MessageType;
  body: string | null;
  /** The sender's idempotency key (C6). Null for server/system messages. */
  clientMsgId: string | null;
  createdAt: Date;
}
```

`src/modules/chat/infrastructure/chat.mapper.ts` — `toMessage` ga bitta satr:

```ts
  static toMessage(row: PrismaMessage): Message {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      seq: row.seq,
      type: MessageType[row.type],
      body: row.body,
      clientMsgId: row.clientMsgId,
      createdAt: row.createdAt,
    };
  }
```

- [ ] **Step 4: `MessageDto`**

`src/modules/chat/presentation/dto/message.dto.ts` — `MessageDto` ga maydon va yangi imzo:

```ts
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Your own idempotency key, echoed back — set only when you are the sender, `null` for ' +
      'everyone else. Match it against the optimistic copy on screen instead of matching by text ' +
      '(media messages have no text) (§17.1).',
  })
  clientMsgId!: string | null;

  /** `viewerId` is who will read this DTO — `clientMsgId` is private to the sender. */
  static fromDomain(message: Message, viewerId: string | null): MessageDto {
    const dto = new MessageDto();
    dto.id = message.id;
    dto.conversationId = message.conversationId;
    dto.senderId = message.senderId;
    dto.seq = message.seq;
    dto.type = message.type;
    dto.body = message.body;
    dto.clientMsgId = message.senderId === viewerId ? message.clientMsgId : null;
    dto.createdAt = message.createdAt.toISOString();
    return dto;
  }
```

`MessageListDto.from` ga `viewerId` qo'shing:

```ts
  static from(messages: Message[], hasMore: boolean, viewerId: string): MessageListDto {
    const dto = new MessageListDto();
    dto.items = messages.map((message) => MessageDto.fromDomain(message, viewerId));
    dto.hasMore = hasMore;
    return dto;
  }
```

- [ ] **Step 5: Run the DTO test**

Run: `npx jest src/modules/chat/presentation/dto/message.dto.spec.ts`
Expected: PASS.

- [ ] **Step 6: `viewerId` ni suhbat DTO'lari orqali o'tkazing**

`src/modules/chat/presentation/dto/conversation.dto.ts`:

```ts
  static fromItem(item: ConversationListItem, viewerId: string): ConversationListItemDto {
    const dto = new ConversationListItemDto();
    dto.conversation = ConversationDto.fromDomain(item.conversation);
    dto.other = StudentSummaryDto.fromDomain(item.other);
    dto.lastMessage =
      item.lastMessage === null ? null : MessageDto.fromDomain(item.lastMessage, viewerId);
    dto.unreadCount = item.unreadCount;
    dto.myReadSeq = item.myReadSeq;
    dto.peerReadSeq = item.peerReadSeq;
    dto.peerDeliveredSeq = item.peerDeliveredSeq;
    return dto;
  }
```

```ts
  static fromPage(
    result: Page<ConversationListItem>,
    page: number,
    size: number,
    viewerId: string,
  ): ConversationPageDto {
    const dto = new ConversationPageDto();
    dto.items = result.items.map((item) => ConversationListItemDto.fromItem(item, viewerId));
    dto.page = page;
    dto.size = size;
    dto.total = result.total;
    dto.hasNext = page * size < result.total;
    return dto;
  }
```

- [ ] **Step 7: Kontrollerni yangilang**

`src/modules/chat/presentation/conversations.controller.ts` — uchta chaqiruv:

```ts
    return ConversationPageDto.fromPage(result, page, size, user.id);
```
```ts
    return MessageListDto.from(page.items, page.hasMore, user.id);
```
```ts
    return MessageDto.fromDomain(message, user.id);
```

- [ ] **Step 8: Gateway — ikkita alohida payload**

`src/modules/chat/chat.gateway.ts` — `broadcastMessage` ni almashtiring:

```ts
  /**
   * Broadcast a new message to both members' personal rooms (used by WS send + the REST fallback).
   * Each side gets its own payload: `clientMsgId` is echoed only to the sender's devices, so the
   * sender can retire its optimistic copy by id instead of by text (§17.1).
   */
  async broadcastMessage(message: Message): Promise<void> {
    const otherId = await this.chat.otherMemberId(message.conversationId, message.senderId);
    // WS fan-out to both members' devices (only when a socket server is bound).
    if (this.server !== undefined) {
      this.server.to(personalRoom(message.senderId)).emit(CHAT_EVENT.MESSAGE_NEW, {
        conversationId: message.conversationId,
        message: MessageDto.fromDomain(message, message.senderId),
      });
      if (otherId !== null) {
        this.server.to(personalRoom(otherId)).emit(CHAT_EVENT.MESSAGE_NEW, {
          conversationId: message.conversationId,
          message: MessageDto.fromDomain(message, otherId),
        });
      }
    }
    // Offline push to the recipient (C8) — best-effort; only when they have no open socket.
    if (otherId !== null && !(await this.chat.isOnline(otherId))) {
      await this.notifications.pushToStudent(otherId, {
        title: 'Yangi xabar',
        body: message.body ?? '',
        data: { conversationId: message.conversationId },
      });
    }
  }
```

- [ ] **Step 9: Gateway testi**

Create `src/modules/chat/chat.gateway.spec.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'socket.io';
import { ChatService } from './application/chat.service';
import { CHAT_EVENT } from './application/chat-events';
import { ChatGateway } from './chat.gateway';
import { Message } from './domain/entities/message.entity';
import { MessageType } from './domain/enums/message-type.enum';
import { NotificationsService } from '../notifications/application/notifications.service';

const SENDER = 'std_sender';
const OTHER = 'std_other';

const message: Message = {
  id: 'msg_1',
  conversationId: 'cnv_1',
  senderId: SENDER,
  seq: 7,
  type: MessageType.TEXT,
  body: 'salom',
  clientMsgId: 'cmid-1',
  createdAt: new Date('2026-07-28T09:14:22.531Z'),
};

describe('ChatGateway — broadcast (§17.1)', () => {
  let gateway: ChatGateway;
  let chat: jest.Mocked<Pick<ChatService, 'otherMemberId' | 'isOnline'>>;
  let emit: jest.Mock;
  let to: jest.Mock;

  beforeEach(() => {
    chat = {
      otherMemberId: jest.fn().mockResolvedValue(OTHER),
      isOnline: jest.fn().mockResolvedValue(true),
    };
    const notifications = { pushToStudent: jest.fn() };
    gateway = new ChatGateway(
      chat as unknown as ChatService,
      notifications as unknown as NotificationsService,
      {} as JwtService,
      {} as ConfigService<never, true>,
    );
    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
    (gateway as unknown as { server: Server }).server = { to } as unknown as Server;
  });

  it('echoes clientMsgId to the sender and hides it from the recipient', async () => {
    await gateway.broadcastMessage(message);

    const payloads = emit.mock.calls
      .filter(([event]) => event === CHAT_EVENT.MESSAGE_NEW)
      .map(([, payload]) => payload as { message: { clientMsgId: string | null } });

    expect(to).toHaveBeenCalledWith(`user:${SENDER}`);
    expect(to).toHaveBeenCalledWith(`user:${OTHER}`);
    expect(payloads.map((p) => p.message.clientMsgId)).toEqual(['cmid-1', null]);
  });
});
```

- [ ] **Step 10: Run tests**

Run: `npx jest src/modules/chat && npx tsc --noEmit`
Expected: PASS. Mavjud `chat.service.spec.ts` dagi `Message` fixture'lariga `clientMsgId: null` qo'shishingiz kerak bo'ladi (TS talab qiladi).

- [ ] **Step 11: Commit**

```bash
git add src/modules/chat
git commit -m "fix(chat): echo clientMsgId to the sender in message:new and message history"
```

---

### Task 3: §17.3 `TOKEN_EXPIRED` + §17.8 `read`/`delivered` ack

**Files:**
- Modify: `src/modules/chat/infrastructure/ws-jwt.ts`
- Modify: `src/modules/chat/chat.gateway.ts:55-157`
- Modify: `src/modules/chat/chat.gateway.spec.ts`

**Interfaces:**
- Consumes: `ChatGateway.broadcastMessage` (Task 2)
- Produces: `verifyStudentSocket(client, jwt, config): Promise<VerifiedSocket>` — `VerifiedSocket { user: AuthenticatedUser; expiresAt: number }` (`expiresAt` — unix **soniya**)
- Produces: `message:read` / `message:delivered` ack `{ conversationId, seq, status: 'ok' }`, xatoda `{ status: 'error', error: { code, message } }`

- [ ] **Step 1: Write the failing test**

`src/modules/chat/chat.gateway.spec.ts` ga yangi `describe` qo'shing:

```ts
describe('ChatGateway — token freshness (§17.3) and cursor acks (§17.8)', () => {
  let gateway: ChatGateway;
  let chat: {
    otherMemberId: jest.Mock;
    isOnline: jest.Mock;
    sendMessage: jest.Mock;
    markRead: jest.Mock;
  };

  const socketWith = (expSeconds: number): { data: Record<string, unknown> } => ({
    data: { user: { id: SENDER, type: 'STUDENT' }, tokenExp: expSeconds },
  });

  beforeEach(() => {
    chat = {
      otherMemberId: jest.fn().mockResolvedValue(OTHER),
      isOnline: jest.fn().mockResolvedValue(true),
      sendMessage: jest.fn().mockResolvedValue(message),
      markRead: jest.fn().mockResolvedValue(undefined),
    };
    gateway = new ChatGateway(
      chat as unknown as ChatService,
      { pushToStudent: jest.fn() } as unknown as NotificationsService,
      {} as JwtService,
      {} as ConfigService<never, true>,
    );
    const emit = jest.fn();
    (gateway as unknown as { server: Server }).server = {
      to: jest.fn().mockReturnValue({ emit }),
    } as unknown as Server;
  });

  it('rejects a send once the handshake token has expired', async () => {
    const expired = socketWith(Math.floor(Date.now() / 1000) - 1);

    const ack = await gateway.onSend(expired as never, {
      conversationId: 'cnv_1',
      clientMsgId: 'cmid-1',
      body: 'salom',
    });

    expect(ack).toEqual({
      clientMsgId: 'cmid-1',
      status: 'error',
      error: { code: 'TOKEN_EXPIRED', message: 'Sessiya muddati tugadi' },
    });
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  it('acks message:read with the cursor it stored', async () => {
    const fresh = socketWith(Math.floor(Date.now() / 1000) + 600);

    const ack = await gateway.onRead(fresh as never, { conversationId: 'cnv_1', seq: 42 });

    expect(ack).toEqual({ conversationId: 'cnv_1', seq: 42, status: 'ok' });
    expect(chat.markRead).toHaveBeenCalledWith({ id: SENDER, type: 'STUDENT' }, 'cnv_1', 42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/chat/chat.gateway.spec.ts -t "token freshness"`
Expected: FAIL — `onSend` muddatni tekshirmaydi, `onRead` `undefined` qaytaradi.

- [ ] **Step 3: `ws-jwt.ts` — `exp` ni qaytaring**

`src/modules/chat/infrastructure/ws-jwt.ts` — importlarni saqlab, quyidagini almashtiring:

```ts
/** A verified handshake: who they are, and when their access token stops being valid. */
export interface VerifiedSocket {
  user: AuthenticatedUser;
  /** The token's `exp` claim — unix **seconds**, not milliseconds. */
  expiresAt: number;
}

/**
 * Verifies a socket handshake's access token exactly like JwtAuthGuard (JWT_ACCESS_SECRET) and
 * asserts it is a STUDENT. The token is read from `handshake.auth.token` or the `Authorization`
 * header. Throws on any failure — the gateway disconnects the socket.
 */
export async function verifyStudentSocket(
  client: Socket,
  jwt: JwtService,
  config: ConfigService<Env, true>,
): Promise<VerifiedSocket> {
  const raw =
    (typeof client.handshake.auth?.token === 'string' ? client.handshake.auth.token : null) ??
    extractBearer(client.handshake.headers.authorization);
  if (raw === null) {
    throw new Error('missing token');
  }
  const payload = await jwt.verifyAsync<JwtPayload & { exp: number }>(raw, {
    secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
  });
  if (payload.type !== AccountType.STUDENT) {
    throw new Error('not a student');
  }
  return { user: { id: payload.sub, type: payload.type }, expiresAt: payload.exp };
}
```

- [ ] **Step 4: Gateway — muddatni saqlang va tekshiring**

`src/modules/chat/chat.gateway.ts`:

`handleConnection` ni almashtiring:

```ts
  async handleConnection(client: Socket): Promise<void> {
    let verified: VerifiedSocket;
    try {
      verified = await verifyStudentSocket(client, this.jwt, this.config);
    } catch {
      this.logger.warn('Rejected an unauthenticated /chat socket');
      client.disconnect(true);
      return;
    }
    client.data.user = verified.user;
    client.data.tokenExp = verified.expiresAt;
    await client.join(personalRoom(verified.user.id));
    await this.chat.goOnline(verified.user.id);
    await this.emitPresence(verified.user.id, true, null);
  }
```

Importni yangilang: `import { verifyStudentSocket, VerifiedSocket } from './infrastructure/ws-jwt';`

Fayl oxiriga (`toError` yonida) qo'shing:

```ts
/**
 * The handshake token is checked once, at connect. A socket can stay open long past its access
 * token's lifetime, so every client→server event re-checks the stored `exp` and fails with the same
 * code REST uses — the client refreshes and reconnects with a fresh `auth.token` (§17.3).
 */
function assertTokenFresh(client: Socket): void {
  const exp = client.data.tokenExp as number | undefined;
  if (exp === undefined || exp * 1000 <= Date.now()) {
    throw new AppException(ERROR_CODE.TOKEN_EXPIRED, 401, 'Sessiya muddati tugadi');
  }
}
```

- [ ] **Step 5: Handlerlarga qo'llang**

`onSend` — `try` blokining birinchi satri sifatida `assertTokenFresh(client);` qo'shing (mavjud `catch` uni `toError` orqali ack'ka aylantiradi).

`onRead` ni almashtiring:

```ts
  @SubscribeMessage(CHAT_EVENT.MESSAGE_READ)
  async onRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CursorPayload,
  ): Promise<Record<string, unknown>> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: unauthorized() };
    }
    try {
      assertTokenFresh(client);
      await this.chat.markRead(user, payload.conversationId, payload.seq);
      await this.broadcastRead(payload.conversationId, user.id, payload.seq);
      return { conversationId: payload.conversationId, seq: payload.seq, status: 'ok' };
    } catch (error) {
      return { status: 'error', error: toError(error) };
    }
  }
```

`onDelivered` ni almashtiring:

```ts
  @SubscribeMessage(CHAT_EVENT.MESSAGE_DELIVERED)
  async onDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CursorPayload,
  ): Promise<Record<string, unknown>> {
    const user = userOf(client);
    if (user === undefined) {
      return { status: 'error', error: unauthorized() };
    }
    try {
      assertTokenFresh(client);
      await this.chat.markDelivered(user, payload.conversationId, payload.seq);
      await this.broadcastDelivered(payload.conversationId, user.id, payload.seq);
      return { conversationId: payload.conversationId, seq: payload.seq, status: 'ok' };
    } catch (error) {
      return { status: 'error', error: toError(error) };
    }
  }
```

`broadcastDelivered` Task 4 da yaratiladi. **Hozircha** `onDelivered` ichidagi mavjud inline emit kodini shu nom ostidagi private metodga ko'chiring va Task 4 da uni publicga chiqarasiz:

```ts
  /** Broadcast a delivered receipt to the other member (the sender whose messages arrived). */
  async broadcastDelivered(conversationId: string, byStudentId: string, seq: number): Promise<void> {
    if (this.server === undefined) {
      return;
    }
    const otherId = await this.chat.otherMemberId(conversationId, byStudentId);
    if (otherId !== null) {
      this.server
        .to(personalRoom(otherId))
        .emit(CHAT_EVENT.DELIVERED_RECEIPT, { conversationId, seq, byStudentId });
    }
  }
```

`typing:start` / `typing:stop` — ataylab tegilmaydi (efemer, ack kerak emas).

- [ ] **Step 6: Run tests**

Run: `npx jest src/modules/chat && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/chat
git commit -m "fix(chat): surface TOKEN_EXPIRED on WS events and ack read/delivered cursors"
```

---

### Task 4: §17.6 — `POST /v1/conversations/{id}/delivered`

**Files:**
- Modify: `src/modules/chat/presentation/dto/requests.dto.ts`
- Modify: `src/modules/chat/presentation/conversations.controller.ts`
- Test: `test/chat.e2e-spec.ts`

**Interfaces:**
- Consumes: `ChatGateway.broadcastDelivered(conversationId, byStudentId, seq)` (Task 3)
- Consumes: `ChatService.markDelivered(user, conversationId, seq)` (mavjud)
- Produces: `POST /v1/conversations/:id/delivered` — tanasi `{ seq: int ≥ 0 }`, javob `200`, `result: null`

- [ ] **Step 1: Write the failing test**

`test/chat.e2e-spec.ts` ga yangi test qo'shing (`conversationId` allaqachon o'rnatilgan `it` lardan keyin):

```ts
  it('advances the delivered cursor over REST when the socket is down (§17.6)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/delivered`)
      .set('Authorization', auth(bToken))
      .send({ seq: 1 })
      .expect(200);

    const member = await prisma.conversationMember.findUniqueOrThrow({
      where: { conversationId_studentId: { conversationId, studentId: bId } },
    });
    expect(member.lastDeliveredSeq).toBeGreaterThanOrEqual(1);
  });

  it('rejects a delivered cursor from a non-member', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/delivered`)
      .set('Authorization', auth(cToken))
      .send({ seq: 1 })
      .expect(404);
    expect(res.body.error.code).toBe('CONVERSATION_NOT_FOUND');
  });
```

> `cToken` faylda hali yo'q bo'lsa, `register(C_EMAIL)` natijasini `cToken` o'zgaruvchisiga saqlang (hozir tashlab yuborilgan) va `let cToken: string;` e'lon qiling.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- chat.e2e-spec`
Expected: FAIL — `404` (marshrut yo'q) yoki `Cannot POST`.

- [ ] **Step 3: DTO**

`src/modules/chat/presentation/dto/requests.dto.ts` oxiriga:

```ts
/** Body of `POST /v1/conversations/:id/delivered` — the REST twin of the `message:delivered` event. */
export class MarkDeliveredDto {
  @ApiProperty({ type: 'integer', format: 'int32', minimum: 0, description: 'Highest delivered `seq`' })
  @IsInt()
  @Min(0)
  seq!: number;
}
```

- [ ] **Step 4: Kontroller**

`src/modules/chat/presentation/conversations.controller.ts` — `read` metodidan keyin:

```ts
  @Post(':id/delivered')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Advance the delivered cursor',
    description:
      'REST twin of the `message:delivered` WS event, for when the socket is down. Without it the ' +
      'delivered cursor could never move while offline and the sender kept a single tick forever.',
  })
  @ApiParam({ name: 'id', description: 'Conversation id' })
  @ApiOkEnvelope(undefined, 'Delivered; `result` is null.')
  @ApiNotFoundEnvelope(ERROR_CODE.CONVERSATION_NOT_FOUND, 'Not a member.', 'Suhbat topilmadi')
  @ApiValidationEnvelope()
  async delivered(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MarkDeliveredDto,
  ): Promise<void> {
    await this.chat.markDelivered(user, id, dto.seq);
    await this.gateway.broadcastDelivered(id, user.id, dto.seq);
  }
```

Importga `MarkDeliveredDto` qo'shing.

- [ ] **Step 5: Run tests**

Run: `npm run test:e2e -- chat.e2e-spec && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/chat test/chat.e2e-spec.ts
git commit -m "feat(chat): add POST /v1/conversations/:id/delivered as a REST fallback for the delivered cursor"
```

---

### Task 5: §17.7 — suhbatlar tartibi `NULLS LAST` + barqaror

**Files:**
- Modify: `src/modules/chat/infrastructure/chat.prisma.repository.ts:156-180`
- Test: `test/chat.e2e-spec.ts`

**Interfaces:**
- Produces: o'zgarish yo'q — `listConversations` imzosi o'sha-o'sha, faqat tartib to'g'rilanadi.

- [ ] **Step 1: Write the failing test**

`test/chat.e2e-spec.ts` ga:

```ts
  it('sorts empty conversations last and keeps the order stable (§17.7)', async () => {
    // A opens a second conversation that never receives a message.
    await request(app.getHttpServer())
      .post('/v1/conversations')
      .set('Authorization', auth(aToken))
      .send({ studentId: cId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/v1/conversations?page=1&size=20')
      .set('Authorization', auth(aToken))
      .expect(200);

    const rows = res.body.result.items as { conversation: { lastMessageAt: string | null } }[];
    const firstEmpty = rows.findIndex((row) => row.conversation.lastMessageAt === null);
    const lastNonEmpty = rows.map((row) => row.conversation.lastMessageAt).lastIndexOf(null) - 1;

    expect(firstEmpty).toBeGreaterThan(-1);
    expect(rows.slice(firstEmpty).every((row) => row.conversation.lastMessageAt === null)).toBe(true);
    expect(lastNonEmpty).toBeLessThan(rows.length);
  });
```

> Bu test A va C o'rtasida ulanish talab qiladi. Fayldagi mavjud oqim C ni faqat bloklash/shikoyat maqsadida yaratadi — agar `POST /v1/conversations` `NOT_CONNECTED` qaytarsa, avval A↔C ulanishini o'rnating (fayldagi mavjud `connect(...)` helperi yoki to'g'ridan-to'g'ri `prisma.connection.create`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- chat.e2e-spec -t "sorts empty conversations last"`
Expected: FAIL — bo'sh suhbat ro'yxat **boshida** turadi.

- [ ] **Step 3: Tartibni to'g'rilang**

`src/modules/chat/infrastructure/chat.prisma.repository.ts` — `listConversations` ichidagi `orderBy` ni almashtiring:

```ts
        // Newest-active first. Postgres puts NULL first on a DESC sort, which floated conversations
        // that never received a message to the top (§17.7). `createdAt`/`id` are the tiebreaker: with
        // NULLS LAST alone every empty conversation compares equal, leaving OFFSET paging free to
        // repeat or drop rows across pages.
        orderBy: [
          { conversation: { lastMessageAt: { sort: 'desc', nulls: 'last' } } },
          { conversation: { createdAt: 'desc' } },
          { conversationId: 'desc' },
        ],
```

- [ ] **Step 4: Run tests**

Run: `npm run test:e2e -- chat.e2e-spec && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/chat test/chat.e2e-spec.ts
git commit -m "fix(chat): order conversations by lastMessageAt DESC NULLS LAST with a stable tiebreaker"
```

---

### Task 6: §17.4 — `POST /v1/reports` `messageId` ni tekshirsin

**Files:**
- Create: `src/modules/connections/domain/message-directory.repository.ts`
- Create: `src/modules/connections/infrastructure/message-directory.prisma.repository.ts`
- Modify: `src/modules/connections/application/reports.service.ts`
- Modify: `src/modules/connections/connections.module.ts`
- Modify: `src/common/errors/error-code.ts`
- Modify: `src/modules/connections/presentation/reports.controller.ts` (Swagger)
- Test: `src/modules/connections/application/reports.service.spec.ts`

**Interfaces:**
- Produces: `MESSAGE_DIRECTORY` DI tokeni
- Produces: `MessageDirectoryRepository.findReportable(messageId: string, reporterId: string): Promise<ReportableMessage | null>`, `ReportableMessage { id: string; body: string | null }`
- Produces: `ERROR_CODE.MESSAGE_NOT_FOUND`

- [ ] **Step 1: Write the failing test**

`src/modules/connections/application/reports.service.spec.ts` ga qo'shing (mavjud mock'lar uslubiga moslang):

```ts
  describe('message reports (§17.4)', () => {
    it('rejects a messageId the reporter cannot see', async () => {
      messages.findReportable.mockResolvedValue(null);

      await expect(
        service.report(user, { targetStudentId: null, messageId: 'msg_x', reason, note: null }),
      ).rejects.toMatchObject({ code: 'MESSAGE_NOT_FOUND', status: 422 });

      expect(reportsRepo.create).not.toHaveBeenCalled();
    });

    it('snapshots the reported message body', async () => {
      messages.findReportable.mockResolvedValue({ id: 'msg_1', body: 'yomon gap' });
      reportsRepo.findOpenReport.mockResolvedValue(null);

      await service.report(user, {
        targetStudentId: null,
        messageId: 'msg_1',
        reason,
        note: null,
      });

      expect(reportsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'msg_1', contentSnapshot: 'yomon gap' }),
      );
    });
  });
```

Test faylining `beforeEach` iga yangi mock va provider qo'shing:

```ts
    messages = { findReportable: jest.fn() };
```
va `Test.createTestingModule` providerlariga (yoki qo'lda `new ReportsService(...)` chaqirig'iga) `{ provide: MESSAGE_DIRECTORY, useValue: messages }` qo'shing.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/connections/application/reports.service.spec.ts`
Expected: FAIL — `MESSAGE_DIRECTORY` mavjud emas (TS xatosi).

- [ ] **Step 3: Xato kodini qo'shing**

`src/common/errors/error-code.ts` — `// chat` bo'limiga:

```ts
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
```

- [ ] **Step 4: Portni yarating**

Create `src/modules/connections/domain/message-directory.repository.ts`:

```ts
/** Injection token for the reportable-message lookup port (bound to the Prisma impl in the module). */
export const MESSAGE_DIRECTORY = Symbol('MESSAGE_DIRECTORY');

/** The slice of a message a report needs: its id, and the text to snapshot for moderation. */
export interface ReportableMessage {
  id: string;
  body: string | null;
}

/**
 * Looks up a message a reporter is entitled to report. Existence and membership are one question,
 * not two: a message in someone else's conversation must be indistinguishable from one that does
 * not exist, or the endpoint becomes a probe for other people's message ids.
 */
export interface MessageDirectoryRepository {
  findReportable(messageId: string, reporterId: string): Promise<ReportableMessage | null>;
}
```

- [ ] **Step 5: Prisma implementatsiyasi**

Create `src/modules/connections/infrastructure/message-directory.prisma.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  MessageDirectoryRepository,
  ReportableMessage,
} from '../domain/message-directory.repository';

/** Prisma implementation of the reportable-message port. Prisma is used ONLY here. */
@Injectable()
export class MessageDirectoryPrismaRepository implements MessageDirectoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findReportable(messageId: string, reporterId: string): Promise<ReportableMessage | null> {
    return this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversation: { members: { some: { studentId: reporterId } } },
      },
      select: { id: true, body: true },
    });
  }
}
```

- [ ] **Step 6: Servisni yangilang**

`src/modules/connections/application/reports.service.ts`:

Importlarga qo'shing:

```ts
import {
  MESSAGE_DIRECTORY,
  MessageDirectoryRepository,
} from '../domain/message-directory.repository';
```

Konstruktorga qo'shing:

```ts
    @Inject(MESSAGE_DIRECTORY) private readonly messages: MessageDirectoryRepository,
```

Klass izohidagi «Message snapshotting lands in Plan 2 (no `Message` table yet).» jumlasini olib tashlang — endi bajarildi.

`report` metodida `targetStudentId` blokidan keyin, `findOpenReport` dan **oldin** qo'shing:

```ts
    // A report must point at something a moderator can open. An unknown id — or one from someone
    // else's conversation — used to be accepted, filling the queue with dangling rows (§17.4).
    // 422 (not 404) is what the mobile contract specifies for this case.
    let contentSnapshot: string | null = null;
    if (messageId !== null) {
      const message = await this.messages.findReportable(messageId, user.id);
      if (message === null) {
        throw new AppException(ERROR_CODE.MESSAGE_NOT_FOUND, 422, 'Xabar topilmadi');
      }
      contentSnapshot = message.body;
    }
```

`create` chaqirig'ida `contentSnapshot: null` ni `contentSnapshot,` ga almashtiring.

- [ ] **Step 7: Modulga bog'lang**

`src/modules/connections/connections.module.ts` — providerlarga:

```ts
    { provide: MESSAGE_DIRECTORY, useClass: MessageDirectoryPrismaRepository },
```

Mos importlarni qo'shing.

- [ ] **Step 8: Swagger hujjatini yangilang**

`src/modules/connections/presentation/reports.controller.ts` — `@ApiValidationEnvelope(...)` matnini almashtiring:

```ts
  @ApiValidationEnvelope(
    'Neither or both targets given (`REPORT_TARGET_INVALID`), a bad reason, or a `messageId` that ' +
      'does not exist in a conversation you belong to (`MESSAGE_NOT_FOUND`).',
  )
```

- [ ] **Step 9: Run tests**

Run: `npx jest src/modules/connections && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 10: E2E tekshiruvi qo'shing**

`test/chat.e2e-spec.ts` ga:

```ts
  it('rejects a report for a message the reporter cannot see (§17.4)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/reports')
      .set('Authorization', auth(cToken))
      .send({ messageId: 'msg_does_not_exist', reason: 'SPAM' })
      .expect(422);
    expect(res.body.error.code).toBe('MESSAGE_NOT_FOUND');
  });
```

> `reason` qiymati `ReportReason` enum'ida mavjud bo'lishi shart — `src/modules/connections/domain/enums/report-reason.enum.ts` ni tekshirib, undagi haqiqiy qiymatni qo'ying.

Run: `npm run test:e2e -- chat.e2e-spec`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/modules/connections src/common/errors/error-code.ts test/chat.e2e-spec.ts
git commit -m "fix(reports): verify messageId exists in the reporter's conversation and snapshot its body"
```

---

### Task 7: §19 — OpenAPI dump skripti + guard testi

**Files:**
- Create: `src/common/swagger/openapi-document.ts`
- Modify: `src/main.ts:19-51, 107-213`
- Create: `scripts/dump-openapi.ts`
- Create: `test/openapi.e2e-spec.ts`
- Modify: `package.json` (scripts)
- Modify: `.gitignore` (kerak bo'lsa — `docs/api/generated/` **commit qilinadi**, ignore qilinmaydi)

**Interfaces:**
- Produces: `BUSINESS_DOC_TAGS: string[]`, `STUDENT_DOC_TAGS: string[]`
- Produces: `buildAppDocuments(app: INestApplication, prefix: string, swaggerPath: string): { business: OpenAPIObject; student: OpenAPIObject }`
- Produces: `npm run openapi:dump` → `docs/api/generated/{student,business}.json`

- [ ] **Step 1: Swagger qurishni ajrating**

Create `src/common/swagger/openapi-document.ts`. `src/main.ts` dan **ko'chiring** (nusxalamang — main.ts dan olib tashlanadi): `BUSINESS_DOC_TAGS`, `STUDENT_DOC_TAGS`, `DocumentBuilder` zanjiri va hujjatni bo'lish mantiqi.

```ts
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { filterOpenApiByTags } from './filter-openapi-by-tags';

// Tags served in each per-app Swagger doc. The two mobile apps are generated from their own JSON, so
// each doc carries only its account type's endpoints plus the shared ones (Profiles, Geo, Media).
// `Health` and `Admin — Business Types` belong to neither app and are left out of both. Strings must
// match the @ApiTags / DocumentBuilder.addTag names exactly — `buildAppDocuments` asserts this.
export const BUSINESS_DOC_TAGS = [ /* main.ts dagi ro'yxatni o'zgarishsiz ko'chiring */ ];
export const STUDENT_DOC_TAGS = [ /* main.ts dagi ro'yxatni o'zgarishsiz ko'chiring */ ];

/** The two per-app OpenAPI documents the mobile clients are generated from. */
export interface AppDocuments {
  business: OpenAPIObject;
  student: OpenAPIObject;
}

/**
 * Builds both per-app OpenAPI documents. Shared by the running app (which serves them) and
 * `scripts/dump-openapi.ts` (which writes them to disk) so the served and committed specs can never
 * drift.
 */
export function buildAppDocuments(
  app: INestApplication,
  prefix: string,
  swaggerPath: string,
): AppDocuments {
  const config = new DocumentBuilder()
    /* main.ts dagi butun zanjirni o'zgarishsiz ko'chiring — setTitle dan .build() gacha,
       `${prefix}` interpolyatsiyasini saqlab */
    .build();

  const fullDocument = SwaggerModule.createDocument(app, config);

  // Fail fast if a doc's tag list drifted from the actual @ApiTags / addTag names.
  const knownTags = new Set((fullDocument.tags ?? []).map((tag) => tag.name));
  for (const tag of [...BUSINESS_DOC_TAGS, ...STUDENT_DOC_TAGS]) {
    if (!knownTags.has(tag)) {
      throw new Error(`Swagger split references an unknown tag: "${tag}"`);
    }
  }

  const commonDescription = fullDocument.info.description ?? '';
  const withAppInfo = (doc: OpenAPIObject, title: string, jsonPath: string): OpenAPIObject => ({
    ...doc,
    info: {
      ...doc.info,
      title,
      description: `${commonDescription}\n\nThe full OpenAPI JSON (feed this to the mobile client codegen) is at [${jsonPath}](${jsonPath}).`,
    },
  });

  return {
    business: withAppInfo(
      filterOpenApiByTags(fullDocument, BUSINESS_DOC_TAGS),
      'ElonUz — Business API',
      `/${swaggerPath}/business/json`,
    ),
    student: withAppInfo(
      filterOpenApiByTags(fullDocument, STUDENT_DOC_TAGS),
      'ElonUz — Student API',
      `/${swaggerPath}/student/json`,
    ),
  };
}
```

- [ ] **Step 2: `main.ts` ni qisqartiring**

`src/main.ts` dan tag massivlarini, `DocumentBuilder` zanjirini va bo'lish mantiqini olib tashlang. Swagger bloki quyidagicha qoladi:

```ts
  if (swaggerPassword || !isProd) {
    if (swaggerPassword) {
      // One mount on `/${swaggerPath}` covers both sub-docs and their JSON.
      app.use(`/${swaggerPath}`, swaggerBasicAuth(swaggerUser, swaggerPassword));
    }
    const { business: businessDoc, student: studentDoc } = buildAppDocuments(
      app,
      prefix,
      swaggerPath,
    );

    SwaggerModule.setup(`${swaggerPath}/business`, app, businessDoc, {
      jsonDocumentUrl: `${swaggerPath}/business/json`,
      yamlDocumentUrl: `${swaggerPath}/business/yaml`,
      swaggerOptions: { persistAuthorization: true },
    });
    SwaggerModule.setup(`${swaggerPath}/student`, app, studentDoc, {
      jsonDocumentUrl: `${swaggerPath}/student/json`,
      yamlDocumentUrl: `${swaggerPath}/student/yaml`,
      swaggerOptions: { persistAuthorization: true },
    });
  } else {
```

Endi keraksiz importlarni (`DocumentBuilder`, `OpenAPIObject`, `filterOpenApiByTags`) olib tashlang va `buildAppDocuments` ni import qiling.

- [ ] **Step 3: Skriptni yarating**

Create `scripts/dump-openapi.ts`:

```ts
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { buildAppDocuments } from '../src/common/swagger/openapi-document';

/**
 * Writes both per-app OpenAPI documents to `docs/api/generated/`. Runs in Nest's preview mode, so
 * providers are never instantiated — no database, Redis or credentials required, which is what lets
 * this run in CI and as a test fixture.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  const prefix = process.env.API_PREFIX ?? 'v1';
  const swaggerPath = process.env.SWAGGER_PATH ?? 'docs';
  const docs = buildAppDocuments(app, prefix, swaggerPath);
  await app.close();

  const outDir = resolve(__dirname, '..', 'docs', 'api', 'generated');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'student.json'), `${JSON.stringify(docs.student, null, 2)}\n`);
  await writeFile(join(outDir, 'business.json'), `${JSON.stringify(docs.business, null, 2)}\n`);
  process.stdout.write(`OpenAPI written to ${outDir}\n`);
}

void main();
```

- [ ] **Step 4: npm skripti**

`package.json` `scripts` ga:

```json
    "openapi:dump": "ts-node scripts/dump-openapi.ts",
```

- [ ] **Step 5: Skriptni ishga tushiring**

Run: `npm run openapi:dump`
Expected: `docs/api/generated/student.json` va `business.json` yaratiladi. Agar `ConfigModule` env talab qilib xato bersa — `.env` mavjudligiga ishonch hosil qiling (boshqa e2e testlar ham shunga tayanadi).

- [ ] **Step 6: Guard testini yozing**

Create `test/openapi.e2e-spec.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { buildAppDocuments } from '../src/common/swagger/openapi-document';

/** Property names that are conceptually whole numbers — `number` makes the Kotlin codegen emit Double. */
const MUST_BE_INTEGER = [
  'seq',
  'unreadCount',
  'myReadSeq',
  'peerReadSeq',
  'peerDeliveredSeq',
  'page',
  'size',
  'total',
];

interface Offender {
  path: string;
  reason: string;
}

/**
 * Walks every schema in a document. A bare `{"type":"object"}` with no shape is what NestJS emits for
 * a `string | null` property; the Kotlin generator turns it into `Any?`, which kotlinx.serialization
 * cannot compile (§19.1).
 */
function findOffenders(node: unknown, path: string, out: Offender[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => findOffenders(item, `${path}/${i}`, out));
    return;
  }
  if (node === null || typeof node !== 'object') {
    return;
  }
  const schema = node as Record<string, unknown>;
  if (
    schema.type === 'object' &&
    schema.properties === undefined &&
    schema.additionalProperties === undefined &&
    schema.$ref === undefined &&
    schema.allOf === undefined &&
    schema.oneOf === undefined &&
    schema.anyOf === undefined
  ) {
    out.push({ path, reason: 'untyped object — give the @ApiProperty an explicit `type`' });
  }
  for (const [key, value] of Object.entries(schema)) {
    if (MUST_BE_INTEGER.includes(key) && (value as Record<string, unknown>)?.type === 'number') {
      out.push({ path: `${path}/${key}`, reason: 'whole number typed as `number`, expected `integer`' });
    }
    findOffenders(value, `${path}/${key}`, out);
  }
}

describe('OpenAPI type quality (§19)', () => {
  let docs: { business: OpenAPIObject; student: OpenAPIObject };

  beforeAll(async () => {
    const app = await NestFactory.create(AppModule, { preview: true, logger: false });
    docs = buildAppDocuments(app, 'v1', 'docs');
    await app.close();
  });

  it.each(['student', 'business'] as const)(
    'has no codegen-hostile schemas in the %s document',
    (name) => {
      const out: Offender[] = [];
      findOffenders(docs[name].components?.schemas ?? {}, `#/components/schemas`, out);
      expect(out).toEqual([]);
    },
  );
});
```

- [ ] **Step 7: Run the guard test — u FAIL bo'lishi kerak**

Run: `npm run test:e2e -- openapi.e2e-spec`
Expected: **FAIL** — yuzlab offender. Bu Task 8 va 9 uchun ish ro'yxati. Chiqishni saqlang:

```bash
npm run test:e2e -- openapi.e2e-spec 2>&1 | tee /tmp/openapi-offenders.txt
```

- [ ] **Step 8: Commit**

```bash
git add src/common/swagger/openapi-document.ts src/main.ts scripts/dump-openapi.ts test/openapi.e2e-spec.ts package.json docs/api/generated
git commit -m "chore(openapi): dump both app documents to disk and add a codegen-safety guard test"
```

> Guard testi hozircha qizil. Task 8 va 9 uni yashil qiladi. Bu ataylab — TDD qizil bosqichi.

---

### Task 8: §19 — student hujjati DTO'lariga aniq tiplar

**Files:**
- Modify: `src/modules/chat/presentation/dto/*.ts`
- Modify: `src/modules/connections/presentation/dto/*.ts`
- Modify: `src/modules/notifications/presentation/dto/*.ts`
- Modify: `src/modules/discounts/presentation/dto/*.ts`
- Modify: `src/modules/profiles/presentation/dto/*.ts`
- Modify: `src/modules/geo/presentation/dto/*.ts`
- Modify: `src/modules/media/presentation/dto/*.ts`
- Modify: `src/modules/auth/presentation/dto/*.ts`
- Modify: `src/common/swagger/base-response.dto.ts`

**Interfaces:**
- Consumes: `test/openapi.e2e-spec.ts` (Task 7) — bajarilganlik mezoni
- Produces: TS imzolari o'zgarmaydi, faqat OpenAPI sxemasi.

- [ ] **Step 1: Ish ro'yxatini oling**

Run:

```bash
grep -rn "ApiProperty\(\{[^}]*nullable: true" src --include='*.ts' | grep -v "type:" | grep -v "enum:"
```

Expected: taxminan 214 satr. Bu Task 8 + Task 9 ning umumiy ro'yxati; bu taskda **faqat** yuqoridagi `Files` ro'yxatidagi kataloglarni qamrang.

- [ ] **Step 2: Qoidalarni qo'llang**

Har bir `@ApiProperty` / `@ApiPropertyOptional` uchun:

| TS tipi | Yozilishi |
|---|---|
| `string \| null` | `@ApiProperty({ type: String, nullable: true })` |
| `boolean \| null` | `@ApiProperty({ type: Boolean, nullable: true })` |
| butun son | `@ApiProperty({ type: 'integer', format: 'int32' })` |
| butun son, nullable | `@ApiProperty({ type: 'integer', format: 'int32', nullable: true })` |
| kasrli son (masofa, koordinata) | `@ApiProperty({ type: Number, format: 'double' })` |
| `Date` → ISO satr | `@ApiProperty({ type: String, format: 'date-time' })` |
| `string[]` | `@ApiProperty({ type: [String] })` |
| `number[]` (butun) | `@ApiProperty({ type: 'array', items: { type: 'integer' } })` |
| nullable DTO | `@ApiProperty({ type: () => XDto, nullable: true })` |

**Butun son sifatida qaraladiganlar:** `seq`, `unreadCount`, `myReadSeq`, `peerReadSeq`, `peerDeliveredSeq`, `page`, `size`, `total`, `count`, `courseYear`, `year`, `capacity`, `order`, `priority`, va `*Count` / `*Seq` bilan tugaydigan har qanday maydon. Pul (`price`, `finalPrice`) ham butun so'm — `integer` + `format: 'int64'`.

**Kasrli qoladiganlar:** `lat`, `lng`, `latitude`, `longitude`, `distanceKm`, `rating`, `discountValue` (foiz kasr bo'lishi mumkin — DTO izohini o'qib qaror qiling).

`docs/api/generated/student.json` dagi tegishli sxemani ochib, har bir shubhali maydonning haqiqiy semantikasini tekshiring.

- [ ] **Step 3: Guard testini ishga tushiring**

Run: `npm run test:e2e -- openapi.e2e-spec`
Expected: student hujjati bo'yicha offenderlar soni sezilarli kamayadi (business hali qizil).

Qolgan offenderlar ro'yxatidan `#/components/schemas/<Nomi>/properties/<maydon>` yo'lini o'qib, mos DTO faylini toping va tuzating. Nol bo'lguncha takrorlang.

- [ ] **Step 4: Regressiya tekshiruvi**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS. `@ApiProperty` o'zgarishlari ish vaqtidagi xatti-harakatga ta'sir qilmasligi kerak — biror test buzilsa, siz `@ApiProperty` o'rniga validatsiya dekoratorini o'zgartirib qo'ygansiz.

- [ ] **Step 5: Spec'ni qayta dump qiling va commit**

```bash
npm run openapi:dump
git add src docs/api/generated
git commit -m "fix(openapi): give every student-app DTO property an explicit OpenAPI type"
```

---

### Task 9: §19 — business hujjati DTO'lariga aniq tiplar

**Files:**
- Modify: `src/modules/business/presentation/dto/*.ts`
- Modify: `src/modules/branches/presentation/dto/*.ts`
- Modify: `src/modules/listings/presentation/dto/*.ts`
- Modify: `src/modules/catalog/presentation/dto/*.ts`
- Modify: `src/modules/redemptions/presentation/dto/*.ts`
- Modify: `src/modules/trade-centers/presentation/dto/*.ts`
- Modify: `src/modules/admin/**/dto/*.ts`

**Interfaces:**
- Consumes: Task 8 dagi bir xil qoidalar jadvali.
- Produces: guard testi ikkala hujjat uchun ham yashil.

- [ ] **Step 1: Qolgan offenderlarni oling**

Run: `npm run test:e2e -- openapi.e2e-spec 2>&1 | tee /tmp/openapi-business.txt`
Expected: faqat `business` hujjati qizil.

- [ ] **Step 2: Task 8 dagi qoidalarni qo'llang**

Aynan o'sha jadval. Bu yerda qo'shimcha e'tibor: **pul maydonlari** (`price`, `oldPrice`, `finalPrice`, `discountValue`) — Prisma'da `BigInt`, JSON'da butun son. Ular `@ApiProperty({ type: 'integer', format: 'int64' })` bo'lishi shart, aks holda generator `Double` chiqaradi va so'm qiymati aniqligini yo'qotadi.

- [ ] **Step 3: Guard testi yashil bo'lsin**

Run: `npm run test:e2e -- openapi.e2e-spec`
Expected: PASS — ikkala hujjatda ham nol offender.

- [ ] **Step 4: To'liq regressiya**

Run: `npm test && npm run test:e2e && npx tsc --noEmit && npm run lint`
Expected: hammasi PASS.

- [ ] **Step 5: Commit**

```bash
npm run openapi:dump
git add src docs/api/generated
git commit -m "fix(openapi): give every business-app DTO property an explicit OpenAPI type"
```

---

### Task 10: Hujjatlar — mobil jamoaga javob, WS protokoli, nginx

**Files:**
- Modify: `docs/architecture/chat.md`
- Create: `docs/api/mobile_questions/CHAT_MEDIA_AND_CALLS_RESPONSE.md`
- Create: `deploy/nginx/socket-io.conf`
- Create: `deploy/nginx/README.md`

**Interfaces:**
- Consumes: Task 1–9 ning barcha natijalari.

- [ ] **Step 1: WS protokolini yangilang**

`docs/architecture/chat.md` — real-time bo'limiga:

- `message:new` payload'ida `message.clientMsgId` (jo'natuvchiga haqiqiy qiymat, qabul qiluvchiga `null`);
- `message:read` va `message:delivered` endi `{ conversationId, seq, status: 'ok' }` ack qaytaradi;
- har qanday klient→server hodisasi muddati o'tgan token bilan `{ status: 'error', error: { code: 'TOKEN_EXPIRED' } }` beradi — klient tokenni yangilab qayta ulanadi;
- `typing:*` ack qaytarmaydi (ataylab).

- [ ] **Step 2: nginx konfiguratsiyasini yozing**

Create `deploy/nginx/socket-io.conf` — spec §3.9 dagi blok (`proxy_http_version 1.1`, `Upgrade`/`Connection`, `proxy_read_timeout 3600s`, `proxy_send_timeout 3600s`, `proxy_buffering off`, `X-Forwarded-*`).

Create `deploy/nginx/README.md` — nima uchun kerakligi (hozir handshake 400 qaytaradi, klient long-polling'ga tushadi), qayerga qo'yish (`server { ... }` bloki ichiga `include`), va `curl` bilan tekshirish usuli:

```bash
curl -i -o /dev/null -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  'https://<host>/socket.io/?EIO=4&transport=websocket'
```
`101` kutiladi (`400` — konfiguratsiya qo'llanmagan).

- [ ] **Step 3: Mobil jamoaga javob hujjatini yozing**

Create `docs/api/mobile_questions/CHAT_MEDIA_AND_CALLS_RESPONSE.md`. Tuzilishi:

1. **Xulosa jadvali** — §17.1–§17.8, §18, §19.1–§19.5 ning har biri: *Bajarildi / Bosqich 2 / Bosqich 3 / Bizda emas*, va qayerda.
2. **Hujjatdagi noto'g'ri taxminlar** — spec §1.1 jadvali (Redis adapteri allaqachon bor; nginx repoda emas; push provayderi stub; coturn yo'q; ffmpeg/sharp yo'q).
3. **O'zgargan kontrakt** — har biri uchun oldin/keyin JSON namunasi:
   - `MessageDto` (+`clientMsgId`, `body` endi spec'da ham `string`),
   - `MessageListDto.hasMore` semantikasi,
   - `message:new` ikki xil payload,
   - `message:read` / `message:delivered` ack,
   - WS `TOKEN_EXPIRED`.
4. **Yangi endpoint** — `POST /v1/conversations/{id}/delivered`: to'liq so'rov/javob, xato kodlari.
5. **O'zgargan xatti-harakat** — `POST /v1/reports` endi `422 MESSAGE_NOT_FOUND` qaytaradi; suhbatlar tartibi.
6. **Spec** — `docs/api/generated/student.json` endi repoda; `cleanSwagger` Gradle taskini olib tashlash mumkin; guard testi regressiyani ushlab turadi.
7. **Keyingi bosqichlar** — Bosqich 2 (§18) va Bosqich 3 (media) qamrovi, hamda qo'ng'iroq uchun bloklovchilar: real FCM/APNs provayderi, coturn serveri, ffmpeg. Har biri kimning ishi ekani aniq yozilsin.

Har bir JSON namunasi haqiqiy bo'lsin — `docs/api/generated/student.json` dan nusxa oling, qo'lda yozmang.

- [ ] **Step 4: Havolalarni tekshiring**

Run: `grep -o 'docs/[A-Za-z0-9_./-]*' docs/api/mobile_questions/CHAT_MEDIA_AND_CALLS_RESPONSE.md | sort -u | while read -r p; do [ -e "$p" ] || echo "MISSING: $p"; done`
Expected: chiqish bo'sh.

- [ ] **Step 5: Yakuniy to'liq tekshiruv**

Run: `npm test && npm run test:e2e && npx tsc --noEmit && npm run lint && npm run build`
Expected: hammasi PASS.

- [ ] **Step 6: Commit**

```bash
git add docs deploy
git commit -m "docs(chat): answer the mobile team's media/calls document and record the phase 0 contract changes"
```

---

## Self-review

**Spec qamrovi:**

| Spec bandi | Task |
|---|---|
| §3.1 (§17.1 clientMsgId) | 2 |
| §3.2 (§17.3 TOKEN_EXPIRED) | 3 |
| §3.3 (§17.4 reports) | 6 |
| §3.4 (§17.5 hasMore) | 1 |
| §3.5 (§17.6 /delivered) | 4 |
| §3.6 (§17.7 tartib) | 5 |
| §3.7 (§17.8 ack) | 3 |
| §3.8 (§19 tiplar) | 7, 8, 9 |
| §3.9 (§17.2 nginx) | 10 |
| §4 (hujjatlar) | 10 |
| §5 (qabul mezonlari 1–8) | 1–9 dagi testlar |

Bo'shliq yo'q.

**Tip izchilligi:** `MessageDto.fromDomain(message, viewerId)` — Task 2 da e'lon qilinadi, Task 2 (kontroller, gateway) va Task 8 da o'zgarmagan holda ishlatiladi. `MessageListDto.from` Task 1 da `(messages, hasMore)`, Task 2 da `(messages, hasMore, viewerId)` bo'ladi — bu evolyutsiya har ikki taskda ham aniq yozilgan. `broadcastDelivered(conversationId, byStudentId, seq)` Task 3 da yaratiladi, Task 4 da ishlatiladi — imzo bir xil.

**To'ldirilmagan joylar:** Task 7 Step 1 da `/* main.ts dagi ro'yxatni ko'chiring */` — bu ataylab: ro'yxat 25 satrlik va uni qayta yozish nusxa-xatosi xavfini tug'diradi; ko'chirish manbasi aniq ko'rsatilgan (`src/main.ts:23-51` va `107-163`).
