# REST — uchta endpoint va o'zgargan `MessageDto`

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

### ⚠️ Ro'yxatning shakli o'zgarishi mumkin — hech narsani qotirmang (2026-08-03)

Yuqoridagi misol **bizning coturn'imiz** uchun. Backend endi ikkita TURN provayderini qo'llab-quvvatlaydi
(`ICE_PROVIDER` env), va ular boshqacha ro'yxat qaytaradi:

| | Yozuvlar | Hostlar | Portlar |
|---|---|---|---|
| coturn (`static`) | 2 (STUN + TURN) | bitta | 3478, 443 |
| Metered (`metered`) | 2 (STUN + TURN) | **ikkita** — `stun.relay.metered.ca`, `global.relay.metered.ca` | **80, 443** |

Metered javobi:

```json
{
  "iceServers": [
    { "urls": ["stun:stun.relay.metered.ca:80"] },
    {
      "urls": [
        "turn:global.relay.metered.ca:80",
        "turn:global.relay.metered.ca:80?transport=tcp",
        "turn:global.relay.metered.ca:443",
        "turns:global.relay.metered.ca:443?transport=tcp"
      ],
      "username": "…", "credential": "…"
    }
  ],
  "ttlSeconds": 3600
}
```

Shundan kelib chiqadigan **uchta qoida**:

1. **URL sonini qotirmang.** coturn'da TURN yozuvida 3 ta URL, Metered'da 4 ta. `urls` massivini
   qanday kelsa shundayligicha `RTCConfiguration` ga bering.
2. **Host nomini qotirmang va tekshirmang.** Ular deploy'ga qarab o'zgaradi.
3. **`ttlSeconds` ma'nosi provayderga qarab farq qiladi.** coturn'da bu credential'ning haqiqiy
   umri. Metered'da credential **umuman muddatsiz** — u yerda `ttlSeconds` faqat «shu vaqtdan keyin
   qayta so'ra» degan maslahat. Ikkala holatda ham xatti-harakatingiz bir xil bo'lsin: muddat
   tugashiga yaqin qayta so'rang. Metered'da bu bizga credential'ni almashtirish oynasini beradi.

Sizga qaysi provayder ishlayotganini bilish **shart emas** va biz uni aytmaymiz ham — javobni
shunchaki uzatasiz.

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

## 3. `POST /v1/calls/{callId}/stats` — YANGI (2026-08-03)

Qo'ng'iroq tugagach, **har bir ishtirokchi o'z** `RTCPeerConnection.getStats()` o'lchovini yuboradi.

| | |
|---|---|
| Auth | Bearer, STUDENT |
| Yo'l parametri | `callId` — **UUID v4** (`call:invite` javobidagi qiymat) |
| Chastota chegarasi | **daqiqasiga 30 ta**, `studentId` bo'yicha → `429 RATE_LIMITED` |
| Javob kodi | **200** (201 emas — takroran yuborish bir xil qatorni qayta yozadi) |

### Nima uchun kerak

Bu raqamlar TURN tarmoq kengligi byudjetini hal qiladi. **Yuborilmasa — bizda hech qanday ma'lumot
yo'q**, va relay ulushi haqida faqat taxmin qoladi. Buni ixtiyoriy telemetriya deb hisoblamang.

### So'rov tanasi

| Maydon | Tur | Majburiy | Chek |
|---|---|---|---|
| `candidateType` | `String` | **ha** | `HOST` · `SRFLX` · `RELAY` |
| `rttMs` | `Int?` | yo'q | 0–60 000 |
| `jitterMs` | `Int?` | yo'q | 0–10 000 |
| `packetsLost` | `Int?` | yo'q | 0–100 000 000 |
| `packetsReceived` | `Int?` | yo'q | 0–100 000 000 |
| `bytesSent` | `Long?` | yo'q | 0–1 TB |
| `bytesReceived` | `Long?` | yo'q | 0–1 TB |

⚠️ **`studentId` yubormang** — u tokendan olinadi. Yuborsangiz `forbidNonWhitelisted` uni
**422 `VALIDATION_ERROR`** bilan rad etadi.

⚠️ **`bytesSent` / `bytesReceived` — `Long`, `Int` emas.** Uzun video qo'ng'iroq Int32 ning ~2 GB
chegarasidan oshadi. Kotlin'da `Long`, JSON'da oddiy son.

### ⚠️ `candidateType` ni QAYERDAN olish — eng ko'p xato qilinadigan joy

**Tanlangan juftlikdan oling, yig'ilgan nomzodlardan emas.**

1. `getStats()` dan `RTCIceCandidatePairStats` larni oling
2. `state == "succeeded"` **va** `nominated == true` bo'lganini toping — bu **tanlangan juftlik**
3. Uning `localCandidateId` va `remoteCandidateId` si bo'yicha nomzod yozuvlarini toping
4. **Ikkalasidan bittasi** `relay` bo'lsa → `RELAY`. Aks holda `srflx` bo'lsa → `SRFLX`, yo'qsa `HOST`

`bytesSent` / `bytesReceived` ni ham **o'sha tanlangan juftlikdan** oling.

> **Nega bu muhim:** «relay nomzod yig'ildimi?» deb qarasangiz, deyarli **har** qo'ng'iroq `RELAY`
> chiqadi — relay nomzodlar doim yig'iladi, lekin ko'pincha ishlatilmaydi. U holda raqam butunlay
> yaroqsiz bo'ladi va biz noto'g'ri xulosa chiqaramiz.

### Qachon yuborish

`call:ended` kelganda yoki o'zingiz tugatganingizda — **bir marta**. Tarmoq uzilib yuborilmasa,
keyin qayta urinsangiz bo'ladi: bir xil `(callId, studentId)` uchun qator **qayta yoziladi**, ikkinchi
qator paydo bo'lmaydi.

### Javob — `CallStatDto`

```json
{
  "callId": "b3f1c2d4-5e6a-4b7c-8d9e-0f1a2b3c4d5e",
  "candidateType": "RELAY",
  "rttMs": 42, "jitterMs": 7,
  "packetsLost": 3, "packetsReceived": 9000,
  "bytesSent": 3000000000, "bytesReceived": 2500000000,
  "recordedAt": "2026-08-03T10:03:15.000Z"
}
```

### Xatolar

| HTTP | `error.code` | Qachon |
|---|---|---|
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | token yo'q / muddati o'tgan |
| 403 | `FORBIDDEN` | **siz bu qo'ng'iroqning ishtirokchisi emassiz** (404 emas — ataylab) |
| 404 | `CALL_NOT_FOUND` | bunday `callId` yo'q |
| **409** | **`INVALID_CALL_STATE`** | **qo'ng'iroq javobsiz qolgan** (`MISSED`/`DECLINED`/`CANCELED`) — media oqmagan, o'lchash uchun narsa yo'q |
| 422 | `VALIDATION_ERROR` | `candidateType` yo'q/noto'g'ri, son chekdan tashqarida, yoki ortiqcha maydon |

⚠️ **409 ni normal holat deb qabul qiling** — javobsiz qo'ng'iroqlar uchun stats **umuman
yubormang**. Agar yuborib qo'ysangiz, 409 xato emas, kutilgan javob; foydalanuvchiga ko'rsatmang.

---

## 4. `MessageDto` — yangi `call` maydoni

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
