# REST — ikkita endpoint va o'zgargan `MessageDto`

Hammasi odatdagi `BaseResponse` konvertida:

```jsonc
{ "success": true, "status": 200, "code": null, "message": "OK", "result": <payload>, "error": null }
{ "success": false, "status": 503, "code": null, "message": "Qo'ng'iroq xizmati sozlanmagan",
  "error": { "code": "NOT_IMPLEMENTED", "message": "Qo'ng'iroq xizmati sozlanmagan", "fields": {} } }
```

Ikkala endpoint ham: `Authorization: Bearer <accessToken>`, **faqat STUDENT hisobi**. Boshqa turdagi
hisob → **403 `FORBIDDEN`**. Token yo'q/yaroqsiz → **401 `UNAUTHORIZED`** / `TOKEN_EXPIRED`.

Swagger tegi: **`Calls`**.

---

## 1. `GET /v1/calls/ice-servers`

Vaqtinchalik TURN/STUN hisobi. Sizning §11.2 dagi kontrakt bilan bir xil.

| | |
|---|---|
| Auth | Bearer, STUDENT |
| So'rov parametrlari | **yo'q** |
| Chastota chegarasi | **daqiqasiga 10 ta**, `studentId` bo'yicha (IP bo'yicha emas) → `429 RATE_LIMITED` |

`studentId` **faqat tokendan** olinadi. Bu endpoint relay tarmoq kengligiga bearer capability
chiqaradi va coturn'ning kvotasi username'ga bog'langan — shuning uchun uni parametr bilan
almashtirib bo'lmaydi.

### Javob — `IceServersDto`

| Maydon | Tur | Izoh |
|---|---|---|
| `iceServers` | `IceServerDto[]` | to'g'ridan-to'g'ri `RTCConfiguration.iceServers` ga bering |
| `ttlSeconds` | `Int` | hisobning amal qilish muddati (odatiy **3600**) |

`IceServerDto`:

| Maydon | Tur | Izoh |
|---|---|---|
| `urls` | `String[]` | |
| `username` | `String?` | **STUN yozuvida umuman yo'q** (`optional`, `null` emas) |
| `credential` | `String?` | xuddi shunday |

```json
{
  "iceServers": [
    { "urls": ["stun:turn.studentclub.uz:3478"] },
    {
      "urls": [
        "turn:turn.studentclub.uz:3478?transport=udp",
        "turn:turn.studentclub.uz:3478?transport=tcp",
        "turns:turn.studentclub.uz:443?transport=tcp"
      ],
      "username": "1785312000:clx7a…",
      "credential": "b0Xk9…"
    }
  ],
  "ttlSeconds": 3600
}
```

`username = "<expiryUnixSeconds>:<studentId>"`, `credential = base64(HMAC_SHA1(sir, username))` —
coturn'ning `use-auth-secret` sxemasi, aynan siz so'raganidek.

**443/TCP (TLS)** yozuvi doim bor — universitet tarmog'ida ko'pincha faqat 443 ochiq.

Hisobni keshlang va muddati tugashiga ~5 daqiqa qolganda yangilang. U **qo'ng'iroqqa bog'lanmagan** —
qo'ng'iroq uni yangilamaydi.

### Xatolar

| HTTP | `error.code` | Qachon |
|---|---|---|
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | token yo'q / muddati o'tgan |
| 403 | `FORBIDDEN` | STUDENT hisobi emas |
| 429 | `RATE_LIMITED` | daqiqasiga 10 tadan oshdi |
| **503** | **`NOT_IMPLEMENTED`** | **qo'ng'iroqlar xususiyati o'chirilgan (`CALLS_ENABLED=false`) yoki bu deploy'da TURN sozlanmagan** |

⚠️ **503 ni qayta ishlang.** `CALLS_ENABLED=false` bo'lganda (hozirgi holat, `README.md` —
rollout darvozalari) bu javob TURN qanday sozlanganidan qat'i nazar **kutilgan holat**. Klient
qo'ng'iroq tugmasini o'chirib qo'yishi yoki «qo'ng'iroq hozircha mavjud emas» deyishi kerak — 503
ni umumiy «server ishlamayapti» xatosi sifatida ko'rsatmang. Xuddi shu bayroq `call:invite` ni ham
rad etadi (`PROTOCOL.md` §9) — ishlab turgan qo'ng'iroqqa yoki `GET /v1/calls` ga ta'sir qilmaydi.

---

## 2. `GET /v1/calls`

Qo'ng'iroqlar tarixi — alohida ekran uchun. Sizning §14.3 dagi kontrakt.

| Parametr | Tur | Odatiy | Chek |
|---|---|---|---|
| `page` | `Int?` | `1` | ≥ 1 |
| `size` | `Int?` | `20` | 1–100 |

Chekdan o'tmasa → **422 `VALIDATION_ERROR`**.

Tartib: **eng yangisi birinchi**. Filtr SQL'da bajariladi (`callerId = men OR calleeId = men`) —
boshqaning qo'ng'irog'i hech qachon yuklanmaydi.

### Javob — `CallListDto`

Loyihaning standart sahifalash konverti: `{ items, page, size, total, hasNext }`.

`CallDto`:

