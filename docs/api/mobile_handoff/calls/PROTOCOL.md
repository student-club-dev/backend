# `/calls` — signalizatsiya protokoli

Socket.IO (Engine.IO v4), namespace **`/calls`**. `/chat` dan **alohida** — SDP hech qachon chat
socket'iga tushmaydi.

Bu hujjat **OpenAPI'da yo'q**: OpenAPI HTTP ni tasvirlaydi, WebSocket hodisalarini emas.
Generatsiya qilingan klient bu qismni bilmaydi — qo'lda yoziladi.

## 1. Ulanish

```kotlin
// handshake
auth = mapOf("token" to accessToken)
// muqobil: Authorization: Bearer <accessToken> sarlavhasi
```

Token yaroqsiz, muddati o'tgan yoki hisob **STUDENT** emas → socket **darhol uziladi**, hech qanday
xato hodisasi yuborilmaydi. Muvaffaqiyatli handshake'da socket foydalanuvchining shaxsiy xonasiga
qo'shiladi — bitta odamning **barcha qurilmalari** bitta xonada.

## 2. Ack shakli

Har bir klient → server hodisasi ack qaytaradi.

```jsonc
// muvaffaqiyat — maydonlar hodisaga qarab (§4)
{ "status": "ok", "callId": "3f4a…", "relayOnly": true }

// xato — har doim aynan shu shakl
{ "status": "error", "error": { "code": "CALL_BUSY", "message": "Foydalanuvchi hozir band" } }
```

`error.code` — REST bilan **aynan bir xil** `ERROR_CODE` to'plamidan (§9), `error.message` —
foydalanuvchiga ko'rsatiladigan o'zbekcha matn. Bu `/chat` dagi bilan bir xil naqsh; REST'ning
`BaseResponse` konvertidan farq qiladi va shundayligicha qoladi.

## 3. Qoida 0 — har hodisada ishtirokchi tekshiruvi

Har bir klient → server hodisasi avval qo'ng'iroqni topadi va yuboruvchi uning **ikki
ishtirokchisidan biri** ekanini tekshiradi. `callId` — identifikator, kalit emas.

Ishtirokchi bo'lmagan → **`FORBIDDEN`** (403), `CALL_NOT_FOUND` emas. Bundan tashqari rol matritsasi:

| Hodisa | Kim yubora oladi |
|---|---|
| `call:accept` | faqat **chaqirilgan** (callee) |
| `call:decline` | faqat **chaqirilgan** |
| `call:cancel` | faqat **chaquvchi** (caller) |
| qolgan hammasi | ikkala ishtirokchi ham |

Noto'g'ri rol ham **`FORBIDDEN`** beradi.

⚠️ `call:invite` da **`conversationId` yubormang** — server uni (caller, callee) juftligidan o'zi
topadi. Yuborilsa payload validatsiyadan o'tmaydi (§7).

## 4. Hodisalar (17 ta)

Sizning §12.1 dagi 15 tangiz + **`call:connected`** + **`call:auth`**. Ikkitasining sababi
`DEVIATIONS.md` va `PREREQUISITES.md` da.

### 4.1 Klient → Server (holat o'zgartiruvchi)

| Hodisa | Payload | Ack (muvaffaqiyat) |
|---|---|---|
| `call:invite` | `{ calleeId: String, media: "AUDIO"\|"VIDEO", sdp: String }` | `{ status:"ok", callId: String, expiresAt: String, relayOnly: Boolean }` |
| `call:accept` | `{ callId: String, sdp: String }` | `{ status:"ok", callId: String, relayOnly: Boolean }` |
| `call:connected` | `{ callId: String }` | `{ status:"ok", callId: String }` |
| `call:decline` | `{ callId: String, reason: "DECLINED"\|"BUSY" }` | `{ status:"ok", callId: String }` |
| `call:cancel` | `{ callId: String }` | `{ status:"ok", callId: String }` |
| `call:end` | `{ callId: String }` | `{ status:"ok", callId: String }` |
| `call:auth` | `{ token: String }` | `{ status:"ok", expiresAt: String }` |

- `callId` — **uuid v4, 36 belgi** (`3fa85f64-5717-4562-b3fc-2c963f66afa6`). ULID emas.
- `calleeId` — talaba id'si, cuid (20–32 belgi).
- `expiresAt` — **ISO-8601 UTC** (`"2026-08-01T09:15:07.000Z"`). `call:invite` da bu jiringlash
  muddati (= `startedAt + 45s`), `call:auth` da tokenning yangi `exp` i.

