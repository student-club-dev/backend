# WebSocket protokoli — `/chat` namespace

Bu hujjat **Swagger'da yo'q** va bo'lishi ham mumkin emas: OpenAPI HTTP ni tasvirlaydi, WebSocket
hodisalarini emas. Shuning uchun `student-api.json` dan generatsiya qilingan klient real-time
qismini bilmaydi — u shu yerdan qo'lda yoziladi.

Socket.IO (Engine.IO v4), namespace **`/chat`**.

## Ulanish

```kotlin
auth = mapOf("token" to accessToken)   // handshake'da access JWT
```

Token yaroqsiz yoki talaba hisobi bo'lmasa — socket darhol uziladi.

## Klient → Server

| Hodisa | Payload | Ack |
|---|---|---|
| `message:send` | `{ conversationId, clientMsgId?, type?, body?, mediaId?, gif?, stickerId?, albumId?, replyToMessageId?, quote? }` | `{ clientMsgId, id, seq, createdAt, status: "sent" }` |
| `message:read` | `{ conversationId, seq }` | `{ conversationId, seq, status: "ok" }` |
| `message:delivered` | `{ conversationId, seq }` | `{ conversationId, seq, status: "ok" }` |
| `typing:start` / `typing:stop` | `{ conversationId }` | — (ataylab yo'q) |

### `type` berilmasa `TEXT`

Bu **ataylab**: faqat `{ body, clientMsgId }` yuboradigan eski klient hech narsa o'zgartirmasdan
ishlayveradi. Yangi maydonlarning hammasi ixtiyoriy.

### Xato ack'i

Har qanday klient → server hodisasi muvaffaqiyatsiz bo'lsa:

```jsonc
{ "clientMsgId": "…", "status": "error", "error": { "code": "…", "message": "…" } }
```

`error.code` — **REST bilan aynan bir xil** `ERROR_CODE` to'plamidan. Ya'ni klientda bitta xato yo'li
yetarli. Shakl esa REST `BaseResponse` konvertidan farq qiladi va **shundayligicha qoladi** —
`status` ni songa aylantirsak, tarqatilgan ilovalar javobni pars qila olmay qolardi.

### `TOKEN_EXPIRED`

Token handshake'da bir marta tekshiriladi, lekin socket o'z tokenidan uzoq yashaydi. Shuning uchun
**har bir klient → server hodisasi** saqlangan `exp` ni qayta tekshiradi:

```jsonc
{ "status": "error", "error": { "code": "TOKEN_EXPIRED", "message": "Sessiya muddati tugadi" } }
```

Socket **uzilmaydi**. Tokenni yangilab, yangi `auth.token` bilan qayta ulaning.

## Server → Klient

| Hodisa | Payload |
|---|---|
| `message:new` | `{ conversationId, message }` — `message` to'liq `MessageDto` |
| `message:deleted` | `{ conversationId, ids, seqs, scope, deletedBy, messageId, seq }` — auditoriya `scope` ga bog'liq, pastga qarang |
| `history:cleared` | `{ conversationId, clearedBeforeSeq, scope, by }` — auditoriya `scope` ga bog'liq |
| `conversation:deleted` | `{ conversationId, scope, by }` — suhbat ro'yxatdan olib tashlandi |
| `media:ready` | `{ mediaId, conversationId, messageId, attachment }` — transkodlash tugadi |
| `message:delivered` | `{ conversationId, seq, byStudentId }` |
| `message:read` | `{ conversationId, seq, byStudentId }` |
| `typing` | `{ conversationId, studentId, isTyping }` |
| `presence:update` | `{ studentId, online, lastSeenAt }` |

### `message:deleted` — endi bitta hodisa, butun paket uchun

50 ta xabar belgilanib o'chirilganda 50 ta hodisa emas, **bitta** hodisa keladi:

```json
{
  "conversationId": "clx…",
  "ids":   ["clx…a", "clx…b"],
  "seqs":  [141, 142],
  "scope": "EVERYONE",
  "deletedBy": "clx…user",

  "messageId": "clx…a",
  "seq": 141
}
```

**Orqaga moslik:** `messageId` va `seq` — `ids[0]` va `seqs[0]`. Ular saqlanib qoladi, shuning uchun
tarqatilgan klientlar hodisani o'zgarishsiz tushunishda davom etadi. Yangi kod `ids`/`seqs` ni o'qisin.

> Eslatma: spec'da `id` deb yozilgan edi, lekin ishlab turgan hodisada maydon nomi `messageId`. Bor
> nomni saqladik — orqaga moslik aynan shuni anglatadi.

**Auditoriya `scope` ga bog'liq:**

| `scope` | Kimga boradi |
|---|---|
| `EVERYONE` | **ikkala** a'zoning barcha qurilmalariga |
| `ME` | **faqat o'chirgan odamning** o'z qurilmalariga |

`ME` da suhbatdoshga hodisa **bormaydi** — xabar uning ekranida turibdi va turishi kerak. O'chirgan
odamning boshqa qurilmalariga esa boradi: aynan shu narsa "faqat menda o'chirish" ni qayta
o'rnatishdan va ikkinchi telefondan omon qoladigan qiladi.

### `message:send` — sitata bilan javob

`message:send` payload'iga ikkita ixtiyoriy maydon qo'shildi, REST'dagi bilan **bir xil**:

```json
{
  "conversationId": "clx…",
  "clientMsgId": "…",
  "body": "ha, kelaman",
  "replyToMessageId": "clx…A",
  "quote": { "text": "ertaga soat 10 da", "offset": 14 }
}
```

Validatsiya ikkala yo'lda bir xil — WS orqali yuborish tekshiruvni chetlab o'tish yo'li emas.
Rad etilganda odatdagi `{ status: 'error', error: { code, message } }` qaytadi; kodlar:
`REPLY_TARGET_NOT_FOUND`, `REPLY_TARGET_DELETED`, `QUOTE_NOT_FOUND`, `QUOTE_TOO_LONG`,
`QUOTE_WITHOUT_REPLY`.

Javob `message:new` da `message.replyTo` bilan keladi — REST'dagi `MessageDto` bilan aynan bir xil
shakl, ya'ni alohida ishlov kerak emas.

### `history:cleared` — tarix tozalandi

```json
{ "conversationId": "clx…", "clearedBeforeSeq": 812, "scope": "ME", "by": "clx…user" }
```

`seq <= clearedBeforeSeq` bo'lgan hamma narsani local keshdan o'chiring — server ularni boshqa
qaytarmaydi. **Suhbatning o'zi ro'yxatda qoladi**, `lastMessage` `null` bo'ladi (Telegram ham
shunday). Tozalashdan keyin kelgan xabarlar odatdagidek ko'rinadi — `seq` suv belgisidan yuqoriga
o'sishda davom etadi.

