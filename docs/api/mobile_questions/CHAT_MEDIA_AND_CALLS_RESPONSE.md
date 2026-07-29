# Javob — Chat media + Onlayn qo'ng'iroq (backend tomondan)

`CHAT_MEDIA_AND_CALLS_BACKEND.md` ga javob. Hujjat uchun rahmat — u aniq, tekshirilgan va
bajariladigan qilib yozilgan; ayniqsa §17.1 (`clientMsgId`) diagnostikasi to'g'ri va u haqiqatan
ham media'dan **oldin** tuzatilishi kerak edi.

Bu hujjat uch narsani beradi:

1. Sizning hujjatingizdagi **noto'g'ri taxminlar** (repo holati boshqacha) — §1.
2. **Bugun bajarilgan** ishlar va o'zgargan kontrakt, to'liq endpoint hujjati bilan — §2–§4.
3. Qolgan bosqichlar va ular **nimaga bog'liqligi** — §5.

**Holat: Bosqich 0 bajarildi.** Media (A qism) va qo'ng'iroq (B qism) hali boshlanmagan —
sabablari §5 da.

---

## 1. Hujjatdagi taxminlar va repo holati

Bir necha da'vo bu repoga to'g'ri kelmadi. Bularni bilib qo'yganingiz muhim, chunki ular sizning
bosqichlar rejangizni o'zgartiradi:

| Hujjat nima deydi | Aslida |
|---|---|
| §15.4 — «API bir nechta nusxada ishlasa **Socket.IO Redis adapteri majburiy**» | ✅ **Allaqachon ulangan.** `src/main.ts` da `RedisIoAdapter` (`@socket.io/redis-adapter`). Sticky sessiya ham, `ip_hash` ham kerak emas. |
| §17.2 — «nginx WS upgrade buzilgan» | ⚠️ **To'g'ri, lekin bu repoda tuzatib bo'lmaydi** — nginx server tomonida boshqariladi. Tayyor konfiguratsiya berildi: `deploy/nginx/socket-io.conf` + tekshirish usuli bilan `README.md`. Qo'llash — DevOps ishi. |
| §13 — VoIP push (PushKit / FCM) | ⛔ Push provayderi hozir **faqat log yozadigan stub** (`DevPushProvider`). Real FCM/APNs **umuman yozilmagan** — hozir hech qanday push, hatto oddiy xabar push'i ham, haqiqiy qurilmaga bormaydi. |
| §11 — coturn | ⛔ Alohida server infratuzilmasi. Kodda emas, hali ko'tarilmagan. |
| A qism kutubxonalari | ⛔ `sharp`, `ffmpeg`, `bullmq`, `file-type` — **hech biri o'rnatilmagan**. Docker image ham o'zgarishi kerak. |
| §18 — `GET /v1/conversations/{id}` «yo'q» | ✅ To'g'ri. Qo'shimcha: `docs/architecture/chat.md` da u v1 ro'yxatida turgan edi — hujjat haqiqatga moslandi. |