### 4.2 Klient → Server (o'zgarishsiz uzatiladi)

Server bu payload'larni **o'qimaydi va o'zgartirmaydi** — bir baytiga tegmay ikkinchi ishtirokchiga
yuboradi. Aynan shu narsa sizning Opus (`useinbandfec`, `usedtx`) va H.264 sozlamalaringiz
saqlanishining yagona kafolati. Ular hech qanday log darajasida yozilmaydi: SDP va ICE nomzodi
foydalanuvchining uy IP manzilini olib yuradi.

| Hodisa | Payload | Ack | Peer'ga nima boradi |
|---|---|---|---|
| `call:ringing` | `{ callId: String }` | `{ status:"ok" }` | `call:ringing { callId }` |
| `call:ice` | `{ callId: String, candidate: { candidate: String, sdpMid: String, sdpMLineIndex: Int } }` | `{ status:"ok" }` | `call:ice { callId, candidate }` — o'zgarishsiz |
| `call:renegotiate` | `{ callId: String, sdp: String }` | `{ status:"ok" }` | `call:renegotiate { callId, sdp }` — o'zgarishsiz |
| `call:media-state` | `{ callId: String, audioEnabled: Boolean, videoEnabled: Boolean }` | `{ status:"ok" }` | `call:media-state { callId, audioEnabled, videoEnabled }` |

⚠️ Bu to'rttasining ack'ida **`callId` yo'q** — faqat `{ status: "ok" }`.

⚠️ **Yagona chetlashish: `call:ice`, `relayOnly: true` bo'lganda.** Server nomzod qatoridagi `typ`
tokenini o'qib, faqat `typ relay` bo'lganini oldinga uzatadi — qolgani (va tahlil qilib bo'lmaydigan
qator) hech qayerga yubormay tashlab yuboriladi (ack baribir `{ status: "ok" }`). Bu **filtr**, qayta
yozish emas: forward qilingan nomzod hech qachon o'zgartirilmaydi. To'liq qoida: §11.

⚠️ **`call:ringing` — endi klient yuboradigan hodisa.** Sizning spec'ingizda u faqat S → K edi.
Amalda: **chaqirilgan** `call:incoming` ni olgach `call:ringing { callId }` yuboradi, server esa uni
chaquvchiga uzatadi. Chaquvchi tomonda hodisa nomi va payload'i o'zgarmagan. Buni yuborish ikki
foydali ish qiladi: chaquvchiga «telefon jiringlayapti» deyiladi **va** chaqirilganning shu
qo'ng'iroqdagi mavjudligi qayd etiladi (§6, uzilish oynasi).

### 4.3 Server → Klient (ack yo'q — bular bildirishnoma)

| Hodisa | Payload | Kimga |
|---|---|---|
| `call:incoming` | `{ callId: String, conversationId: String, caller: CallerSummary, media: "AUDIO"\|"VIDEO", sdp: String, relayOnly: Boolean, expiresAt: String }` | chaqirilganning **barcha** qurilmalari |
| `call:accepted` | `{ callId: String, sdp: String, relayOnly: Boolean }` | chaquvchi |
| `call:taken` | `{ callId: String }` | javob bergan/rad etgan odamning **boshqa** qurilmalari |
| `call:declined` | `{ callId: String, reason: "DECLINED"\|"BUSY" }` | chaquvchi |
| `call:canceled` | `{ callId: String }` | chaqirilgan |
| `call:ended` | `{ callId: String, reason: CallEndReason, durationMs: Int, endedBy: "CALLER"\|"CALLEE"\|null }` | **ikkala** ishtirokchi |

`CallerSummary`:

| Maydon | Tur | Izoh |
|---|---|---|
| `id` | `String` | talaba id (cuid) |
| `fullName` | `String` | `firstName + " " + lastName`. Null emas, lekin ikkalasi ham bo'sh bo'lsa **bo'sh satr** bo'lishi mumkin — bunday holatda `username` ga tushing |
| `username` | `String?` | **nullable** |
| `avatarUrl` | `String?` | **nullable** |

`CallEndReason`: `HANGUP` · `TIMEOUT` · `DECLINED` · `BUSY` · `FAILED` · `CANCELED` · `UNAUTHORIZED`.

