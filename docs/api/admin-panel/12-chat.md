# 12 — Chat (suhbatlar va xabarlar, `/v1/conversations`)

> Konvensiyalar (envelope, pagination, guard'lar, scope belgilar) — [`00-overview.md`](./00-overview.md). Bu fayl faqat shu modul mantiqini yozadi.

## 1. Maqsad

Student-to-student **1:1 chat**. Suhbat (`DIRECT`) faqat **qabul qilingan bog'lanish** (connection) bo'lgan ikki student o'rtasida ochiladi. REST — suhbat ochish/ro'yxati, xabar tarixi (`seq` cursor bo'yicha), xabar yuborish (WebSocket fallback) va o'qildi kursorini surish uchun. Real-time yetkazish gateway (WebSocket) ishi; REST orqali yuborilgan xabar ham online a'zolarga **broadcast** qilinadi.

**Faqat student** account'lari uchun (`JwtAuthGuard` + `StudentGuard`). Biznes token bilan chaqirilsa → **403** `FORBIDDEN`. Har bir endpoint **membership-scoped**: student faqat **o'zi a'zo bo'lgan** suhbatlar va xabarlarni ko'radi. `/v1` prefiksida.

**Ikki xil paginatsiya (diqqat):**
- **Suhbatlar ro'yxati** (`GET /v1/conversations`) — standart **1-based** (`page`/`size`/`total`/`hasNext`).
- **Xabar tarixi** (`GET /v1/conversations/:id/messages`) — **cursor-based** (`before`/`after` `seq` bo'yicha, `{ items, hasMore }`), **page raqami yo'q**.

---

## 2. Endpointlar

| METHOD + path | Scope | HTTP | Maqsad |
|---|---|---|---|
| `POST /v1/conversations` | 👤 Student · 🔓 Membership | 201 | Bog'langan student bilan DIRECT suhbat ochish (yoki mavjudini olish) |
| `GET /v1/conversations` | 👤 Student · 🔓 Membership | 200 | Chaqiruvchining suhbatlari ro'yxati (yangi-faol birinchi) |
| `GET /v1/conversations/:id/messages` | 👤 Student · 🔓 Membership | 200 | Xabar tarixi (cursor: `before` / `after`) |
| `POST /v1/conversations/:id/messages` | 👤 Student · 🔓 Membership | 201 | Xabar yuborish (REST fallback; online a'zolarga ham broadcast) |
| `POST /v1/conversations/:id/read` | 👤 Student · 🔓 Membership | 200 | O'qildi (read) kursorini surish |

Barchasi `JwtAuthGuard` + `StudentGuard` bilan himoyalangan.

---

## 3. `POST /v1/conversations`

Bog'langan student bilan **DIRECT** suhbat ochadi — **idempotent**: mavjud suhbat bo'lsa o'shani qaytaradi, bo'lmasa yaratadi.

**Request body (`OpenDirectDto`):**

| Maydon | Tur / validatsiya | Izoh |
|---|---|---|
| `studentId` | `string`, bo'sh emas | Suhbat ochiladigan **boshqa** studentning ID'si |

```jsonc
// so'rov body
{ "studentId": "clx9stud002" }
```

**Response `result` (`ConversationDto`):**

| Maydon | Tur | Izoh |
|---|---|---|
| `id` | `string` | Suhbat ID'si |
| `type` | `ConversationType` | v1'da doim `DIRECT` |
| `lastMessageAt` | `string \| null` | Oxirgi xabar vaqti (ISO-8601); hali xabar yo'q bo'lsa `null` |

```jsonc
{
  "success": true, "status": 201, "code": null, "message": "OK",
  "result": { "id": "clx9conv001", "type": "DIRECT", "lastMessageAt": null },
  "error": null
}
```

**LOGIKA:**
- **Self-chat taqiqlangan:** `studentId === user.id` bo'lsa → **422** `VALIDATION_ERROR`, `error.fields.studentId` = `"O'zingiz bilan suhbat ochib bo'lmaydi"`.
- **Bog'lanish shart (C1):** ikki student **connected** emas bo'lsa → **403** `NOT_CONNECTED` (`"Avval bog'lanish kerak"`).
- Aks holda deterministik `directKey` (ikki ID'dan) bo'yicha mavjud suhbat qidiriladi (`findDirect`); topilmasa yaratiladi (`createDirect`). Shu sabab takroriy chaqiruv **bir xil** suhbatni qaytaradi.

**FILTRLAR:** yo'q.

---

## 4. `GET /v1/conversations`

Chaqiruvchining suhbatlari ro'yxati (**yangi-faol birinchi**), har biri uchun boshqa a'zo, oxirgi xabar, o'qilmagan soni va o'qildi/yetkazildi kursorlari bilan.

**Request query (`ConversationsQueryDto`) — standart 1-based paginatsiya:**

| Param | Tur / validatsiya | Default | Izoh |
|---|---|---|---|
| `page` | `int` ≥ 1 | 1 | 1-based sahifa |
| `size` | `int` 1..100 | 20 | Sahifa hajmi |

**Response `result` (`ConversationPageDto`):** `{ items, page, size, total, hasNext }` — har `item` `ConversationListItemDto`:

| Maydon | Tur | Izoh |
|---|---|---|
| `conversation` | `ConversationDto` | Suhbat sarlavhasi (`id`, `type`, `lastMessageAt`) |
| `other` | `StudentSummaryDto` | Boshqa a'zo (`online` uning `lastSeenVisibility`si bilan maskalanadi) |
| `lastMessage` | `MessageDto \| null` | Oxirgi xabar; hali yo'q bo'lsa `null` |
| `unreadCount` | `number` | Boshqa a'zodan `seq > myReadSeq` bo'lgan xabarlar soni |
| `myReadSeq` | `number` | Siz qayergacha o'qigansiz (`ConversationMember.lastReadSeq`) — `unreadCount` ning persistent qarshisi |
| `peerReadSeq` | `number` | Boshqa a'zo qayergacha o'qigan; sizning `seq <= peerReadSeq` xabarlaringiz o'qilgan (✓✓) |
| `peerDeliveredSeq` | `number` | Boshqa a'zo qurilmasi qayergacha qabul qilgan; `seq <= peerDeliveredSeq` yetkazilgan (✓) |

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK",
  "result": {
    "items": [
      {
        "conversation": { "id": "clx9conv001", "type": "DIRECT", "lastMessageAt": "2026-07-28T10:30:00Z" },
        "other": {
          "id": "clx9stud002", "username": "dilnoza", "fullName": "Dilnoza Karimova",
          "avatarUrl": null, "universityId": "emis-142", "gender": "FEMALE",
          "courseYear": "2", "online": true, "lastSeenAt": null
        },
        "lastMessage": {
          "id": "clx9msg042", "conversationId": "clx9conv001", "senderId": "clx9stud002",
          "seq": 42, "type": "TEXT", "body": "Bo'ldi, rahmat!", "createdAt": "2026-07-28T10:30:00Z"
        },
        "unreadCount": 1, "myReadSeq": 41, "peerReadSeq": 40, "peerDeliveredSeq": 42
      }
    ],
    "page": 1, "size": 20, "total": 1, "hasNext": false
  },
  "error": null
}
```

**LOGIKA:** Har `other` a'zoning **live `online` holati** uning `lastSeenVisibility`si bo'yicha maskalanadi (C7): `EVERYONE` — doim, `CONNECTIONS` (default) — faqat connected bo'lsa, `NOBODY` — hech qachon (u holda `online: false`, `lastSeenAt: null`). Chat tarixi disconnect'dan keyin ham qoladi (C9), shuning uchun chat sherigi bo'lish — hozir connected ekanligini isbotlamaydi: connected to'plam alohida yuklanib, har qatorga tekshiriladi.

**FILTRLAR:** yo'q (faqat paginatsiya).

---

## 5. `GET /v1/conversations/:id/messages`

Xabar tarixi. **Cursor-based** — `page` raqami **yo'q**. Ikki rejim:
- **`before`** (yoki ikkisi ham berilmasa) — **scroll-up**: `seq < before` bo'lgan xabarlar, **yangi-birinchi** (newest-first). `before` berilmasa — eng oxirgi xabarlar.
- **`after`** — **catch-up** (C6 reconnect): `seq > after` bo'lgan xabarlar, **eski-birinchi** (oldest-first).

`after` berilgan bo'lsa catch-up rejimi ustun (u holda `before` e'tiborsiz).

**Request:** path param `id` (suhbat ID'si). Query (`HistoryQueryDto`):

| Param | Tur / validatsiya | Default | Izoh |
|---|---|---|---|
| `before` | `int` ≥ 1 | — | `seq < before` (eng oxirgisi uchun bo'sh qoldiring) |
| `after` | `int` ≥ 0 | — | Reconnect catch-up: `seq > after`, eski-birinchi (C6) |
| `size` | `int` 1..100 | 30 | Sahifa hajmi |

**Response `result` (`MessageListDto`):**

| Maydon | Tur | Izoh |
|---|---|---|
| `items` | `MessageDto[]` | `before` rejimida yangi-birinchi; `after` rejimida eski-birinchi |
| `hasMore` | `boolean` | `items.length === size` — ya'ni yana sahifa bo'lishi mumkin |

**LOGIKA:** Avval **membership** tekshiriladi — chaqiruvchi a'zo bo'lmasa → **404** `CONVERSATION_NOT_FOUND` (`"Suhbat topilmadi"`; 403 emas — mavjudligini oshkor qilmaslik uchun). Keyin `before`/`after` bo'yicha xabarlar olinadi. `hasMore` faqat qaytgan xabarlar soni **aynan `size`ga teng** bo'lganda `true` (aniq oxir emas, ehtimoliy davomi).

**FILTRLAR:** cursor (`before` / `after`) va `size`. Sana/matn bo'yicha filtr yo'q.

---

## 6. `POST /v1/conversations/:id/messages`

Chaqiruvchi a'zo bo'lgan suhbatga **matnli** xabar yuboradi. REST fallback — online a'zolarga WebSocket orqali ham **broadcast** qilinadi.

**Request:** path param `id`. Body (`SendMessageDto`):

| Maydon | Tur / validatsiya | Izoh |
|---|---|---|
| `body` | `string`, bo'sh emas, `maxLength 4000` | Xabar matni |
| `clientMsgId` | `string`, ixtiyoriy | Client generatsiya qilgan ID — qayta yuborishni **idempotent** qiladi (C6) |

```jsonc
// so'rov body
{ "body": "Salom! Chegirma haqida so'ramoqchi edim.", "clientMsgId": "c-8f14e45f" }
```

**Response `result` (`MessageDto`):** yaratilgan xabar (quyidagi "DTO'lar" bo'limiga qarang). HTTP **201**.

```jsonc
{
  "success": true, "status": 201, "code": null, "message": "OK",
  "result": {
    "id": "clx9msg043",
    "conversationId": "clx9conv001",
    "senderId": "clx9stud001",
    "seq": 43,
    "type": "TEXT",
    "body": "Salom! Chegirma haqida so'ramoqchi edim.",
    "createdAt": "2026-07-28T10:31:00Z"
  },
  "error": null
}
```

**LOGIKA (aynan shu tartibda):**
1. `body.trim()` — bo'sh bo'lsa → **422** `MESSAGE_EMPTY` (`"Xabar bo'sh bo'lishi mumkin emas"`).
2. **Membership** tekshiriladi — a'zo bo'lmasa → **404** `CONVERSATION_NOT_FOUND` (`"Suhbat topilmadi"`).
3. **Bog'lanish qayta tekshiriladi:** boshqa a'zo bilan hozir **connected emas** bo'lsa → **403** `NOT_CONNECTED` (`"Avval bog'lanish kerak"`) — tarix qolsa ham, disconnect'dan keyin yozib bo'lmaydi (C9).
4. Xabar `TEXT` sifatida qo'shiladi (`seq` — suhbat bo'yicha monoton). `clientMsgId` berilsa idempotentlik uchun ishlatiladi.
5. Yaratilgan xabar gateway orqali online a'zolarga broadcast qilinadi.

**FILTRLAR:** yo'q.

---

## 7. `POST /v1/conversations/:id/read`

Chaqiruvchining **read** kursorini oldinga suradi (o'qildi belgisini yangilaydi).

**Request:** path param `id`. Body (`MarkReadDto`):

| Maydon | Tur / validatsiya | Izoh |
|---|---|---|
| `seq` | `int` ≥ 0 | Eng yuqori o'qilgan `seq` |

**Response:** HTTP **200**, `result` — **null**.

```jsonc
{ "success": true, "status": 200, "code": null, "message": "OK", "result": null, "error": null }
```

**LOGIKA:** Avval **membership** tekshiriladi — a'zo bo'lmasa → **404** `CONVERSATION_NOT_FOUND`. Keyin chaqiruvchining `read` kursori berilgan `seq`gacha suriladi (`advanceCursor`). O'zgarish boshqa a'zoga WebSocket orqali ham broadcast qilinadi (`message:read` — bu boshqa a'zoda `peerReadSeq`ga aylanadi).

**FILTRLAR:** yo'q.

---

## 8. DTO'lar

**`MessageDto`** — wire'dagi bitta xabar:

| Maydon | Tur | Izoh |
|---|---|---|
| `id` | `string` | Xabar ID'si |
| `conversationId` | `string` | Suhbat ID'si |
| `senderId` | `string` | Yuboruvchi student ID'si |
| `seq` | `number` | Suhbat bo'yicha **monoton** ketma-ketlik (cursor va o'qildi/yetkazildi shu bo'yicha) |
| `type` | `MessageType` | v1'da doim `TEXT` |
| `body` | `string \| null` | Matn (media turlarida `null` bo'lishi mumkin — v2) |
| `createdAt` | `string` | ISO-8601 |

**`StudentSummaryDto`** — inson ko'ringan hamma joyda (search, connections, chat) bir xil shakl:

| Maydon | Tur | Izoh |
|---|---|---|
| `id` | `string` | |
| `username` | `string \| null` | |
| `fullName` | `string \| null` | |
| `avatarUrl` | `string \| null` | |
| `universityId` | `string \| null` | Free-form (app hozir `emis-<id>` yozadi, masalan `emis-142`) |
| `gender` | `Gender \| null` | `MALE` · `FEMALE` |
| `courseYear` | `CourseYear \| null` | `"1"` · `"2"` · `"3"` · `"4"` · `"MASTER"` |
| `online` | `boolean` | Live presence — target'ning `lastSeenVisibility`si bilan maskalanadi |
| `lastSeenAt` | `string \| null` | Oxirgi socket yopilgan vaqt; online yoki yashirilgan bo'lsa `null` |

---

## 9. Enumlar

| Enum | Qiymatlar | Izoh |
|---|---|---|
| `ConversationType` | `DIRECT` · `GROUP` | v1 faqat `DIRECT`; `GROUP` — v3 |
| `MessageType` | `TEXT` · `IMAGE` · `FILE` · `VOICE` · `SYSTEM` | v1 faqat `TEXT` yuboradi; qolganlari v2'da |

---

## 10. Xatolar

| HTTP | `error.code` | Qachon | `message` (o'zbekcha) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Token yo'q/yaroqsiz / muddati o'tgan | — (umumiy) |
| 403 | `FORBIDDEN` | Chaqiruvchi **student emas** (biznes token) | — (guard) |
| 403 | `NOT_CONNECTED` | Suhbat ochish yoki yozishda ikki student bog'langan emas | `Avval bog'lanish kerak` |
| 404 | `CONVERSATION_NOT_FOUND` | Chaqiruvchi suhbatga **a'zo emas** (yoki mavjud emas) | `Suhbat topilmadi` |
| 422 | `MESSAGE_EMPTY` | Yuborilgan `body` trim'dan keyin bo'sh | `Xabar bo'sh bo'lishi mumkin emas` |
| 422 | `VALIDATION_ERROR` | Self-chat (`studentId` = o'zi), yoki DTO validatsiyasi (`body` uzunligi, `seq` va h.k.) | `error.fields` bilan |

---

## 11. Admin panel eslatmasi

🔓 **Membership-scoped, faqat student.** Foydalanuvchi **faqat o'zi a'zo bo'lgan** suhbatlar va xabarlarni ko'radi — **istalgan suhbat/xabarni ko'radigan admin ko'rinishi YO'Q**. Biznes account'lar chat'ga umuman kira olmaydi.

Admin panel moderatsiya uchun (masalan, [`11-connections`](./11-connections.md)dagi **report** qilingan xabarni ko'rish/o'chirish) mavjud endpointlar **yetarli emas** — barcha REST surface membership bilan cheklangan. Backend permission bilan admin variant ochishi kerak, masalan:
- `GET /admin/conversations/:id/messages` (istalgan suhbat tarixi, moderatsiya uchun),
- `DELETE /admin/messages/:id` (report qilingan xabarni olib tashlash / takedown).

To'liq ro'yxat: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).
