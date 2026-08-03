# Qo'ng'iroq (1:1 audio/video) — mobil jamoa uchun handoff

Sizning `CHAT_MEDIA_AND_CALLS_BACKEND.md` §10–16 (B qism) hujjatingizga javob. Backend tomoni
**tugadi va merge'ga tayyor**: `/calls` Socket.IO namespace'i, 17 ta signalizatsiya hodisasi,
ikkita REST endpoint va chatdagi `CALL` xabar yozuvi.

Branch: `feat/chat-calls-phase1`. Tekshirilganlik: tsc toza · lint toza · **1130 unit / 103 suite** ·
**150 e2e / 12 suite** · ilova ko'tariladi, ikkala REST marshruti map bo'ladi.

> ⚠️ **Backend deploy bo'lishidan oldin sizdan bitta narsa kerak** — `MessageType.CALL` ga
> chidamlilik. Batafsil: `PREREQUISITES.md` §1. Qolgan ikkitasi deploy'ni bloklamaydi, lekin
> qo'ng'iroqni yoqishni bloklaydi.

## 🆕 2026-08-03 da qo'shilganlar

Asl handoff'dan keyingi o'zgarishlar. Ikkalasi ham **`REST.md`** da:

| Nima | Qayerda | Nima uchun muhim |
|---|---|---|
| **`POST /v1/calls/{callId}/stats`** — yangi endpoint | `REST.md` §3 | **Yuborilmasa, TURN sarfi haqida bizda hech qanday ma'lumot bo'lmaydi.** Ixtiyoriy telemetriya emas — TURN byudjeti shu raqamlar bilan hal qilinadi |
| `iceServers` ro'yxatining **shakli o'zgarishi mumkin** | `REST.md` §1, «Ro'yxatning shakli» | Backend endi ikkita TURN provayderini qo'llaydi. Host nomini ham, URL sonini ham **qotirmang** |

`PROTOCOL.md` §11 ga bitta aniqlik qo'shildi: `relayOnly: true` bo'lgan qo'ng'iroqda ham
`iceServers` ichida STUN yozuvi bo'ladi — bu kutilgan holat, cheklovni `iceTransportPolicy = "relay"`
bilan siz qo'yasiz (talab o'zgarmagan).

## Qaysi hujjatni o'qish

| Fayl | Nima uchun |
|---|---|
| **`PREREQUISITES.md`** | **Avval shuni o'qing.** Sizga bog'liq uchta ish — ularsiz rollout bo'lmaydi |
| **`PROTOCOL.md`** | 17 ta WS hodisasi, payload'lar, holat mashinasi, taymerlar, cheklovlar, xato kodlari |
| **`REST.md`** | **Uchta** endpoint (`GET /v1/calls/ice-servers`, `GET /v1/calls`, **`POST /v1/calls/{id}/stats`**) va o'zgargan `MessageDto` |
| **`DEVIATIONS.md`** | Sizning spec'ingizdan farq qiladigan **hamma narsa**, har biri sababi bilan |

OpenAPI: **`docs/handoff/mobile/student-api.json`** — klientni shundan qayta generatsiya qiling.
`Calls` tegi student spec'iga kiritilgan.

> WS protokoli OpenAPI'da **yo'q va bo'lishi ham mumkin emas** — `PROTOCOL.md` qo'lda yoziladi.
> Bu `/chat` bilan bir xil holat (`docs/handoff/mobile/03-WEBSOCKET.md`).

## Nima yetkazildi

| Sizning bandingiz | Holat |
|---|---|
| §10 — sof P2P WebRTC + TURN, SFU yo'q | ✅ shunday qilindi |
| §11.2 — `GET /v1/calls/ice-servers` (coturn `use-auth-secret`, HMAC-SHA1) | ✅ |
| §12 — `/calls` namespace, 15 ta hodisa | ✅ **+2 ta yangi** (`call:connected`, `call:auth`) |
| §12.3 — ruxsat, ko'p qurilma, band, glare, faqat uzatuvchi, uzilish | ✅ |
| §12.4 — 45 s / 30 s / 4 soat / 20 s taymerlari | ✅ aynan shu qiymatlar |
| §14.2 — chatda `type: "CALL"` xabar, `MISSED` o'qilmagan | ✅ |
| §14.3 — `GET /v1/calls?page=&size=` | ✅ |
| §15.1–15.3 — SDP/ICE ga tegilmaydi, trickle, ICE restart | ✅ server bir baytiga ham tegmaydi |
| §16 — bog'lanish sharti, blok, chastota chegarasi, TURN TTL | ✅ |