`endedBy` **nullable**: taymer bilan yopilgan qo'ng'iroqda (jiringlash tugadi, ulanmadi, 4 soat,
uzilish) va glare'da hech kim tugatmagan — `null` keladi.

`durationMs` — doimo son. Javob berilmagan qo'ng'iroqda `0`, `null` emas.

### 4.4 Qaysi yopilish qaysi hodisa bilan keladi

⚠️ **Faqat `call:ended` ni kutib turgan klient rad etilgandan keyin jiringlash ekranida qotib
qoladi.** Uchalasini ham qayta ishlang.

| Yopilish sababi | Hodisa | Kimga |
|---|---|---|
| Ikkinchi tomon `call:end` bosdi | `call:ended` (`reason: HANGUP`) | ikkalasiga (**shu jumladan tugatgan qurilmaning o'ziga ham** — ack'dan tashqari) |
| Jiringlash 45 s tugadi | `call:ended` (`reason: TIMEOUT`) | ikkalasiga |
| Accept'dan keyin 30 s ulanmadi | `call:ended` (`reason: FAILED`) | ikkalasiga |
| 4 soatlik chegara | `call:ended` (`reason: TIMEOUT`) | ikkalasiga |
| Socket 20 s qaytmadi | `call:ended` (`reason: FAILED`) | ikkalasiga |
| Glare'da yutqazdi | `call:ended` (`reason: BUSY`) | o'sha qo'ng'iroqning ikkala tomoniga |
| Chaqirilgan rad etdi | **`call:declined`** | chaquvchiga |
| Chaquvchi bekor qildi | **`call:canceled`** | chaqirilganga |
| Boshqa qurilmangiz javob berdi/rad etdi | **`call:taken`** | o'zingizning boshqa qurilmalaringizga |

Rad etgan/bekor qilgan qurilmaning o'zi faqat ack oladi — `call:declined`/`call:canceled`
o'ziga qaytmaydi.

## 5. Holat mashinasi

```
call:invite ──► RINGING ── call:accept ──► CONNECTING ── call:connected ──► ACTIVE
```

| Boshlang'ich | Sabab | Yakuniy | Klient nima oladi |
|---|---|---|---|
| — | `call:invite` | `RINGING` | ack; peer'ga `call:incoming` |
| `RINGING` | `call:accept` (chaqirilgan) | `CONNECTING` | ack; chaquvchiga `call:accepted` |
| `RINGING` | `call:decline` (chaqirilgan) | `DECLINED` | chaquvchiga `call:declined` |
| `RINGING` | `call:cancel` (chaquvchi) | `CANCELED` | chaqirilganga `call:canceled` |
| `RINGING` | 45 s | `MISSED` | ikkalasiga `call:ended { TIMEOUT }` |
| `RINGING` | glare'da yutqazdi | `DECLINED` | ikkalasiga `call:ended { BUSY }` |
| `CONNECTING` | `call:connected` (istalgan tomon) | `ACTIVE` | ack (ikkinchisi no-op) |
| `CONNECTING` | 30 s | `FAILED` | ikkalasiga `call:ended { FAILED }` |
| `CONNECTING` | `call:end` | `ENDED` | ikkalasiga `call:ended { HANGUP }` |
| `ACTIVE` | `call:end` | `ENDED` | ikkalasiga `call:ended { HANGUP }` |
| `ACTIVE` | 4 soat | `ENDED` | ikkalasiga `call:ended { TIMEOUT }` |
| `RINGING` / `CONNECTING` / `ACTIVE` | 20 s uzilish | `FAILED` | ikkalasiga `call:ended { FAILED }` |

`RINGING`, `CONNECTING`, `ACTIVE` — yagona terminal bo'lmagan holatlar. Terminal holatdan chiqish
yo'li yo'q.

### ⚠️ `ok` ack — «bajarildi» degani emas

Tugatuvchi hodisa joriy holatga mos kelmasa, server uni **jim `{ status: "ok" }`** bilan qabul
qiladi va **hech narsa qilmaydi**. Bu ataylab: yo'qolgan ack tufayli takrorlangan `call:end` xato
bermasligi kerak.

| Hodisa | Qaysi holatdan ishlaydi | Boshqa holatda |
|---|---|---|
| `call:end` | `CONNECTING`, `ACTIVE` | jim no-op |
| `call:decline` | `RINGING` | jim no-op |
| `call:cancel` | `RINGING` | jim no-op |

