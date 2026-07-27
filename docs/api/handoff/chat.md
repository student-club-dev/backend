# Chat — mobil handoff

> Swagger tag: **`Chat`** · Ilova: **Student (StudentClub)**
> Holat: **✅ REST (5 endpoint) + WebSocket gateway ishlaydi**, unit + e2e (jumladan jonli WS) testlar bilan qoplangan.

1:1 yozishma. **Real vaqt — WebSocket** (`/chat`, Socket.IO); REST esa tarix, ro'yxat va
WS ishlamay qolganda zaxira yo'l.

> ⚠️ **Eshik — `Connections`.** Ikki talaba bog'lanmagan bo'lsa suhbat ochib ham,
> xabar yozib ham bo'lmaydi → **`403 NOT_CONNECTED`**. Avval
> [`connections.md`](./connections.md) ni o'qing.

| # | Endpoint / kanal | Nima uchun |
|---|---|---|
| 1 | `POST /v1/conversations` | Suhbat ochish (yoki mavjudini olish) |
| 2 | `GET /v1/conversations` | Suhbatlar ro'yxati (o'qilmaganlar soni bilan) |
| 3 | `GET /v1/conversations/{id}/messages` | Tarix (yuqoriga aylantirish) va qayta ulanish |
| 4 | `POST /v1/conversations/{id}/messages` | Xabar yuborish — **WS ishlamaganda zaxira** |
| 5 | `POST /v1/conversations/{id}/read` | O'qilgan kursorini surish |
| 6 | **WS `/chat`** | Real vaqt: yuborish, yetkazildi/o'qildi, yozmoqda, onlayn |

**Hammasi 🔴 student tokeni bilan.** Tokensiz → `401`, biznes egasi tokeni bilan → `403`.

---

## 1. Umumiy qoidalar

| Qoida | Qiymat |
|---|---|
| REST base | `{HOST}/v1` |
| WS URL | `{HOST}/chat` — **Socket.IO namespace**, `/v1` prefiksi **yo'q** |
| Header | `Authorization: Bearer <accessToken>` |
| Sana | ISO-8601 |
| Sahifalash | **`1` dan** boshlanadi, query'da (`Connections` bilan bir xil) |

### `seq` — hamma narsaning o'qi

Har bir xabar suhbat ichida **`seq`** oladi: **1 dan boshlanadi**, bittalab o'sadi, hech
qachon takrorlanmaydi va bo'shliq qoldirmaydi.

`seq` bilan qilinadigan ishlar:

| Vazifa | Qanday |
|---|---|
| Tartiblash | `seq` bo'yicha, `createdAt` bo'yicha emas |
| Tarix (yuqoriga) | `?before=<eng eski seq>` |
| Qayta ulanish (yetishib olish) | `?after=<oxirgi olingan seq>` |
| O'qildi belgisi | `read` ga **eng yuqori o'qilgan `seq`** yuboriladi |
| O'qilmaganlar | server `seq > lastReadSeq` bo'yicha sanaydi |

> **Klient oxirgi ko'rgan `seq` ni saqlab yursin** — qayta ulanishda faqat shu kerak.

---

## 2. `POST /v1/conversations` — suhbat ochish

### So'rov

```jsonc
{ "studentId": "std_ALI" }
```

### Javob — **`201 Created`**

```jsonc
{
  "result": {
    "id": "cnv_01H8X",
    "type": "DIRECT",
    "lastMessageAt": null
  }
}
```

| Maydon | Izoh |
|---|---|
| `id` | Suhbat id — qolgan hamma joyda shu ishlatiladi |
| `type` | v1 da doim **`DIRECT`** (`GROUP` — keyingi bosqich) |
| `lastMessageAt` | Oxirgi xabar vaqti. Yangi suhbatda **`null`** |

> **Idempotent.** Ikki talaba o'rtasida suhbat **faqat bitta** bo'ladi — qayta chaqirilsa
> o'sha suhbat qaytadi (baribir `201`). Klient «suhbat bormi?» deb tekshirmasdan
> to'g'ridan-to'g'ri chaqiraversa bo'ladi.

### Xatolar

| HTTP | Kod | Qachon |
|---|---|---|
| `403` | `NOT_CONNECTED` | Bu talaba bilan bog'lanmagansiz |
| `422` | `VALIDATION_ERROR` | `studentId` — o'zingiz, yoki bo'sh |