| Maydon | Tur | Izoh |
|---|---|---|
| `id` | `String` | **uuid v4**, 36 belgi |
| `conversationId` | `String` | cuid |
| `peerId` | `String` | **suhbatdosh** — hech qachon o'qiyotgan odamning o'zi emas |
| `direction` | `"INCOMING" \| "OUTGOING"` | **o'qiyotgan odamga nisbatan** (`CallDirectionDto`) |
| `media` | `"AUDIO" \| "VIDEO"` | `CallMediaDto` |
| `status` | `CallStatusDto` | `RINGING` `CONNECTING` `ACTIVE` `ENDED` `MISSED` `DECLINED` `FAILED` `CANCELED` |
| `startedAt` | `String` | ISO-8601 |
| `answeredAt` | `String?` | **nullable** — javob berilmagan qo'ng'iroqda `null` |
| `endedAt` | `String?` | **nullable** |
| `durationMs` | `Int` | **nullable emas** — javob berilmaganda `0` |
| `endReason` | `CallEndReasonDto?` | **nullable** — `HANGUP` `TIMEOUT` `DECLINED` `BUSY` `FAILED` `CANCELED` `UNAUTHORIZED` |
| `endedBy` | `"CALLER" \| "CALLEE" \| null` | **nullable** (`CallPartyDto`) — taymer yopgan qo'ng'iroqda `null` |

⚠️ `callerId`/`calleeId` **yo'q** — ularning o'rniga `peerId` + `direction`. Sababi
`DEVIATIONS.md` da.

⚠️ `status` da `RINGING`/`CONNECTING`/`ACTIVE` ham uchrashi mumkin (o'sha paytda jonli qo'ng'iroq).
Enum'ning sakkizala qiymatini ham qayta ishlang.

---

## 3. `MessageDto` — yangi `call` maydoni

Qo'ng'iroq tugagach server suhbatga **avtomatik** `type: "CALL"` xabar yozadi (o'z `seq` i bilan).
Sizning §14.2 dagi talab.

### `MessageTypeDto` ga `CALL` qo'shildi

```
TEXT · IMAGE · GIF · VIDEO · FILE · VOICE · STICKER · SYSTEM · CALL
```

⚠️ **Bu deserializatsiyani buzishi mumkin.** `PREREQUISITES.md` §1 — deploy'dan **oldin**
bajariladigan yagona ish.

### `MessageDto.call` — `MessageCallDto?`

`CALL` turidagi xabarda to'ldiriladi, qolganlarida **`null`**. Boshqa maydonlar bilan bir xil naqsh
(`attachment`, `sticker`, `replyTo`).

| Maydon | Tur | Izoh |
|---|---|---|
| `callId` | `String` | **uuid v4**, 36 belgi. `GET /v1/calls` dagi `CallDto.id` bilan bir xil |
| `media` | `"AUDIO" \| "VIDEO"` | |
| `status` | `CallStatusDto` | amalda faqat terminal qiymatlar: `ENDED` `MISSED` `DECLINED` `CANCELED` `FAILED` |
| `durationMs` | `Int` | **nullable emas** — javob berilmaganda `0` |
| `endReason` | `CallEndReasonDto?` | **nullable** |

`CALL` xabarning boshqa maydonlari:

| Maydon | Qiymat |
|---|---|
| `type` | `"CALL"` |
| `body` | **`null`** |
| `senderId` | **doimo `callerId`** — javobsiz qo'ng'iroqda ham chaquvchi |
| `attachment`, `sticker`, `replyTo` | `null` |
| `clientMsgId` | `null` |

```json
{
  "id": "clx…",
  "conversationId": "clx…",
  "senderId": "clx…caller",
  "seq": 412,
  "type": "CALL",
  "body": null,
  "call": {
    "callId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "media": "VIDEO",
    "status": "ENDED",
    "durationMs": 184000,
    "endReason": "HANGUP"
  },
  "createdAt": "2026-08-01T09:18:11.000Z"
}
```

### Qayerda paydo bo'ladi

- **`message:new`** hodisasi (`/chat` socket'i) — qo'ng'iroq tugashi bilan.
- **REST tarixi** — `GET /v1/conversations/{id}/messages` va barcha sahifalash yo'llari.
- **`lastMessage`** — suhbatlar ro'yxatida.

Ya'ni qo'shimcha «qo'ng'iroqlar tarixi» ekrani **shart emas** — chat lentasining o'zida ko'rinadi.
`GET /v1/calls` faqat alohida ekran xohlaganingizda.

⚠️ Tartib: `CALL` xabar `call:ended` hodisasidan **oldin** yoziladi. Ya'ni chat qatorini
qo'ng'iroq ekrani yopilishidan avval olishingiz mumkin — bu normal.

### O'qilmaganlar

**Faqat `MISSED` qo'ng'iroq o'qilmagan hisoblanadi** (§14.2). Javob berilgan, rad etilgan yoki bekor
qilingan qo'ng'iroq `unreadCount` ni ko'tarmaydi — telefonga javob berish suhbatdagi o'qilmagan
xabarlarni ham o'qilgan qilib yubormaydi.

### Push matni

| Qo'ng'iroq holati | Matn |
|---|---|
| `MISSED` | `📞 Javobsiz qo'ng'iroq` |
| `DECLINED`, `CANCELED`, yoki `durationMs == 0` | `📞 Qo'ng'iroq` |
| Qolganlari | `📞 Qo'ng'iroq · 3:04` (yoki `1:02:33`) |

### ⚠️ Klient `CALL` xabar yubora olmaydi

`message:send { type: "CALL" }` — **WS'da ham, REST'da ham** rad etiladi. REST'da:

```jsonc
{ "success": false, "status": 422, "message": "Ma'lumotlar noto'g'ri",
  "error": { "code": "VALIDATION_ERROR", "message": "Ma'lumotlar noto'g'ri",
             "fields": { "type": "Bu turdagi xabarni yuborib bo'lmaydi" } } }
```

WS ack'ida esa `fields` bo'lmaydi — faqat
`{ status: "error", error: { code: "VALIDATION_ERROR", message: "Ma'lumotlar noto'g'ri" } }`.

`SYSTEM` bilan bir xil qoida. `CALL` qatorini faqat server yozadi.