Amaliy oqibati: **`RINGING` holatida `call:end` qo'ng'iroqni yopmaydi** — ack `ok` keladi, telefon
esa jiringlashda davom etadi va 45 soniyadan keyin `MISSED` bo'ladi. Hali javob berilmagan
qo'ng'iroqni chaquvchi **`call:cancel`**, chaqirilgan **`call:decline`** bilan yopadi.

Shuning uchun: ack `ok` bo'lgani uchun UI'ni yopmang. Haqiqiy yopilish `call:ended` /
`call:declined` / `call:canceled` bilan keladi — yoki siz o'zingiz rad etgan/bekor qilgan
holatda, o'z lokal teardown'ingiz bilan.

**`CONNECTING` nima uchun bor.** `call:accept` «media oqyapti» degani emas — ICE hali kelishishi
kerak, va sizning §12.4 dagi «accept'dan keyin 30 s» taymeri o'lchash uchun holat talab qiladi.
Shuning uchun `call:accept` → `CONNECTING`, klientning o'z **`call:connected`** i (ICE holati
`connected` bo'lganda) → `ACTIVE` va `answeredAt` yoziladi.

`call:accept` ni yutqazgan qurilma (boshqa qurilmangiz avvalroq javob bergan) **`INVALID_CALL_STATE`**
oladi va shu bilan birga `call:taken` ham keladi.

## 6. Taymerlar

Barcha qiymatlar sizning §12.4 dagilar bilan bir xil. UI shu qiymatlarga mos bo'lsin.

| Taymer | Muddat | Qachon ishlaydi | Natija |
|---|---|---|---|
| **jiringlash** | **45 s** | hali `RINGING` | `MISSED`, `call:ended { reason: "TIMEOUT" }` |
| **ulanish** | **30 s** | hali `CONNECTING` | `FAILED`, `call:ended { reason: "FAILED" }` |
| **maksimal davomiylik** | **4 soat** | hali `ACTIVE` | `ENDED`, `call:ended { reason: "TIMEOUT" }` |
| **uzilish (grace)** | **20 s** | ishtirokchining socket'i uzildi va qaytmadi | `FAILED`, `call:ended { reason: "FAILED" }` |
| **token grace** | **60 s** | `CALLS_ENFORCE_TOKEN_EXPIRY=true` bo'lganda, token `exp` idan keyin | socket uziladi (§8) |

`call:invite` ack'idagi va `call:incoming` dagi `expiresAt` = jiringlash boshlangan payt + 45 s.
Jiringlash ekranidagi taymerni shundan hisoblang, o'z soatingizdan emas.

**Uzilish oynasi qanday ishlaydi.** Server har ishtirokchining mavjudligini **talaba bo'yicha**
belgilaydi va socket uzilganda tozalaydi — shu payt 20 soniyalik taymer quriladi. Uni faqat o'sha
talabadan o'sha qo'ng'iroq uchun kelgan **`call:*` freymi** bekor qiladi. Qayta ulanishning o'zi
yetarli emas.

⚠️ **Shuning uchun jonli qo'ng'iroq davomida `/calls` socket'i qayta ulansa, darhol
`call:connected { callId }` yuboring.** Batafsil va nima buzilishi: `PREREQUISITES.md` §2.

Qisqa uzilish (lift, tunnel) qo'ng'iroqni o'ldirmaydi — WebRTC media bu socket'dan mustaqil.
20 soniya aynan shuning uchun bor.

## 7. Payload validatsiyasi

Har bir hodisa payload'i class-validator bilan tekshiriladi. Buzilsa — `VALIDATION_ERROR` (422).

⚠️ **Ack qaysi maydon buzilganini aytmaydi.** WS xato ack'ida faqat `{ code, message }` bor va
`message` doimo umumiy — `"Ma'lumotlar noto'g'ri"`. REST'dagi `error.fields` bu yerda yo'q. Ya'ni
payloadni quyidagi jadvalga qarab **oldindan** to'g'ri yig'ish kerak; server sizga nima
noto'g'riligini aytmaydi.