Auditoriya `message:deleted` dagidek: `ME` — faqat tozalagan odamning qurilmalariga, `EVERYONE` —
ikkala a'zoga.

> `DELETE /v1/conversations/{id}/history` da `scope` ni tushirib qoldirsangiz **`ME`** bo'ladi —
> xabar o'chirishdagidan farqli. Sabab: bu endpoint suhbatdoshning butun tarixini ham o'chira oladi,
> shuning uchun parametrsiz chaqiruv hech qachon buzuvchi variantga tushmasligi kerak.

### `conversation:deleted` — suhbat ro'yxatdan olindi

```json
{ "conversationId": "clx…", "scope": "ME", "by": "clx…user" }
```

Suhbatni ro'yxatdan olib tashlang. **Bazadan o'chirmang** — keyinroq o'sha `conversationId` bilan
`message:new` kelsa, suhbat qaytadi va faqat o'chirgandan keyingi xabarlarni olib yuradi.
`POST /v1/conversations` ham o'sha id ni qaytaradi, yangisini yaratmaydi.

Auditoriya `scope` ga bog'liq, `message:deleted` dagidek. `DELETE /v1/conversations/{id}` da
`scope` tushirilsa — **`ME`**.

### ⚠️ `message:new` va `clientMsgId` — eng muhim o'zgarish

