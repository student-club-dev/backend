# Chat Bosqich 2 — yetishmayotgan endpointlar (dizayn)

**Sana:** 2026-07-29
**Manba:** `docs/api/mobile_questions/CHAT_MEDIA_AND_CALLS_BACKEND.md` §18
**Oldingi bosqich:** `docs/superpowers/specs/2026-07-28-chat-phase0-fixes-design.md` (bajarildi)
**Holat:** tasdiqlangan

## 1. Qamrov

Mobil jamoaning §18 jadvalidan to'rtta endpoint. Ular hujjatda «shoshilinch emas» deb belgilangan,
lekin `DELETE /v1/messages/{id}` istisno: media (Bosqich 3) tarqalgach kechikmasligi shart, chunki
noto'g'ri yuborilgan rasmni olib tashlash imkoni bo'lishi kerak.

| Endpoint | Nima uchun |
|---|---|
| `DELETE /v1/messages/{id}` | Xabarni o'chirish — media uchun zarur |
| `GET /v1/conversations/{id}` | Push bosilganda butun ro'yxatni qayta yuklashning oldini oladi |
| `GET /v1/blocks` | «Bloklanganlar» ekrani — hozir bloklash bor, ro'yxat yo'q |
| `GET /v1/conversations/unread-count` | Tab badge — hozir buning uchun 50 ta suhbat yuklanadi |

**Qamrovdan tashqarida:** §18 dagi qolganlar (tahrirlash, arxivlash, qidiruv, reply, reaksiya,
forward, guruh, universitetlar katalogi) — ular mobil jamoa tomonidan ham talab qilinmagan, faqat
ro'yxatga olingan. Guruh suhbat uchun `ConversationTypeDto.GROUP` «o'lik enum» ekani to'g'ri, lekin
uni olib tashlash generatsiya qilingan klientni buzadi — alohida kelishuv talab qiladi.

## 2. Tasdiqlangan qarorlar

1. **O'chirish — soft-delete, hamma uchun, faqat jo'natuvchi, vaqt chegarasisiz.**
2. **`unread-count` ikkala sonni ham qaytaradi:** `{ total, conversations }`.

## 3. Dizayn

### 3.1 `DELETE /v1/messages/{id}`

**Nega soft-delete.** `seq` — butun chatning tartib o'qi: tarix kursori (`before`/`after`),
o'qildi/yetkazildi kursorlari va o'qilmaganlar sanog'i hammasi shunga tayanadi. Qatorni haqiqiy
o'chirish `seq` ketma-ketligida teshik qoldiradi va klientning «bu sahifada nechta xabar bor»
hisobini buzadi. Shuning uchun qator joyida qoladi, faqat mazmuni o'chadi.