Eng muhim xulosa: **§13 (qo'ng'iroq push'i) o'ylaganingizdan uzoqroq.** U `tokenType` maydonini
qo'shish emas — avval butun FCM/APNs integratsiyasi yozilishi kerak.

---

## 2. Bajarildi — C qism (§17) va spec sifati (§19)

| Band | Holat | Qayerda |
|---|---|---|
| §17.1 `message:new` da `clientMsgId` | ✅ Bajarildi | §3.1 |
| §17.2 nginx WS upgrade | ⚠️ Konfiguratsiya berildi, qo'llash sizda | `deploy/nginx/` |
| §17.3 WS xato konverti + `TOKEN_EXPIRED` | ✅ Bajarildi (konvert emas, kodlar birxilligi — §3.5) | §3.5 |
| §17.4 `reports` `messageId` tekshiruvi | ✅ Bajarildi | §3.6 |
| §17.5 `hasMore` aniq hisoblansin | ✅ Bajarildi | §3.2 |
| §17.6 `POST /conversations/{id}/delivered` | ✅ Bajarildi | §4 |
| §17.7 suhbatlar tartibi `NULLS LAST` | ✅ Bajarildi (+ barqaror tiebreaker) | §3.7 |
| §17.8 `read`/`delivered` ack | ✅ Bajarildi | §3.4 |
| §19.1 tipsiz `object,nullable` | ✅ Bajarildi — **butun API bo'ylab, 0 ta qoldi** | §3.8 |
| §19.2 `MessageDto.body` → `string` | ✅ Bajarildi | §3.8 |
| §19.3 butun sonlar `integer` | ✅ Bajarildi | §3.8 |
| §19.4 sahifalash nomuvofiqligi | ⏳ Yangi endpointlar qo'shilganda (Bosqich 2/3) | §5 |
| §19.5 WS protokoli hujjati | ✅ `docs/architecture/chat.md` yangilandi | — |
| §18 yetishmayotgan endpointlar | ⏳ Bosqich 2 | §5 |
| A qism (media) | ⏳ Bosqich 3 | §5 |
| B qism (qo'ng'iroq) | ⏳ Bloklangan | §5 |

---

## 3. O'zgargan kontrakt

> Barcha yangi maydonlar **nullable**, WS ack shakli **o'zgarmadi**, `MessageDto.body` **string
> bo'lib qoldi**. Tarqatilgan eski klientlar buzilmaydi.

### 3.1 `MessageDto` — `+clientMsgId` (§17.1)

`clientMsgId` **faqat jo'natuvchining o'z qurilmalariga** to'ldiriladi; boshqa a'zoga `null` ketadi.
Bu `message:new` da ham, REST tarixida ham, `lastMessage` da ham amal qiladi — ya'ni reconnect'dan
keyin `message:new` ni o'tkazib yuborgan bo'lsangiz, tarixdan topib moslashtira olasiz.

```jsonc
// jo'natuvchi (A) ko'radi:
{
  "id": "cmg7x...", "conversationId": "cnv_01H...", "senderId": "std_A",
  "seq": 148, "type": "TEXT", "body": "ha",
  "clientMsgId": "1993f0b2a11-8c1f-...",   // ← o'zingizniki, qaytib keldi
  "createdAt": "2026-07-28T09:14:22.531Z"
}

// qabul qiluvchi (B) ayni o'sha xabarni shunday ko'radi:
{ "...": "...", "clientMsgId": null }
```

`MessageDto` sxemasi (`docs/api/generated/student.json` dan):

```jsonc
"clientMsgId": { "type": "string", "nullable": true }
```

> Endi optimistik nusxani **matn bo'yicha o'chirmang**. Sizning `DELETE ... WHERE body = ?`
> so'rovingiz aynan shu sababdan ikkita bir xil xabarda noto'g'ri qatorni o'chirardi.

### 3.2 `MessageListDto.hasMore` — endi aniq (§17.5)

Server `size + 1` ta o'qiydi va ortiqchasini tashlaydi. Oxirgi sahifa aynan `size` ta element
qaytarsa ham `hasMore = false` keladi.

> Siz hujjatda «eng eski `seq` > 1» ni taklif qilgan edingiz. Biz boshqa yechim tanladik, chunki
> sizning variantingiz `?after=` (catch-up) rejimida noto'g'ri ishlaydi: u yerda «yana bor» degani
> *yangiroq* xabarlar borligini bildiradi va eng eski `seq` ga umuman aloqasi yo'q. `size + 1` usuli
> ikkala yo'nalishda ham to'g'ri.

### 3.3 `MessageTypeDto` — hozircha o'zgarmadi

`TEXT | IMAGE | FILE | VOICE | SYSTEM`. `GIF`, `VIDEO`, `STICKER`, `CALL` — media va qo'ng'iroq
bosqichlarida qo'shiladi. Hozir enum'da bo'lgan `IMAGE`/`FILE`/`VOICE` ni server hali **yarata
olmaydi** (yuborish DTO'sida `type` yo'q) — bu Bosqich 3 da yopiladi.

### 3.4 `message:read` / `message:delivered` endi ack qaytaradi (§17.8)

```jsonc
// klient → server: { "conversationId": "cnv_01H...", "seq": 42 }
// ack:
{ "conversationId": "cnv_01H...", "seq": 42, "status": "ok" }
```

Socket.IO ack faqat siz callback bergandagina yuboriladi — ya'ni bu **to'liq orqaga mos**, hozirgi
klient hech narsa sezmaydi. Kursor yo'lda yo'qolsa, ack kelmaydi va uni qayta yuborasiz.

`typing:start` / `typing:stop` ataylab ack qaytarmaydi: ular efemer, yo'qolsa zarari yo'q.

### 3.5 WS'da `TOKEN_EXPIRED` (§17.3)

**Ack shaklini o'zgartirmadik** — bu ataylab qilingan qaror. To'liq `BaseResponse` konvertiga
o'tish `status` maydonini `"sent"`/`"error"` (satr) dan `200`/`401` (son) ga aylantirardi va
tarqatilgan klientlaringiz javobni pars qila olmay qolardi. Sizning §17.3 dagi zaxira variantingizni
oldik: **kodlar to'plami REST bilan aynan bir xil**.

```jsonc
// har qanday klient → server hodisasi, muddati o'tgan token bilan:
{
  "clientMsgId": "1993f0b2a11-...",
  "status": "error",
  "error": { "code": "TOKEN_EXPIRED", "message": "Sessiya muddati tugadi" }
}
```

Ilgari token faqat handshake'da tekshirilardi va uzoq ochiq socket o'z tokenidan uzoq yashardi.
Endi **har bir klient → server hodisasi** saqlangan `exp` ni qayta tekshiradi.

Socket **uzilmaydi**. Siz tokenni yangilab, yangi `auth.token` bilan qayta ulanasiz.

`error.code` qiymatlari REST'dagi bir xil `ERROR_CODE` to'plamidan: `UNAUTHORIZED`,
`TOKEN_EXPIRED`, `FORBIDDEN`, `CONVERSATION_NOT_FOUND`, `NOT_CONNECTED`, `MESSAGE_EMPTY`,
`VALIDATION_ERROR`, `RATE_LIMITED`, `INTERNAL_ERROR`.

### 3.6 `POST /v1/reports` endi `messageId` ni tekshiradi (§17.4)

Xabar mavjudligi **va** shikoyatchi o'sha suhbat a'zosi ekani bitta so'rovda tekshiriladi. Ikkisi
ataylab bitta savol: begona suhbatdagi xabar mavjud bo'lmagan xabardan farq qilmasligi kerak, aks
holda endpoint boshqalarning xabar id'larini tekshirish vositasiga aylanadi.

```jsonc
// POST /v1/reports  { "messageId": "yo'q-id", "reason": "SPAM" }
{
  "success": false, "status": 422, "code": null, "message": "Xabar topilmadi",
  "result": null,
  "error": { "code": "MESSAGE_NOT_FOUND", "message": "Xabar topilmadi", "fields": {} }
}
```

Sizning qabul mezoningizdagidek **422** (loyihaning odatdagi `*_NOT_FOUND → 404` konvensiyasidan
ataylab chetlanish — kodda izoh bilan belgilangan).

Qo'shimcha: topilgan xabarning matni endi `contentSnapshot` ga yoziladi. Maydon modelda bor edi,
lekin doim `null` bo'lgani uchun moderator shikoyat qilingan matnni ko'rmasdi. Endi ko'radi — hatto
jo'natuvchi xabarni keyin o'chirsa ham.

### 3.7 Suhbatlar tartibi (§17.7)

`lastMessageAt DESC NULLS LAST`, so'ng `createdAt DESC`, so'ng `id DESC`.

Siz faqat `NULLS LAST` so'ragan edingiz, lekin u yolg'iz yetarli emas: bo'sh suhbatlarning
hammasida `lastMessageAt = null`, ular orasida tartib aniqlanmagan qoladi va `OFFSET` bo'yicha
sahifalashda element takrorlanishi yoki tushib qolishi mumkin. Bu sizning «ko'p sahifali ro'yxatda
xabarlar aralashib ketadi» shikoyatingizning aynan ikkinchi yarmi edi. Tiebreaker shuni yopadi.

Klientdagi lokal `ORDER BY lastMessageAt IS NULL, ... DESC` chorasini endi olib tashlashingiz mumkin.

### 3.8 Spec sifati (§19) — codegen endi toza

- **`{"type":"object","nullable":true}` — ikkala hujjatda ham 0 ta qoldi.** 176 ta maydonga aniq
  tip qo'yildi.
- Butun sonlar `{"type":"integer","format":"int32"}` (pul — `int64`): `seq`, `unreadCount`,
  `myReadSeq`, `peerReadSeq`, `peerDeliveredSeq`, `page`, `size`, `total`, `count` va boshqalar —
  har bir hujjatda **117 ta** maydon. Ilgari ularning hammasi `number` edi.
- `MessageDto.body` endi spec'da ham `{"type":"string","nullable":true}` — haqiqatga mos (§19.2).
- Nullable `$ref` lar `allOf` ichida.

**`cleanSwagger` Gradle taskini olib tashlashingiz mumkin.** U endi hech narsa tuzatmaydi.

Va bu regressiya qaytmasligi uchun **guard test** qo'yildi: `src/common/swagger/openapi-document.spec.ts`
har `npm test` da ikkala hujjatni generatsiya qilib, bitta ham tipsiz `object` yoki `number` deb
yozilgan butun son qolmaganini tekshiradi. Yangi DTO noto'g'ri tip bilan qo'shilsa, test qizil bo'ladi.

**Spec endi repoda:** `docs/api/generated/student.json` va `business.json`.
`npm run openapi:dump` bilan yangilanadi (DB kerak emas — Nest'ning `preview` rejimida ishlaydi).
Ilgari uni faqat ishlab turgan serverdan olish mumkin edi.

---

## 4. Yangi endpoint — `POST /v1/conversations/{id}/delivered` (§17.6)

"Yetkazildi" kursorining REST zaxirasi. `/read` ning to'liq ko'zgusi.

**So'rov**

```http
POST /v1/conversations/cnv_01H8X.../delivered
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "seq": 42 }
```

| Maydon | Tur | Majburiy | Izoh |
|---|---|---|---|
| `seq` | `integer` (int32), ≥ 0 | ✅ | Eng yuqori yetkazilgan `seq` |

**Javob `200`**

```jsonc
{ "success": true, "status": 200, "code": null, "message": "OK", "result": null, "error": null }
```

**Xatolar**

| HTTP | `error.code` | Qachon |
|---|---|---|
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Token yo'q / yaroqsiz / muddati o'tgan |
| 403 | `FORBIDDEN` | Talaba hisobi emas |
| 404 | `CONVERSATION_NOT_FOUND` | Siz bu suhbat a'zosi emassiz |
| 422 | `VALIDATION_ERROR` | `seq` yo'q yoki manfiy |

**Nima bo'ladi:** kursor suriladi (hech qachon orqaga emas) va qabul qiluvchiga `message:delivered`
receipt'i uzatiladi — WS hodisasi bilan **bir xil** kod yo'lidan, ya'ni ikkalasi ham jo'natuvchidagi
bitta belgichani ikkitaga aylantiradi.

---

## 5. Keyingi bosqichlar

### Bosqich 2 — §18 yetishmayotgan endpointlar

`DELETE /v1/messages/{id}` · `GET /v1/conversations/{id}` · `GET /v1/blocks` ·
`GET /v1/conversations/unread-count`.

`DELETE` da bitta muhim nuqta: xabar **soft-delete** qilinadi (tombstone), chunki `seq` — butun
chatning tartib o'qi. Uni haqiqiy o'chirish `seq` uzluksizligini, o'qilmaganlar sanog'ini va `before`/
`after` kursorlarini buzadi. Klient uchun bu `type` saqlanib, `body` va `attachment` bo'shashi
degani; `message:deleted` WS hodisasi ham qo'shiladi. Siz bilan kelishib olamiz.

Sahifalash — sizning §19.4 talabingizdek chat uslubida (`?page=` 1 dan, query'da).

### Bosqich 3 — A qism (media)

Rasm + stiker + GIF birinchi to'lqin. Bu bosqich **yangi bog'liqliklarni** talab qiladi:
`sharp` (EXIF tozalash, thumbnail, blurHash), `file-type` (magic bytes), GIF→MP4 uchun `ffmpeg`
Docker image'da. Video va ovoz keyingi to'lqin (transkodlash navbati kerak).

Bitta ochiq savol siz uchun: **chat fayllariga kirish huquqi** (§1.3). Hozirgi storage — lokal disk
(`LocalDiskStorage`, `/uploads` statik). Imzolangan URL bunga tabiiy tushmaydi, shuning uchun sizning
ikkinchi variantingiz — `GET /v1/media/{id}/raw` proksisi — ancha mos keladi. Bosqich 3 spec'ida
shuni taklif qilamiz.

Stikerlar bo'yicha: **Telegram stikerlarini ishlatmaslik** haqidagi ogohlantirishingiz to'g'ri va
qabul qilindi. Fluent Emoji (MIT) yo'nalishi bilan boramiz.

### B qism — qo'ng'iroq: bloklovchilar

Bu qismni hozir boshlash mumkin emas. Tartib bo'yicha:

1. **nginx WS upgrade** (§17.2) — `deploy/nginx/` da tayyor, **siz/DevOps qo'llashi kerak**.
   Busiz signalizatsiya polling ustida ishlaydi va qo'ng'iroq umuman ulanmaydi.
2. **Real FCM/APNs provayderi** — hozir yo'q (stub). Bu §13 dan **oldin** keladi va o'zi jiddiy ish:
   Firebase loyihasi, APNs sertifikatlari, provayder implementatsiyasi.
3. **coturn serveri** — 443/TLS bilan. Server infratuzilmasi, kod emas.
4. Shundan keyingina `/calls` namespace, `Call` jadvali va `GET /v1/calls/ice-servers` mantiqiy
   bo'ladi.

§11.1 dagi coturn konfiguratsiyasi va §12 dagi hodisalar jadvali juda foydali — coturn ko'tarilganda
o'shani asos qilib olamiz. `denied-peer-ip` bloklari va 443/TLS talabi ayniqsa to'g'ri.

---

## 6. Havolalar

| Nima | Qayerda |
|---|---|
| Student OpenAPI (codegen manbasi) | `docs/api/generated/student.json` |
| Business OpenAPI | `docs/api/generated/business.json` |
| Spec'ni yangilash | `npm run openapi:dump` |
| WS protokoli | `docs/architecture/chat.md` → «Real-time protocol» |
| nginx konfiguratsiyasi | `deploy/nginx/socket-io.conf`, `deploy/nginx/README.md` |
| Bosqich 0 dizayni | `docs/superpowers/specs/2026-07-28-chat-phase0-fixes-design.md` |
| Sizning hujjatingiz | `docs/api/mobile_questions/CHAT_MEDIA_AND_CALLS_BACKEND.md` |