| Maydon | Chek |
|---|---|
| `callId` | **uuid v4** (36 belgi) |
| `calleeId` | satr, uzunligi **20–32** (cuid) |
| `media` | `"AUDIO"` yoki `"VIDEO"` |
| `sdp` (`invite`, `accept`, `renegotiate`) | bo'sh bo'lmagan satr, **≤ 65 536** belgi |
| `candidate.candidate` | satr, **≤ 512** belgi |
| `candidate.sdpMid` | **satr**, ≤ 32 belgi — `null` **qabul qilinmaydi** |
| `candidate.sdpMLineIndex` | butun son, **0–64** |
| `audioEnabled`, `videoEnabled` | boolean |
| `reason` (`decline`) | `"DECLINED"` yoki `"BUSY"` |
| `token` (`auth`) | bo'sh bo'lmagan satr, ≤ 4096 |

⚠️ **Ortiqcha maydon xato beradi.** Validatsiya `whitelist` + `forbidNonWhitelisted` rejimida —
jadvalda yo'q har qanday kalit `VALIDATION_ERROR` ga olib keladi. Amaliy oqibatlari:

- `call:invite` ga **`conversationId` qo'shmang** (sizning §12.1 dagi payload'da bor edi — endi yo'q).
- `candidate` obyektida **aynan shu uchta kalit** bo'lsin. `RTCIceCandidate.toJSON()` ko'p
  platformada `usernameFragment` ni ham qo'shadi — uni **olib tashlang**.
- `sdpMid` `null` bo'lgan nomzod (end-of-candidates markeri) yuborilmasin — uni umuman
  yubormang, WebRTC uni o'zi hal qiladi.

## 8. Token siyosati — uchta xil, bitta emas

Access token 15 daqiqa, qo'ng'iroq esa 4 soatgacha yashaydi. Shuning uchun «muddati o'tgan bo'lsa
rad et» qoidasi hamma hodisaga qo'llanmaydi:

| Hodisa turi | Siyosat |
|---|---|
| Holat yaratuvchi — `call:invite`, `call:accept` | Yangi token **shart**. Muddati o'tgan bo'lsa `TOKEN_EXPIRED` |
| Tugatuvchi — `call:end`, `call:cancel`, `call:decline` | **Doim qabul qilinadi.** Tugatish hech qachon rad etilmaydi, aks holda mikrofon oqib turaverardi |
| Qo'ng'iroq ichidagi — `call:ice`, `call:renegotiate`, `call:media-state`, `call:connected` | Qo'ng'iroq umri davomida qabul qilinadi |

**`call:auth { token }`** — socket'ni uzmasdan uning saqlangan `exp` ini yangilaydi.
Ack: `{ status: "ok", expiresAt: "<ISO-8601>" }`.

⚠️ Boshqa talabaning tokeni yuborilsa socket **uziladi** — bu yangilash emas, sessiya almashtirish.

Hozir `CALLS_ENFORCE_TOKEN_EXPIRY=false`, ya'ni socket token muddati o'tganda **uzilmaydi** — lekin
`call:invite`/`call:accept` dagi yangilik tekshiruvi **hozir ham ishlaydi**. Batafsil va nima
buzilishi: `PREREQUISITES.md` §3.

## 9. Xato kodlari

REST bilan bir xil to'plam — klientda bitta xato yo'li yetarli.

| Kod | HTTP ekvivalenti | Ma'nosi | Qayerda |
|---|---|---|---|
| `UNAUTHORIZED` | 401 | socket handshake'ni o'tmagan | har joyda |
| `TOKEN_EXPIRED` | 401 | access token muddati o'tgan | faqat `call:invite`, `call:accept` |
| `FORBIDDEN` | 403 | qo'ng'iroq ishtirokchisi emassiz, yoki bu hodisa uchun rol noto'g'ri | har joyda |
| `NOT_CONNECTED` | 403 | siz bilan chaqirilgan bog'lanmagan | `call:invite` |
| `USER_BLOCKED` | 403 | biri ikkinchisini bloklagan | `call:invite` |
| `STUDENT_NOT_FOUND` | 404 | chaquvchining o'z profili topilmadi (chekka holat) | `call:invite` |
| `CALL_NOT_FOUND` | 404 | bunday `callId` yo'q — **eng ko'p uchraydigan sababi: qo'ng'iroq allaqachon tugagan.** Tugagan qo'ng'iroqqa `call:ice`, `call:connected`, `call:media-state` yuborilsa shu keladi | har joyda |
| `CALL_BUSY` | 409 | chaqirilgan (yoki siz) allaqachon qo'ng'iroqda | `call:invite` |
| `INVALID_CALL_STATE` | 409 | boshqa qurilmangiz avvalroq javob berdi | `call:accept` |
| `VALIDATION_ERROR` | 422 | payload chekdan o'tmadi (§7) | har joyda |
| `RATE_LIMITED` | 429 | chegaradan oshdi (§10) | har joyda |
| `NOT_IMPLEMENTED` | 503 | qo'ng'iroqlar xususiyati bu joylashtirishda o'chirilgan (`CALLS_ENABLED=false`, `REST.md`) — chastota chegarasi, Redis holati va tarix qatori hech biri sarflanmaydi | **faqat `call:invite`** |
| `INTERNAL_ERROR` | 500 | kutilmagan xato | har joyda |

