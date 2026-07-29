# Chat Bosqich 0 — mavjud muammolarni tuzatish (dizayn)

**Sana:** 2026-07-28
**Manba:** `docs/api/mobile_questions/CHAT_MEDIA_AND_CALLS_BACKEND.md` (mobil jamoa), C qism §17 + §19
**Holat:** tasdiqlangan

## 1. Kontekst

Mobil jamoa chatga media xabar va 1:1 onlayn qo'ng'iroq qo'shishni so'radi. Hujjat **uchta mustaqil
quyi-loyiha**ni bitta faylga jamlagan:

| Qism | Nima | Bosqich |
|---|---|---|
| C (§17, §19) | Bugun ishlab turgan chatdagi xatolar va spec sifati | **Bosqich 0 — shu spec** |
| §18 | Yetishmayotgan endpointlar (o'chirish, bitta suhbat, bloklanganlar, unread-count) | Bosqich 2 |
| A (§1–§9) | Media xabarlar (rasm, stiker, GIF, ovoz, video, fayl) | Bosqich 3 |
| B (§10–§16) | WebRTC qo'ng'iroq (coturn, `/calls` namespace, VoIP push) | Keyinroq |

Har biri o'z spec → plan → implementatsiya siklini oladi. Bu spec **faqat Bosqich 0** ni qamraydi.

C qism birinchi bo'lishi shart, chunki §17.1 (`clientMsgId`) mediani bloklaydi: media xabarda matn
`null` bo'ladi, klient esa optimistik nusxani hozir **matn bo'yicha** topib o'chiryapti.

### 1.1 Hujjatdagi da'volar va repo holati

Mobil jamoaning ba'zi taxminlari bu repoga to'g'ri kelmadi — spec ularni tuzatilgan holda oladi:

| Hujjat | Repo holati |
|---|---|
| §15.4 «Socket.IO Redis adapteri majburiy» | ✅ allaqachon ulangan — `src/main.ts` (`RedisIoAdapter`) |
| §17.2 «nginx WS upgrade buzilgan» | ⚠️ nginx konfiguratsiyasi bu repoda yo'q (server tomonida). Spec tayyor konfiguratsiya faylini beradi; qo'llash — DevOps ishi |
| §13 VoIP push | ⛔ push provayderi — faqat log yozadigan stub (`DevPushProvider`). Real FCM/APNs yozilmagan |
| §11 coturn | ⛔ alohida server infratuzilmasi, kodda emas |
| A qism kutubxonalari | ⛔ `sharp`, `ffmpeg`, `bullmq`, `file-type` — hech biri o'rnatilmagan |

### 1.2 Tasdiqlangan qarorlar

1. **WS ack shakli o'zgarmaydi.** Hozirgi `{ clientMsgId, id, seq, createdAt, status: "sent" }` /
   `{ clientMsgId, status: "error", error: { code, message } }` saqlanadi. To'liq `BaseResponse`
   konvertiga o'tish `status` maydonini satrdan songa aylantirib, tarqatilgan Kotlin klientlarini
   buzardi. Hujjatning o'zi §17.3 da bu zaxira variantga ruxsat bergan: kodlar to'plami REST bilan
   bir xil bo'lsin va `TOKEN_EXPIRED` WS'da ham chiqsin.
2. **§19 tip sidirg'asi butun API bo'ylab** — student va business hujjatlari birga. Bir marta
   qilinadi; mobil jamoa `cleanSwagger` Gradle taskini butunlay olib tashlay oladi.

## 2. Qamrov

### 2.1 Ichida

§17.1 · §17.3 · §17.4 · §17.5 · §17.6 · §17.7 · §17.8 · §19.1 · §19.2 · §19.3 — va ular uchun
hujjat hamda testlar.

### 2.2 Tashqarisida

§17.2 (nginx — konfiguratsiya fayli beriladi, deploy emas) · §18 (Bosqich 2) · A qism (Bosqich 3) ·
B qism · §19.4 (yangi endpointlar sahifalashi — Bosqich 2/3 da tegishli bo'ladi) · §19.5 (`/calls`
WS hujjati — B qismda).

## 3. Dizayn

### 3.1 §17.1 — `message:new` da `clientMsgId`

**Muammo.** Server `message:new` ni jo'natuvchining o'ziga ham yuboradi, lekin `clientMsgId`siz.
Klient optimistik ("yuborilmoqda") nusxani matn bo'yicha topib o'chiradi, shuning uchun ketma-ket
ikkita bir xil xabar yuborilsa bittasi ekranda abadiy muzlab qoladi.

**Yechim.**

- `Message` domain entity'siga `clientMsgId: string | null` qo'shiladi. Maydon bazada
  (`messages.client_msg_id`) allaqachon bor va `appendMessage` uni yozadi — faqat entity'ga va
  mapper'ga chiqmagan.
- `MessageDto` ga `clientMsgId: string | null` qo'shiladi.
- `MessageDto.fromDomain(message, viewerId)` — ikkinchi argument qo'shiladi. `clientMsgId` **faqat**
  `message.senderId === viewerId` bo'lganda to'ladi, aks holda `null`.
- `ChatGateway.broadcastMessage` endi ikkita alohida payload yuboradi: jo'natuvchining shaxsiy
  xonasiga `viewerId = senderId`, qabul qiluvchinikiga `viewerId = otherId` (⇒ `null`).
- REST chaqiruvlarida ham `viewerId` — chaqiruvchi: `POST /conversations/:id/messages` javobi,
  `GET /conversations/:id/messages` tarixi va `ConversationListItemDto.lastMessage`.

Tarixda ham berilishi ataylab: reconnect'dan keyin klient o'z optimistik xabarini `message:new` ni
o'tkazib yuborgan bo'lsa, tarixdan topib moslashtira oladi.

### 3.2 §17.3 — WS'da `TOKEN_EXPIRED`

**Muammo.** Token faqat handshake'da tekshiriladi. Uzoq ochiq turgan socket'da access token muddati
tugaydi, lekin server buni sezmaydi — klient tokenni yangilash kerakligini bilmaydi.

**Yechim.**

- `verifyStudentSocket` tasdiqlangan payload'dan `exp` ni ham qaytaradi; gateway uni
  `client.data.tokenExp` ga yozadi.
- Har bir klient→server hodisasi boshida muddat tekshiriladi. O'tgan bo'lsa
  `AppException(TOKEN_EXPIRED, 401)` otiladi va mavjud `toError` uni ack'ka aylantiradi:
  `{ clientMsgId, status: "error", error: { code: "TOKEN_EXPIRED", message: "Sessiya muddati tugadi" } }`.
- Socket uzilmaydi. Klient tokenni yangilab, yangi `auth.token` bilan qayta ulanadi.
- **Ack shakli o'zgarmaydi** (1.2-qaror).

### 3.3 §17.4 — `POST /v1/reports` `messageId` ni tekshirsin

**Muammo.** Mavjud bo'lmagan yoki begona suhbatdagi `messageId` bilan shikoyat ham qabul qilinadi.
Moderatsiya navbatiga havolasiz yozuvlar tushadi.

**Yechim.**

- `connections/domain/message-directory.repository.ts` — yangi port. Bitta metod: xabarni **faqat**
  shikoyatchi o'sha suhbat a'zosi bo'lganda qaytaradi (mavjudlik + a'zolik bitta so'rovda).
- Prisma implementatsiyasi `connections/infrastructure/` da.
- `ReportsService`: `messageId` berilgan bo'lsa port chaqiriladi; `null` qaytsa —
  `AppException(MESSAGE_NOT_FOUND, 422, 'Xabar topilmadi')`.
- `ERROR_CODE` ga `MESSAGE_NOT_FOUND` qo'shiladi.
- Topilgan xabarning matni `contentSnapshot` ga yoziladi. Maydon modelda bor, lekin hozir doim
  `null` — shu sababli moderator shikoyat qilingan matnni ko'rmaydi.

> **Konvensiyadan chetlanish:** loyihada `*_NOT_FOUND` odatda 404 qaytaradi. Bu yerda 422 —
> mobil jamoaning §21 qabul mezoni aynan `422 MESSAGE_NOT_FOUND` deb yozilgani uchun. Bu ataylab
> qilingan chetlanish, kodda izoh bilan belgilanadi.

### 3.4 §17.5 — `hasMore` aniq hisoblansin

**Muammo.** `hasMore = messages.length === size` — oxirgi sahifa aynan `size` ta element qaytarsa
ham `true` bo'ladi.

**Yechim.** `size + 1` ta o'qib, ortiqchasi kesiladi: `hasMore = rows.length > size`.

Hujjat §17.5 da «eng eski seq > 1» ni taklif qilgan, lekin bu `?after=` (catch-up, eskidan yangiga)
rejimida noto'g'ri: u yerda «yana bor» degani *yangiroq* xabarlar borligini bildiradi, eng eski
`seq` ga aloqasi yo'q. `size + 1` usuli ikkala rejimda ham to'g'ri ishlaydi.

`MessageListDto.from(messages, size)` → `MessageListDto.from(messages, hasMore)`.

### 3.5 §17.6 — `POST /v1/conversations/{id}/delivered`

**Muammo.** "Yetkazildi" kursorini surishning yagona yo'li — WS. WS uzilgan bo'lsa kursor abadiy
qotib qoladi va jo'natuvchida bitta belgicha turadi.

**Yechim.** `/read` ning to'liq ko'zgusi:

- `MarkDeliveredDto { seq: int, min 0 }` (mavjud `MarkReadDto` nomi o'zgartirilmaydi — u
  generatsiya qilingan klientda bor).
- Kontroller kursorni suradi va qabul qiluvchiga `message:delivered` receipt'ini uzatadi.
- Receipt uzatish gateway'dagi `broadcastDelivered` metodiga ajratiladi va WS handler hamda REST
  kontroller ikkalasi shuni chaqiradi (mavjud `broadcastRead` bilan bir xil naqsh).

### 3.6 §17.7 — suhbatlar tartibi

**Muammo.** `ORDER BY lastMessageAt DESC` PostgreSQL'da `NULL` ni birinchi qo'yadi — bo'sh suhbatlar
ro'yxat tepasida.

**Yechim.** `lastMessageAt DESC NULLS LAST`, **ustiga barqaror tiebreaker**:
`conversation.createdAt DESC`, so'ng `conversationId DESC`.

Faqat `NULLS LAST` yetarli emas: bo'sh suhbatlarning hammasida `lastMessageAt = null`, ular orasida
tartib aniqlanmagan qoladi va ko'p sahifali ro'yxatda `OFFSET` bo'yicha element takrorlanishi yoki
tushib qolishi mumkin — bu §17.7 dagi «ko'p sahifali ro'yxatda xabarlar aralashib ketadi»
shikoyatining aynan sababi.

Implementatsiyada Prisma'ning relation orqali `{ sort: 'desc', nulls: 'last' }` sintaksisi
tekshiriladi; ishlamasa `$queryRaw` ga tushiladi.

### 3.7 §17.8 — `read` / `delivered` ack

**Yechim.** `message:read` va `message:delivered` handlerlari endi `{ conversationId, seq }`
qaytaradi. Socket.IO ack faqat klient callback bergandagina yuboriladi, shuning uchun bu **to'liq
orqaga mos** — hozirgi klient hech narsa sezmaydi.

`typing` ack qo'shilmaydi: u efemer, yo'qolsa zarari yo'q (hujjat ham «yengil talab» sifatida faqat
`read` ni so'ragan).

### 3.8 §19 — OpenAPI tip sifati

**Muammo.** NestJS `string | null` ni tipsiz `object` deb yozadi (`design:type` union uchun
`Object` bo'ladi). Generator undan `kotlin.Any?` chiqaradi va `kotlinx.serialization` uni
kompilyatsiya qila olmaydi. Repoda **214 ta** tipsiz `nullable` maydon bor.

**Yechim.**

1. **Dump skripti** — `scripts/dump-openapi.ts`: `NestFactory.create(AppModule, { preview: true })`
   bilan (provayderlar instansiyalanmaydi ⇒ **DB va Redis kerak emas**) ikkala hujjatni
   `docs/api/generated/student.json` va `business.json` ga yozadi.
   `npm run openapi:dump`. Bu mobil jamoaga spec'ning commit qilingan nusxasini ham beradi.
2. **Sidirg'a** — har bir `@ApiProperty` / `@ApiPropertyOptional` ga aniq tip:
   - `{ type: String, nullable: true }` — `object` emas (§19.1, §19.2);
   - butun sonlar `{ type: 'integer', format: 'int32' }` — `number` emas: `seq`, `unreadCount`,
     `myReadSeq`, `peerReadSeq`, `peerDeliveredSeq`, `page`, `size`, `total` va boshqalar (§19.3);
   - nullable `$ref` → `allOf` ichiga o'raladi (OpenAPI 3.0 da `$ref` yonidagi kalitlar e'tiborsiz
     qoladi).
3. **Tekshiruv (guard test)** — `test/openapi.spec.ts`: generatsiya qilingan ikkala hujjatda bitta
   ham tipsiz `{"type":"object","nullable":true}` (ya'ni `properties`/`additionalProperties`/`$ref`
   siz `object`) qolmasligini tasdiqlaydi. Bu regressiyani abadiy yopadi.

### 3.9 §17.2 — nginx (konfiguratsiya beriladi, deploy emas)

`deploy/nginx/socket-io.conf` — §15.4 dagi konfiguratsiya (`proxy_http_version 1.1`,
`Upgrade`/`Connection` sarlavhalari, `proxy_read_timeout 3600s`, `proxy_buffering off`) va uni
qo'llash bo'yicha qisqa README. Repoda nginx boshqarilmagani uchun serverga qo'llash DevOps ishi.

## 4. Hujjatlar (asosiy natija)

1. `docs/architecture/chat.md` — WS protokoli yangilanadi: `message:new` da `clientMsgId`,
   `read`/`delivered` ack'lari, `TOKEN_EXPIRED`, REST `/delivered`.
2. **`docs/api/mobile_questions/CHAT_MEDIA_AND_CALLS_RESPONSE.md`** — mobil jamoaga to'liq javob:
   - §17, §18, §19 ning **har bir bandi** bo'yicha holat: bajarildi / keyingi bosqich / bizda emas;
   - hujjatning noto'g'ri da'volari tuzatilgan holda (1.1-jadval);
   - o'zgargan va yangi endpointlarning **to'liq hujjati** — so'rov/javob namunalari, xato kodlari,
     WS payloadlari;
   - keyingi bosqichlar rejasi va ularning bog'liqliklari (real FCM/APNs, coturn, ffmpeg).

## 5. Testlar va qabul mezonlari

| # | Mezon | Test |
|---|---|---|
| 1 | Ketma-ket ikkita bir xil matnli xabar — ikkalasi ham to'g'ri ko'rinadi | gateway unit: jo'natuvchi payload'ida `clientMsgId` bor, qabul qiluvchinikida `null` |
| 2 | Muddati o'tgan token bilan `message:send` → `TOKEN_EXPIRED` | gateway unit |
| 3 | Mavjud bo'lmagan yoki begona `messageId` bilan shikoyat → `422 MESSAGE_NOT_FOUND` | `reports.service.spec` + e2e |
| 4 | Tarix oxiriga yetilganda `hasMore = false` (aynan `size` ta element bo'lsa ham) | `chat.service.spec` + e2e |
| 5 | `POST /conversations/{id}/delivered` kursorni suradi va receipt uzatadi | e2e |
| 6 | Bo'sh suhbat ro'yxat oxirida; ko'p sahifada tartib barqaror | e2e |
| 7 | `message:read` ack `{ conversationId, seq }` qaytaradi | gateway unit |
| 8 | Generatsiya qilingan ikkala hujjatda tipsiz `object,nullable` yo'q | `test/openapi.spec.ts` |

Mavjud testlar (`chat.service.spec`, `reports.service.spec`, chat e2e) o'zgargan imzolar bo'yicha
yangilanadi.

## 6. Migratsiya

**Schema o'zgarishi yo'q.** `clientMsgId` bazada allaqachon bor; `contentSnapshot` ham. Bosqich 0
butunlay kod va hujjat darajasida.

## 7. Keyingi bosqichlar (shu spec'dan tashqarida)

- **Bosqich 2** (§18): `DELETE /v1/messages/{id}` (soft-delete — `seq` butunligi saqlanishi shart) ·
  `GET /v1/conversations/{id}` · `GET /v1/blocks` · `GET /v1/conversations/unread-count`.
  Kichik migratsiya kerak.
- **Bosqich 3** (A qism): `MediaAsset` modeli, `POST /v1/media/chat-upload`, tipli xabar, stiker
  paketlari, Tenor GIF proksisi. Yangi kutubxonalar (`sharp`, `file-type`, GIF/ovoz uchun `ffmpeg`)
  va Docker image o'zgarishi. Chat fayllariga kirish huquqi (§1.3) — hozirgi local-disk storage
  bilan `GET /v1/media/{id}/raw` proksisi tabiiyroq; bu Bosqich 3 spec'ida hal qilinadi.
- **Qo'ng'iroq** (B qism): avval real FCM/APNs provayderi (hozir stub), so'ng coturn, so'ng
  `/calls` namespace.