`message.clientMsgId` **faqat jo'natuvchining o'z qurilmalariga** to'ldiriladi; qabul qiluvchiga
`null` keladi.

**Optimistik nusxani endi matn bo'yicha o'chirmang.** Sizning hozirgi kodingiz:

```sql
DELETE FROM MessageEntity WHERE conversationId = ? AND status = 'SENDING' AND body = ?
```

Bu ketma-ket ikkita bir xil matnda noto'g'ri qatorni o'chiradi — siz aynan shu xatoni xabar
qilgansiz. Media xabarda esa matn `null`, ya'ni usul umuman ishlamaydi.

To'g'ri yo'l — `clientMsgId` bo'yicha moslashtirish. U REST tarixida ham qaytariladi
(`GET /v1/conversations/{id}/messages`), shuning uchun `message:new` ni o'tkazib yuborgan
reconnect'dan keyin ham topib olasiz.

### `media:ready`

Video transkodlash tugagach keladi. Xabar `attachment.status: "PROCESSING"` bilan yuborilgan
bo'lsa, shu hodisada `attachment` ni almashtiring. Xatolik bo'lsa `status: "FAILED"` keladi —
hech qachon jim `READY` emas.

## Yuborish oqimi (media)

```
1. POST /v1/media/chat-upload   (multipart: file, kind, conversationId)  → { id: "med_…" }
2. message:send                 { type: "IMAGE", mediaId: "med_…", body: "izoh" }
```

Biriktirma **bir martalik** — bitta `mediaId` faqat bitta xabarga. Ikkinchi marta yuborsangiz
`422 MEDIA_ALREADY_USED`.

| `type` | Nima olib yuradi |
|---|---|
| `TEXT` | `body` majburiy (1–4000) |
| `IMAGE` `VIDEO` `FILE` | `mediaId` majburiy, `body` — ixtiyoriy izoh (≤1024) |
| `GIF` | `mediaId` (o'zi yuklagan) **yoki** `gif` (qidiruvdan) — ikkalasi emas |
| `VOICE` | `mediaId` majburiy, `body` **taqiqlangan** |
| `STICKER` | `stickerId` majburiy, `body` **taqiqlangan** |

`GIF`/`VOICE`/`STICKER` da izoh ataylab rad etiladi (`422`) — uni chizadigan joy yo'q, ya'ni qabul
qilsak foydalanuvchining matni jimgina yo'qolardi.

## Albom (bir nechta rasm)

Har bir rasm — **alohida xabar, alohida `seq`**, umumiy `albumId` bilan. Bitta xabarga bir nechta
fayl solinsa, o'qilmaganlar sanog'i va `?after=` sahifalash buziladi.

1. `albumId` ni klient generatsiya qiladi (ULID)
2. Har bir rasmni alohida yuklaysiz
3. Har biri uchun alohida `message:send`, **hammasida bir xil `albumId`**
4. Izoh faqat birinchisiga

Maksimum **10** (`422 ALBUM_TOO_LARGE`). Push **bitta** ketadi.

Ko'rsatishda: ketma-ket kelgan bir xil `albumId` li xabarlarni bitta to'r qilib chizing.

## Nginx haqida ⚠️

`transport=websocket` handshake'i hozir **400** qaytaradi va siz long-polling'da ishlayapsiz.
Konfiguratsiya tayyor (`deploy/nginx/socket-io.conf`), lekin **serverga qo'llanishi kerak** — bu
DevOps ishi. Tekshirish:

```bash
curl -i -o /dev/null -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  'https://<host>/socket.io/?EIO=4&transport=websocket'
```

`101` — tuzatilgan. `400` — hali qo'llanmagan.