---

## 3. `GET /v1/conversations` — suhbatlar ro'yxati

```
GET /v1/conversations?page=1&size=20
```

| Query | Default | Chegara |
|---|---|---|
| `page` | `1` | ≥ 1 |
| `size` | `20` | `1 … 100` |

### Javob

```jsonc
{
  "result": {
    "items": [
      {
        "conversation": { "id": "cnv_01H8X", "type": "DIRECT",
                          "lastMessageAt": "2026-07-27T10:12:00.000Z" },
        "other": {
          "id": "std_ALI", "username": "alisher", "fullName": "Alisher Valiyev",
          "avatarUrl": null,
          "online": true,
          "lastSeenAt": "2026-07-27T09:40:00.000Z"
        },
        "lastMessage": {
          "id": "msg_01H8X", "conversationId": "cnv_01H8X", "senderId": "std_ALI",
          "seq": 42, "type": "TEXT", "body": "Salom!",
          "createdAt": "2026-07-27T10:12:00.000Z"
        },
        "unreadCount": 3
      }
    ],
    "page": 1, "size": 20, "total": 7, "hasNext": false
  }
}
```

| Maydon | Izoh |
|---|---|
| `other` | Ikkinchi tomon — **`StudentSummary`** (`Connections` dagi bilan bir xil shakl) |
| **`other.online`** | ✅ **Bu yerda haqiqiy** — Redis'dan jonli o'qiladi |
| **`other.lastSeenAt`** | ✅ **Bu yerda ham to'ldiriladi** |
| `lastMessage` | Oxirgi xabar. **Xabar yo'q bo'lsa `null`** |
| `unreadCount` | `seq > mening lastReadSeq` **va** jo'natuvchi men emas — shunday xabarlar soni |

> ⚠️ **`Connections` sectionida `online` doim `false`, `lastSeenAt` doim `null` edi.
> Chat'da ikkalasi ham haqiqiy.** Onlayn indikatorini **shu ro'yxatdan** (va WS
> `presence:update` dan) oling, `students/search` dan emas.

### Tartib

`lastMessageAt` bo'yicha **kamayish** tartibida (yangi faol suhbat tepada).

> ⚠️ **Hali xabar yozilmagan suhbat (`lastMessageAt: null`) ro'yxatning eng tepasiga
> chiqadi** — PostgreSQL `DESC` da `NULL` larni birinchi qo'yadi. Klientda yangi ochilgan
> bo'sh suhbatni alohida ishlang (masalan «Xabar yozing…» deb ko'rsating) yoki o'zingiz
> qayta saralang.

---

## 4. `GET /v1/conversations/{id}/messages` — tarix

Ikki xil rejim. **`after` berilsa u ustun** — `before` e'tiborsiz qoladi.

```
# A) Oxirgi xabarlar (chat ochilganda)
GET /v1/conversations/{id}/messages?size=30

# B) Yuqoriga aylantirish
GET /v1/conversations/{id}/messages?before=42&size=30

# C) Qayta ulanishdan keyin yetishib olish
GET /v1/conversations/{id}/messages?after=42&size=30
```

| Query | Tur | Default | Ma'nosi |
|---|---|---|---|
| `before` | int ≥ 1 | — | `seq < before` · **yangidan eskiga** |
| `after` | int ≥ 0 | — | `seq > after` · **eskidan yangiga** |
| `size` | int | **`30`** | `1 … 100` |

### Javob

```jsonc
{
  "result": {
    "items": [
      { "id": "msg_2", "conversationId": "cnv_01H8X", "senderId": "std_ALI",
        "seq": 42, "type": "TEXT", "body": "Salom!",
        "createdAt": "2026-07-27T10:12:00.000Z" },
      { "id": "msg_1", "conversationId": "cnv_01H8X", "senderId": "std_MEN",
        "seq": 41, "type": "TEXT", "body": "Assalomu alaykum",
        "createdAt": "2026-07-27T10:11:00.000Z" }
    ],
    "hasMore": true
  }
}
```

> ⚠️ **Bu yerda `page`/`size`/`total`/`hasNext` yo'q** — kursorli sahifalash.
> Faqat `items` va `hasMore`.

| Maydon | Izoh |
|---|---|
| `items` | `before` rejimida **yangidan eskiga**; `after` rejimida **eskidan yangiga** |
| `hasMore` | `items.length === size` bo'lsa `true` |