⚠️ **`NOT_IMPLEMENTED` faqat yangi qo'ng'iroqni to'xtatadi.** `CALLS_ENABLED=false` bo'lganda ham
qolgan barcha hodisa (`accept`/`connected`/`decline`/`cancel`/`end`/`ice`/`renegotiate`/
`media-state`) va `GET /v1/calls` bayroqdan qat'i nazar ishlaydi — bayroqni o'chirish jonli
qo'ng'iroqni tugatib bo'lmaydigan holga hech qachon keltirmaydi.

⚠️ Sizning §12.3.1 dagi **`BLOCKED`** kodi qo'shilmadi — mavjud **`USER_BLOCKED`** ishlatiladi
(`DEVIATIONS.md`).

⚠️ Sizning §12.3.3 «chaqirilgan band bo'lsa darhol `call:declined { reason: "BUSY" }`» qoidangiz
boshqacha bajarildi: band holat **`call:invite` ack'ida `CALL_BUSY` xatosi** sifatida qaytadi,
alohida hodisa yuborilmaydi.

## 10. Chastota chegaralari

Oltita alohida chegara. Hammasi `RATE_LIMITED` beradi.

| Chegara | Qiymat | Qamrovi |
|---|---|---|
| **Socket bucket** | **30 token, sekundiga 15 ta to'ladi** | `invite`, `accept`, `connected`, `auth`, `ringing`, `ice`, `renegotiate`, `media-state` |
| **Tugatish bucket** | **5 token, sekundiga 1 ta** | `end`, `cancel`, `decline` — alohida, shuning uchun ICE to'lqini sizni «tashlash» tugmasidan ayirmaydi |
| **Taklif — global** | **daqiqasiga 10 ta** (bir chaquvchidan, barcha peer'lar bo'yicha) | `call:invite` |
| **Taklif — juftlik** | **15 daqiqada 3 ta javobsiz taklif** (A→B va B→A alohida hisoblanadi) | `call:invite` |
| **ICE** | qo'ng'iroqqa **har ishtirokchidan 500 ta** | `call:ice` |
| **Renegotiate** | qo'ng'iroqqa **har ishtirokchidan 10 ta** | `call:renegotiate` |

**Amalda birinchi bo'lib socket bucket'i uriladi.** Dual-stack qurilma yig'ilgan nomzodlar to'plamini
bir yo'la yuborsa, ~2 soniyada 30 freym ketadi va ICE chegarasi (500) ga hali yaqin ham
kelmagan holda `RATE_LIMITED` oladi.

**Nima qilish kerak:**

- Nomzodlarni **trickle** qiling — kelgan sari birma-bir, yig'ilganini bir yo'la emas.
- `RATE_LIMITED` kelsa **darhol qayta urinmang** — eksponensial pauza bilan qayta urining.
  Socket bucket'i sekundiga 15 ta to'ladi, ya'ni ~200 ms kutish odatda yetadi.
- `call:ice` uchun `RATE_LIMITED` — halokat emas: nomzod yo'qoladi, ulanish boshqalari bilan
  davom etadi. `call:end` uchun esa qayta urinish **shart**.

**Juftlik chegarasi** — ta'qibga qarshi asosiy himoya, va u faqat **javobsiz** takliflarni sanaydi:
`MISSED`, `DECLINED`, `CANCELED`. Sanalmaydiganlar: javob berilgan qo'ng'iroqlar, glare'da yutqazgan
taklif, accept'dan keyingi ulanish xatosi, socket uzilishi. Ya'ni oddiy suhbat hech qachon chegaraga
urilmaydi; javob bermayotgan odamni qayta-qayta jiringlatish uriladi.

## 11. `relayOnly` — IP maxfiyligi