**Schema.** `messages.deleted_at TIMESTAMP(3) NULL` — loyihadagi barcha vaqt ustunlari kabi
(Prisma standarti; repoda `@db.Timestamptz` umuman ishlatilmagan, shuning uchun bitta ustun uchun
uni kiritish nomuvofiqlik bo'lardi). Boshqa maydon kerak emas — kim o'chirgani `senderId` dan
ma'lum (faqat jo'natuvchi o'chira oladi).

**Ruxsat.**

| Holat | Javob |
|---|---|
| Suhbat a'zosi emas | `404 MESSAGE_NOT_FOUND` |
| A'zo, lekin jo'natuvchi emas | `403 FORBIDDEN` |
| Allaqachon o'chirilgan | `200`, o'zgarishsiz (idempotent) |

A'zo bo'lmagan uchun 404, begona xabar uchun 403 — bu `CLAUDE.md` qoidasining («begona resurs uchun
403, 404 emas») to'g'ri o'qilishi: 403 «bu resurs bor, lekin sizga tegishli emas» degani, va u faqat
resursning mavjudligini bilishga haqli odamga aytiladi. Suhbatga umuman aloqasi yo'q odam uchun
xabar id'i mavjudligini oshkor qilish — id tekshirish teshigidir.

**Ta'siri.**

- `MessageDto` ga `deletedAt: string | null` qo'shiladi (nullable, orqaga mos). O'chirilganda
  `body = null` qaytadi; `type` **o'zgarmaydi** — klient `deletedAt` bo'yicha «Xabar o'chirildi» deb
  chizadi. `type` ni `SYSTEM` ga aylantirish ma'lumot yo'qotadi va `SYSTEM` ning boshqa ma'nosi bor.
- **O'qilmaganlar sanog'idan chiqadi** — `unreadCount` va `unread-count` ikkalasi ham
  `deletedAt IS NULL` bo'yicha filtrlaydi. Aks holda o'chirilgan xabar badge'da abadiy osilib qoladi.
- Suhbatlar ro'yxatidagi `lastMessage` o'chirilgan xabarni ko'rsatishda davom etadi (`deletedAt`
  to'ldirilgan holda) — klient tombstone chizadi. Bir oldingi xabarga qaytish `lastMessageAt` ni ham
  qayta hisoblashni talab qiladi va hujjat buni so'ramagan.
- WS: yangi `message:deleted` → `{ conversationId, messageId, seq }`, ikkala a'zoga.

**Media (Bosqich 3 uchun eslatma).** O'sha bosqichda `MediaAsset` ham uzilishi va fayl bucketdan
o'chirilishi kerak bo'ladi — soft-delete faqat matnni yashiradi, faylni emas.

### 3.2 `GET /v1/conversations/{id}`

Javob — **`ConversationListItemDto`**, ya'ni ro'yxatdagi qator bilan **bir xil** shakl: suhbat,
ikkinchi a'zo (presence bilan), `lastMessage`, `unreadCount` va uchala kursor.

Bir xil shakl ataylab: push bosilganda klient aynan ro'yxatdagi qatorni qayta tiklashi kerak, va
mavjud DTO'ni qayta ishlatish yangi sxema qo'shmaydi (codegen uchun ham arzon). Presence
ko'rinuvchanligi ro'yxatdagidek qo'llaniladi (C7/C9).

A'zo bo'lmasa → `404 CONVERSATION_NOT_FOUND`.

### 3.3 `GET /v1/blocks`

`?page=1&size=20` — chat uslubidagi sahifalash (§19.4). Javob
`{ items: BlockedStudentDto[], page, size, total, hasNext }`, bunda
`BlockedStudentDto { student: StudentSummaryDto, blockedAt: date-time }` — mavjud
`ConnectionSummaryDto` ning ko'zgusi.

**Faqat men bloklaganlar.** Mavjud `blockedIds` porti ikki tomonlama ishlaydi (meni bloklaganlarni
ham qaytaradi) va u discovery filtri uchun to'g'ri — lekin bu ekran uchun emas: meni kim bloklagani
menga ko'rsatilmasligi kerak. Shuning uchun yangi port metodi: `blockerId = me` bo'yicha sahifa.

**Presence berilmaydi.** Bloklangan odamning `online`/`lastSeenAt` maydonlari maskalanadi (bloklash
ulanishni olib tashlaydi, ya'ni `CONNECTIONS` ko'rinuvchanligi allaqachon yashiradi) — Redis'dan
presence umuman so'ralmaydi.

### 3.4 `GET /v1/conversations/unread-count`

```jsonc
{ "total": 37, "conversations": 4 }
```

Ikkalasi bitta agregat so'rovdan chiqadi: a'zolik qatorlari bo'yicha, har biri uchun
`seq > lastReadSeq AND senderId <> me AND deletedAt IS NULL` bo'lgan xabarlar soni. `total` — yig'indi,
`conversations` — noldan katta bo'lganlari soni.

Implementatsiya `$queryRaw` bilan — bitta `GROUP BY` so'rovi. Prisma'ning `groupBy` si bu shaklga
(a'zolikka bog'langan `lastReadSeq` bo'yicha o'zgaruvchan chegara) tushmaydi, va suhbat boshiga
bittadan so'rov yuborish (hozirgi `listConversations` shunday qiladi) badge uchun juda qimmat.

## 4. Migratsiya

Yagona o'zgarish: `messages.deleted_at TIMESTAMPTZ NULL`.

Xavfsiz: nullable ustun qo'shish, standart qiymatsiz — Postgres'da metama'lumot o'zgarishi, jadval
qayta yozilmaydi va qulflanmaydi. Mavjud qatorlar `NULL` bo'lib qoladi, ya'ni «o'chirilmagan».

**Indeks kerak emas.** O'qilmaganlarni sanashda `deletedAt IS NULL` faqat filtr sifatida ishlaydi,
tanlov esa mavjud `@@index([conversationId, seq])` bo'yicha ketadi; xabarlarning ko'p qismi
o'chirilmagan bo'ladi, shuning uchun alohida indeks foyda bermaydi.

## 5. Testlar

| # | Mezon | Test |
|---|---|---|
| 1 | Jo'natuvchi o'z xabarini o'chiradi → `body` bo'shaydi, `seq` joyida qoladi | unit + e2e |
| 2 | Begona xabarni o'chirish → `403 FORBIDDEN` | unit + e2e |
| 3 | A'zo bo'lmagan suhbatdagi xabar → `404 MESSAGE_NOT_FOUND` | unit + e2e |
| 4 | Ikkinchi marta o'chirish → `200`, idempotent | unit |
| 5 | O'chirilgan xabar `unreadCount` dan chiqadi | e2e |
| 6 | `GET /v1/conversations/{id}` a'zoga ro'yxat qatorini qaytaradi, begonaga 404 | e2e |
| 7 | `GET /v1/blocks` faqat men bloklaganlarni beradi, meni bloklaganlarni emas | e2e |
| 8 | `GET /v1/conversations/unread-count` → `{ total, conversations }` to'g'ri | e2e |
| 9 | Yangi maydonlar spec'da aniq tiplangan | mavjud guard test (§19) |

## 6. Kontrakt o'zgarishlari (mobil jamoa uchun)

- `MessageDto` `+deletedAt` (nullable) — barcha mavjud maydonlar o'zgarmaydi.
- Yangi WS hodisasi `message:deleted`.
- To'rtta yangi endpoint; mavjud endpointlarning hech biri o'zgarmaydi.
- `CHAT_MEDIA_AND_CALLS_RESPONSE.md` yangilanadi.