**Yuqoriga aylantirish sikli:**

```
1. GET ?size=30                    → items (yangidan eskiga), hasMore
2. hasMore === true bo'lsa:
   GET ?before=<items ning oxirgi elementining seq'i>&size=30
3. hasMore === false bo'lgunicha takrorlang
```

> ⚠️ **`hasMore` — «taxminan».** Oxirgi sahifa aynan `size` ta element bilan tugasa
> `hasMore: true` bo'lib qoladi, keyingi so'rov esa bo'sh `items` qaytaradi. Bu normal —
> bo'sh javobni «tugadi» deb qabul qiling.

> ⚠️ `after` rejimida ham `hasMore` xuddi shu formula bilan hisoblanadi, lekin ma'nosi
> teskari: «**yana yangiroq** xabarlar bor». Ya'ni `after=<items ning oxirgi seq'i>` bilan
> davom eting.

### Xato

| HTTP | Kod | Qachon |
|---|---|---|
| `404` | `CONVERSATION_NOT_FOUND` | Bunday suhbat yo'q **yoki** siz uning a'zosi emassiz |

---

## 5. `POST /v1/conversations/{id}/messages` — xabar yuborish (REST)

> **Bu — zaxira yo'l.** Odatda WS orqali yuboriladi (§8). WS ulanmagan yoki uzilgan
> bo'lsa shu ishlatiladi. REST orqali yuborilgan xabar ham onlayn a'zolarga **WS bilan
> tarqatiladi** — ya'ni ikki yo'l bir-birini almashtira oladi.

### So'rov

```jsonc
{ "body": "Salom!", "clientMsgId": "b3f1c2a0-...-uuid" }
```

| Maydon | Tur | Majburiy | Chegara |
|---|---|---|---|
| `body` | string | ✅ | ≤ **4000** belgi, bo'sh bo'lmasin |
| `clientMsgId` | string | ❌ (lekin **yuboring**) | Qayta yuborishni idempotent qiladi |

### Javob — **`201 Created`**

```jsonc
{
  "result": {
    "id": "msg_01H8X", "conversationId": "cnv_01H8X", "senderId": "std_MEN",
    "seq": 43, "type": "TEXT", "body": "Salom!",
    "createdAt": "2026-07-27T10:13:00.000Z"
  }
}
```

### 🔑 `clientMsgId` — idempotentlik (C6)

Tarmoq uzilib javob kelmasa, klient **o'sha `clientMsgId`** bilan qayta yuboradi va server
**yangi xabar yaratmaydi** — avvalgisini qaytaradi. Ikki marta ko'rinish muammosi shu bilan
hal bo'ladi.

> ⚠️ **`clientMsgId` global noyob bo'lsin (UUID).** Noyoblik `(jo'natuvchi, clientMsgId)`
> juftligi bo'yicha tekshiriladi — **suhbat hisobga olinmaydi**. Ya'ni bir xil
> `clientMsgId` ni boshqa suhbatda ishlatsangiz, server **eski suhbatdagi eski xabarni**
> qaytaradi. Har xabar uchun yangi UUID yarating.

### Xatolar

| HTTP | Kod | Qachon |
|---|---|---|
| `404` | `CONVERSATION_NOT_FOUND` | Suhbat yo'q yoki a'zo emassiz |
| `403` | `NOT_CONNECTED` | **Bog'lanish uzilgan / bloklangan** — suhbat qolgan, lekin yozib bo'lmaydi |
| `422` | `MESSAGE_EMPTY` | `body` faqat probellardan iborat |
| `422` | `VALIDATION_ERROR` | `body` yo'q yoki 4000 belgidan uzun |

> **`403 NOT_CONNECTED` har yuborishda tekshiriladi.** Bog'lanish uzilgan bo'lsa eski
> suhbat ochiq turadi (tarix o'qiladi), lekin yangi xabar yozilmaydi. Klient bu xatoni
> «Bu foydalanuvchi bilan yozisha olmaysiz» deb ko'rsatsin.

---

## 6. `POST /v1/conversations/{id}/read` — o'qildi

### So'rov

```jsonc
{ "seq": 43 }
```

`seq` — **eng yuqori o'qilgan** xabarning `seq`'i (har bir xabar uchun alohida emas).

Javob — `200`, `result: null`.

Bu chaqiruv ikkinchi tomonga WS orqali **`message:read`** hodisasini yuboradi.

| HTTP | Kod | Qachon |
|---|---|---|
| `404` | `CONVERSATION_NOT_FOUND` | Suhbat yo'q yoki a'zo emassiz |
| `422` | `VALIDATION_ERROR` | `seq` butun son emas yoki manfiy |

---

## 7. WebSocket — ulanish

```
URL:        {HOST}/chat          ← Socket.IO namespace, /v1 YO'Q
Kutubxona:  Socket.IO client
Transport:  websocket
```

### Autentifikatsiya

Token **handshake** da yuboriladi — ikki yo'ldan biri:

```js
// 1) auth obyekti (tavsiya etiladi)
io("https://api.example.com/chat", {
  transports: ["websocket"],
  auth: { token: accessToken }
});

// 2) yoki Authorization header
io("https://api.example.com/chat", {
  transports: ["websocket"],
  extraHeaders: { Authorization: `Bearer ${accessToken}` }
});
```

> ⚠️ **Token yaroqsiz / muddati o'tgan / student emas bo'lsa — soket darhol uziladi.**
> Sabab bildiruvchi hodisa **kelmaydi**, faqat `disconnect`. Klient:
> `disconnect` → access token'ni refresh qiling → qayta ulaning.

### Ulangandan keyin

- Soket avtomatik ravishda **shaxsiy xonaga** (`user:<studentId>`) qo'shiladi — hech qanday
  `join` yubormaysiz.
- Bir studentning **bir nechta qurilmasi** bir xil xonada bo'ladi → hamma qurilma bir xil
  hodisalarni oladi.
- Server bog'langanlarga **`presence:update`** yuboradi (siz onlayn bo'ldingiz).

---

## 8. WebSocket — hodisalar

### Klient → Server

| Hodisa | Payload | Izoh |
|---|---|---|
| `message:send` | `{ conversationId, clientMsgId, body }` | **Ack callback bilan** — pastda |
| `message:read` | `{ conversationId, seq }` | O'qildi kursorini surish |
| `message:delivered` | `{ conversationId, seq }` | Yetkazildi kursorini surish |
| `typing:start` | `{ conversationId }` | |
| `typing:stop` | `{ conversationId }` | |

### Server → Klient

| Hodisa | Payload |
|---|---|
| `message:new` | `{ conversationId, message: MessageDto }` |
| `message:read` | `{ conversationId, seq, byStudentId }` |
| `message:delivered` | `{ conversationId, seq, byStudentId }` |
| `typing` | `{ conversationId, studentId, isTyping }` |
| `presence:update` | `{ studentId, online, lastSeenAt }` |

> ⚠️ **`message:read` va `message:delivered` — ikki yo'nalishda bir xil nom, lekin har xil
> payload.** Klient→server da `byStudentId` **yo'q**, server→klient da **bor**. Kod yozganda
> ikkovini adashtirmang.

### `message:send` — ack (javob callback)

```js
socket.emit(
  "message:send",
  { conversationId, clientMsgId: uuid(), body: "Salom!" },
  (ack) => { /* ... */ }
);
```

**Muvaffaqiyat:**

```jsonc
{ "clientMsgId": "b3f1...", "id": "msg_01H8X", "seq": 43,
  "createdAt": "2026-07-27T10:13:00.000Z", "status": "sent" }
```

**Xato:**

```jsonc
{ "clientMsgId": "b3f1...", "status": "error",
  "error": { "code": "NOT_CONNECTED", "message": "Avval bog'lanish kerak" } }
```

> ⚠️ **WS xatolari `BaseResponse` konvertida kelmaydi** va HTTP statusi yo'q. Faqat
> `status: "error"` va `{ code, message }`. `code` — REST'dagi bilan bir xil to'plam:
> `CONVERSATION_NOT_FOUND`, `NOT_CONNECTED`, `MESSAGE_EMPTY`, `UNAUTHORIZED`,
> `INTERNAL_ERROR`.

### ⚠️ `message:new` jo'natuvchining o'ziga ham keladi

Server yangi xabarni **ikkala tomonning** shaxsiy xonasiga yuboradi. Ya'ni siz xabar
yuborsangiz:

1. `message:send` ning **ack**'ini olasiz, **va**
2. o'sha xabar `message:new` bo'lib ham qaytadi.

Bu ataylab — boshqa qurilmalaringiz ham xabarni ko'rishi kerak. **Klient `message.id`
(yoki `clientMsgId`) bo'yicha dublikatni tashlab yuborsin.**

---

## 9. Onlayn holat (presence)

- Student **kamida bitta** ochiq soketga ega bo'lsa — onlayn.
- Bir nechta qurilma **sanoq** bilan hisoblanadi: oxirgi soket uzilgandagina oflayn bo'ladi.
- Oflayn bo'lganda `lastSeenAt` saqlanadi.
- `presence:update` **faqat suhbatdoshlarga** yuboriladi (hammaga emas).
- Redis kalitining TTL'i **90 soniya** — uzilish sezilmay qolsa ham holat o'z-o'zidan
  tozalanadi.

```jsonc
// presence:update
{ "studentId": "std_ALI", "online": false, "lastSeenAt": "2026-07-27T10:20:00.000Z" }
```

`online: true` bo'lganda `lastSeenAt` — `null`.

---

## 10. Oflayn push (C8)

Qabul qiluvchining **ochiq soketi bo'lmasa**, unga push yuboriladi:

```jsonc
{
  "title": "Yangi xabar",
  "body": "<xabar matni>",
  "data": { "conversationId": "cnv_01H8X" }
}
```

- Qurilma tokeni **`Notifications`** sectionida ro'yxatdan o'tkaziladi. Token yo'q bo'lsa
  push yuborilmaydi (xato ham bermaydi).
- Push **best-effort** — yetib bormasligi xabar yozilishiga ta'sir qilmaydi.
- Klient push'dagi `data.conversationId` bo'yicha to'g'ri suhbatni ochsin.

---

## 11. Tavsiya etilgan klient oqimi

### Ilova ochilganda

```
1. GET /v1/conversations?page=1        → ro'yxat, unreadCount'lar
2. WS ulanish: io("{HOST}/chat", { auth: { token } })
3. "connect" → hodisalarga obuna
```

### Suhbat ochilganda

```
1. GET /v1/conversations/{id}/messages?size=30   → oxirgi 30 ta
2. WS: emit("message:delivered", { conversationId, seq: <eng yuqori seq> })
3. Ekranda ko'rinishi bilan:
   WS: emit("message:read", { conversationId, seq: <eng yuqori seq> })
   (yoki REST: POST /v1/conversations/{id}/read)
4. Oxirgi ko'rilgan seq'ni lokal saqlang
```

### Xabar yuborish

```
1. clientMsgId = UUID()
2. Ekranda "yuborilmoqda" holatida darhol ko'rsating
3. WS ulangan?
     ha  → emit("message:send", { conversationId, clientMsgId, body }, ack)
     yo'q → POST /v1/conversations/{id}/messages { body, clientMsgId }
4. ack.status === "sent" → seq va id ni yozib qo'ying, holatni "yuborildi" ga o'zgartiring
5. ack kelmadi / xato → o'SHA clientMsgId bilan qayta urinish (idempotent)
6. message:new kelganda id bo'yicha dublikatni tashlang
```

### Qayta ulanish

```
1. "disconnect" → qayta ulanishga urinish (Socket.IO o'zi qiladi)
2. Token muddati o'tgan bo'lsa: refresh → yangi token bilan qayta ulanish
3. "connect" → har ochiq suhbat uchun:
     GET /v1/conversations/{id}/messages?after=<oxirgi ko'rilgan seq>
   → uzilib qolgan xabarlar eskidan yangiga keladi
4. GET /v1/conversations → unreadCount'larni yangilang
```

> **Uzilib qolgan xabarlarni WS qayta yubormaydi.** Yetishib olish — faqat `?after=` orqali.

### Yozmoqda ko'rsatkichi

```
Foydalanuvchi yozishni boshladi → emit("typing:start", { conversationId })
3 soniya jim qolsa           → emit("typing:stop",  { conversationId })
Xabar yuborilganda           → emit("typing:stop",  { conversationId })

"typing" hodisasi kelganda ~5 soniyalik taymer bilan ko'rsating —
"typing:stop" kelmay qolsa indikator abadiy osilib qolmasin.
```

---

## 12. Xatolar — to'liq jadval

### REST

| HTTP | Kod | Qayerda |
|---|---|---|
| `401` | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Hamma endpoint |
| `403` | `FORBIDDEN` | Biznes egasi tokeni bilan |
| `403` | `NOT_CONNECTED` | `POST /conversations` · `POST /conversations/{id}/messages` |
| `404` | `CONVERSATION_NOT_FOUND` | `messages` (GET/POST) · `read` — suhbat yo'q **yoki a'zo emassiz** |
| `422` | `MESSAGE_EMPTY` | Bo'sh xabar |
| `422` | `VALIDATION_ERROR` | DTO buzilgan, noma'lum maydon |
| `500` | `INTERNAL_ERROR` | Kutilmagan xato |

### WebSocket

| Holat | Klient nima ko'radi |
|---|---|
| Token yo'q / yaroqsiz / student emas | **Soket uziladi**, sabab yo'q |
| `message:send` xatosi | ack: `{ status: "error", error: { code, message } }` |
| `message:read` / `delivered` / `typing` xatosi | **Hech nima** — jimgina tashlanadi |

> `message:read`, `message:delivered`, `typing:*` hodisalari **ack qaytarmaydi va xato
> bermaydi**. Ular «eng yaxshi harakat» — muhim ish (xabar yuborish) faqat
> `message:send` va REST orqali bo'ladi.

---

## 13. Enumlar

```
ConversationType  DIRECT | GROUP        ← v1 da faqat DIRECT
MessageType       TEXT | IMAGE | FILE | VOICE | SYSTEM   ← v1 da faqat TEXT yoziladi
```

WS hodisa nomlari:

```
klient → server:  message:send · message:read · message:delivered · typing:start · typing:stop
server → klient:  message:new · message:read · message:delivered · typing · presence:update
```

---

## 14. Nima qurilmagan

| Nima | Izoh |
|---|---|
| Rasm / fayl / ovozli xabar | `MessageType` da bor, lekin **faqat `TEXT`** yoziladi |
| Guruh suhbat | `ConversationType.GROUP` — keyingi bosqich |
| Xabarni o'chirish / tahrirlash | Endpoint yo'q |
| Xabar qidiruv | Endpoint yo'q |
| Suhbatni o'chirish / arxivlash | Endpoint yo'q |
| Ovozsiz qilish (mute) | Bazada `mutedUntil` bor, API yo'q |
| Xabarga reaksiya, javob (reply) | Yo'q |
| Yetkazildi kursorini o'qish | `message:delivered` yoziladi, lekin uni **qaytaruvchi endpoint yo'q** — faqat WS hodisasi orqali bilinadi |

---

## 15. Manba fayllar

**Mobil dev'ga beriladigan:**

| Fayl | Nima uchun |
|---|---|
| **shu fayl** | Section'ning to'liq tavsifi (REST + WS protokol) |
| [`connections.md`](./connections.md) | Chat'ning eshigi — avval shu ishlashi kerak |
| `GET /docs/student/json` | OpenAPI JSON — **faqat REST**. WS protokoli Swagger'da yo'q |
| `docs/architecture/chat.md` | Kelishilgan spetsifikatsiya — C1…C8 qarorlari |

> ⚠️ **WebSocket protokoli Swagger'da yo'q** — OpenAPI WS'ni tasvirlamaydi. WS bo'yicha
> yagona manba — **shu faylning §7–§9 bo'limlari**.

**Backend tomondagi kod (ma'lumot uchun):**

| Qatlam | Fayl |
|---|---|
| REST controller | `src/modules/chat/presentation/conversations.controller.ts` |
| WS gateway | `src/modules/chat/chat.gateway.ts` |
| WS hodisa nomlari | `src/modules/chat/application/chat-events.ts` |
| WS auth | `src/modules/chat/infrastructure/ws-jwt.ts` |
| DTO | `src/modules/chat/presentation/dto/` — `conversation.dto.ts`, `message.dto.ts`, `requests.dto.ts`, `queries.dto.ts` |
| Service | `src/modules/chat/application/chat.service.ts` |
| Repository | `src/modules/chat/infrastructure/` — `chat.prisma.repository.ts`, `presence.redis.repository.ts` |
| WS masshtablash | `src/infrastructure/websocket/redis-io.adapter.ts` (Redis adapter — bir nechta instans) |
| Unit testlar | `chat.service.spec.ts` |
| E2E testlar | `test/chat.e2e-spec.ts` (REST) · `test/chat-ws.e2e-spec.ts` (**jonli WS**) |