## Nima yetkazilmadi (bu bosqichda emas)

| Sizning bandingiz | Holat |
|---|---|
| §13 — **VoIP push (PushKit / high-priority FCM)** | ❌ 2-bosqich. Hozircha qo'ng'iroq **faqat ilova ochiq va `/calls` socket'i ulangan** bo'lganda ishlaydi |
| §13.1 — `RegisterDeviceDto.tokenType` | ❌ 2-bosqich |
| §15.5 — `POST /v1/calls/{id}/stats` | ❌ 3-bosqich |
| §16 — `POST /v1/reports` ga `callId` | ❌ 3-bosqich |
| Guruh qo'ng'irog'i / SFU | ❌ qamrovdan tashqarida |

Hodisalar shunday loyihalanganki, VoIP push qo'shilishi klient protokolini **buzmaydi** — u faqat
socket'ni uyg'otish yo'li qo'shadi.

## Ish tartibi

1. **`MessageType.CALL` ni bardoshli qiling va chiqaring.** Bu birinchi, chunki u **yangilanmagan
   foydalanuvchilarga** ta'sir qiladi — `PREREQUISITES.md` §1.
2. **Klientni qayta generatsiya qiling** — `student-api.json`. Yangi/o'zgargan sxemalar:
   `MessageTypeDto` (+`CALL`), `MessageDto.call`, `MessageCallDto`, `CallDto`, `CallListDto`,
   `IceServersDto`, `IceServerDto`, `CallMediaDto`, `CallStatusDto`, `CallEndReasonDto`,
   `CallPartyDto`, `CallDirectionDto`.
3. **`/calls` socket qatlamini yozing** — `PROTOCOL.md`. `call:connected` va `call:auth` ni
   boshidanoq kiriting, keyin qo'shilsa qayta ishlash kerak bo'ladi.
4. **`relayOnly` ni bajaring** — `PROTOCOL.md` §«relayOnly». Bu maxfiylik nazorati, kosmetika emas.
5. **`DEVIATIONS.md` ni o'qib chiqing** — DTO validatsiyangiz `callId` ni uuid sifatida qabul
   qilishi kerak, `call:invite` ga `conversationId` yubormaslik kerak, va h.k.

## Rollout darvozalari (backend/DevOps tomonda)

| Darvoza | Ma'nosi |
|---|---|
| **`CALLS_ENABLED`** | Hozir `false` — qo'ng'iroqlar xususiyatining bosh kaliti. `false` bo'lganda `GET /v1/calls/ice-servers` **doim 503** qaytaradi (TURN sozlangan bo'lsa ham) va `call:invite` yangi qo'ng'iroq boshlashni rad etadi (**`NOT_IMPLEMENTED`**, `PROTOCOL.md` §9). Qo'ng'iroq ichidagi qolgan hamma hodisa va `GET /v1/calls` tarixi bundan mustasno — bayroqdan qat'i nazar ishlaydi |
| **coturn serveri** | Hali ko'tarilmagan. Usiz NAT ortidagi qo'ng'iroqlarning bir qismi umuman ulanmaydi va (`CALLS_ENABLED=true` bo'lganda ham) `GET /v1/calls/ice-servers` **503** qaytaradi (`REST.md`) |
| **`CALLS_ENFORCE_TOKEN_EXPIRY`** | Hozir `false`. `true` ga faqat **ikkala platforma `call:auth` ni chiqargandan keyin** o'giriladi — `PREREQUISITES.md` §3 |

Bular env sozlamalari; sim kontrakti (hodisa nomlari, payload'lar) o'zgarmaydi. Faqat
**`call:invite`** (`CALLS_ENABLED=false` bo'lganda rad etiladi), TURN hisobi va socket'ning token
bo'yicha uzilishi shu bayroqlarga bog'liq — qo'ng'iroq ichidagi qolgan barcha hodisa va
`GET /v1/calls` ular holidan qat'i nazar ishlashda davom etadi.