`relayOnly` uchta joyda keladi: **`call:invite` ack'ida**, **`call:incoming`** da va
**`call:accepted`** da.

⚠️ **`GET /v1/calls/ice-servers` javobida u yo'q va bo'lmaydi** — u endpoint qo'ng'iroqdan oldin,
peer kim ekani hali ma'lum bo'lmaganda chaqiriladi, `relayOnly` esa **juftlikka** bog'liq.

**Server qoidasi:** juftlik orasida avval **javob berilgan va tugagan** qo'ng'iroq bo'lmagan bo'lsa
→ `relayOnly: true`. Bir marta haqiqatan gaplashgandan keyin → `false`.

**`relayOnly: true` bo'lganda klient nima qilishi shart:**

1. `RTCConfiguration.iceTransportPolicy = "relay"`.
2. `host` va `srflx` nomzodlarini **umuman chiqarmang va yubormang** — faqat `relay`.

**Nima uchun.** Offer taklif bilan birga ketadi va `call:incoming` uni chaqirilganning barcha
qurilmalariga yuboradi. TURN majburlanmasa, chaqirilgan **javob bermasa ham, hatto rad etsa ham**
chaquvchining uy IP manzilini oladi. IP → provayder + shahar. Talabalar ko'pincha bir-birini
tanimaydi.

✅ **Server ham filtrlaydi.** `relayOnly: true` bo'lgan qo'ng'iroqda `call:ice` yo'lida server
nomzod qatoridagi `typ` tokenini o'qib, faqat `relay` turini oldinga uzatadi; `host`/`srflx`/`prflx`
va tahlil qilib bo'lmaydigan qator (yopiq holatga tushish) tashlab yuboriladi va peer'ga hech narsa
bormaydi. Nomzodlarni tugatish signali (bo'sh `candidate` qatori) hech qachon tashlab yuborilmaydi.

⚠️ **Shunga qaramay klient talabi o'zgarmaydi.** `iceTransportPolicy: "relay"` bilan ishlang va
host/srflx nomzod **umuman yig'mang/chiqarmang** — server filtri bu qatorda bo'lmagan **eski
klientlar** uchun kafolatni saqlab qolish uchun qo'shildi, klientni o'z nomzodlarini yig'ib, keyin
serverga bekorga yuborishdan ozod qilmaydi.

**Narxi:** yangi juftliklarda **butun media** TURN orqali oqadi, faqat signalizatsiya emas. Bu ongli
savdo.

## 12. Ko'p qurilma va glare

**Ko'p qurilma.** `call:incoming` chaqirilganning **barcha** ulangan socket'lariga boradi. Birinchi
`call:accept` yutadi (atomar), qolganlari `INVALID_CALL_STATE` oladi. Yutqazgan **qurilmalarga**
`call:taken { callId }` boradi — javob bergan qurilmaning o'ziga **bormaydi**. `call:decline` da ham
xuddi shunday: rad etgan qurilmadan boshqa hammasi `call:taken` oladi.

**Glare** (ikkisi bir vaqtda bir-biriga qo'ng'iroq qildi). Qo'shimcha round-trip'siz hal qilinadi:
leksikografik **kichik** `callId` yutadi. Lekin faqat mavjud qo'ng'iroq **aynan teskari juftlik**
(o'sha ikki talaba, teskari yo'nalishda) va hali **`RINGING`** bo'lganda — aks holda yangi taklif
allaqachon javob berilgan suhbatni uzib yuborardi.

Yutqazgan qo'ng'iroq `call:ended { reason: "BUSY" }` bilan yopiladi va uning chaquvchisining juftlik
byudjetiga **kirmaydi** — glare'da yutqazish suiiste'mol emas.

## 13. Server nima qilmaydi

- **SDP va ICE nomzodlarini o'zgartirmaydi va log qilmaydi.** Yagona chetlashish: `call:ice`,
  `relayOnly: true` bo'lganda — server nomzodning `typ` tokenini o'qib, `relay` bo'lmaganini tashlab
  yuboradi (§4.2, §11). Bu **filtr**, qayta yozish emas.
- `call:invite` dagi `conversationId` ni **qabul qilmaydi** (§3).
- Klientdan `type: "CALL"` xabar **qabul qilmaydi** (`REST.md`).
- Ilova yopiq bo'lganda **hech narsa yubormaydi** — VoIP push 2-bosqichda (`README.md`).
