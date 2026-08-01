# Chat — onlayn qo'ng'iroq (audio + video) (dizayn)

**Sana:** 2026-08-01
**Manba:** `docs/api/mobile_questions/CHAT_MEDIA_AND_CALLS_BACKEND.md` §10–16 (B QISM)
**Oldingi bosqichlar:** `2026-07-28-chat-phase0-fixes-design.md`, `2026-07-29-chat-phase2-missing-endpoints-design.md` (ikkalasi bajarilgan)
**Holat:** tasdiqlangan · **2-tahrir** — `reviewer`, `security-engineer`, `database-architect` ko'rigidan keyin (§16 ga qarang)

## 1. Qamrov

1:1 audio va video qo'ng'iroq — sof P2P WebRTC, server faqat **signalizatsiya** va **TURN relay**
beradi (§10). SFU (mediasoup/LiveKit) **qo'shilmaydi**: ikki kishilik qo'ng'iroqda u faqat kechikish
va server yuki qo'shadi. Guruh qo'ng'irog'i (3+ kishi) kerak bo'lganda SFU keyin qo'shiladi —
signalizatsiya hodisalari shunday loyihalanganki, o'sha o'tish klient protokolini buzmaydi.

**Qamrovdan tashqarida:** guruh qo'ng'irog'i, ekran ulashish uchun alohida oqim (mavjud
`call:renegotiate` yetarli), qo'ng'iroq yozib olish, biznes egalari uchun qo'ng'iroq (faqat
talaba↔talaba).

### 1.1 Bloklovchilar holati

| Bloklovchi | Holat |
|---|---|
| nginx WS upgrade (§17.2) | ✅ `deploy/nginx/socket-io.conf` yozilgan — DevOps qo'llashi kerak |
| Socket.IO Redis adapteri | ✅ `src/main.ts:51` da ulangan |
| Real FCM provayderi | ✅ `src/infrastructure/push/fcm-push.provider.ts` |
| APNs VoIP (PushKit) | ❌ **yo'q** — FCM buni qila olmaydi (`fcm-push.provider.ts:28`) |
| coturn serveri | ❌ **yo'q** — infratuzilma, kod emas |

coturn va Apple VoIP sertifikati **kodni bloklamaydi** — ikkalasi env orqali sozlanadi. Dizayn
ikkala holatda ham bir xil; farq faqat real uchidan-uchiga sinov imkoniyatida.

## 2. Tasdiqlangan qarorlar

### 2.1 Holat va taymerlar — Redis + BullMQ (A variant) + Postgres backstop

Jonli holat **Redis**da, taymerlar **BullMQ kechiktirilgan joblari**da, doimiy yozuv **Postgres**da.

Muqobil (faqat Postgres + cron sweeper) **asosiy mexanizm sifatida** rad etildi: taymer aniqligi
bevosita UX (qo'ng'iroq 45 soniya jiringlashi kerak, 50 emas), va har ICE nomzodida DB o'qish
ortiqcha. Lekin cron sweeper **zaxira mexanizm sifatida qo'shiladi** (§11) — Redis yoki BullMQ
yo'qotgan qo'ng'iroq aks holda abadiy `RINGING` bo'lib qolar edi.

### 2.2 Manba spec'idan ongli chetlashishlar

Har biri mobil jamoaga aytilishi shart.

| # | Qaror | Spec nima degan | Nima uchun boshqacha |
|---|---|---|---|
| 1 | `Call.id` — **cuid** | ULID (`cal_01J...`) | Butun kodbaza cuid'da. Glare uchun faqat aniqlangan to'liq tartib kerak; cuid vaqt bo'yicha tartiblangan, bu yetarli |
| 2 | Chatdagi qo'ng'iroq yozuvi — **`Message` ustunlarida snapshot** | belgilanmagan | §7. `Call` ga JOIN emas: (a) chat↔calls modul sikli oldi olinadi, (b) ishtirokchi o'chsa xabar baribir ko'rinadi — `replyTo*` va `sticker*` bilan bir xil naqsh |
| 3 | Telemetriya — **alohida `CallStat` jadvali** | belgilanmagan | Ikki ishtirokchining metrikasi har xil (biri `relay`, biri `srflx`). Bitta qatorga sig'maydi — 1-tahrirdagi «ustunlar yetarli» qarori xato edi |
| 4 | `tokenType` taxmini — **ikkala platformada ham `FCM`** | `IOS → APNS` (§13.1) | Bazadagi mavjud iOS tokenlar **haqiqatan ham FCM registration token**. Ularni `APNS` deb belgilash iOS push'ini butunlay o'ldiradi. `APNS`/`APNS_VOIP` faqat klient **aniq yuborganda** yoziladi |
| 5 | `CallStatus` ga **`CONNECTING`** qo'shiladi | yo'q | §12.4 dagi «accept'dan keyin 30 s → FAILED» boshqacha amalga oshirib bo'lmaydi (§5.4) |
| 6 | Bekor qilish push'i **VoIP kanalidan ketmaydi** | «darhol» VoIP (§13.4) | PushKit qoidasi: har VoIP push `reportNewIncomingCall` bilan tugashi shart. Bekor push'i buni buzadi va iOS qurilmaga VoIP yetkazishni **butunlay to'xtatadi** (§8.3) |
| 7 | `CallEndReason` ga `UNAUTHORIZED` qo'shildi | §12.1 da bor edi | 1-tahrirda tushib qolgan edi — tiklandi |
| 8 | **`relayOnly: boolean`** protokolga qo'shiladi | yo'q | Yangi juftlik uchun TURN majburiy — aks holda chaqirilgan javob bermasa ham chaquvchining IP manzili ochiladi (§9.2) |

### 2.3 Orqaga moslik

- `MessageTypeDto` ga `CALL` qo'shiladi — additive, lekin mobil tomon regeneratsiya qilishi kerak.
- `RegisterDeviceDto.tokenType` — **ixtiyoriy**; berilmasa `FCM` (chetlashish #4).

## 3. Modul tuzilishi

```
src/common/websocket/                 # YANGI — ikkala gateway ishlatadi (§6.4)
├── ws-jwt.ts                         # chat/infrastructure/ dan ko'chiriladi
└── ws-helpers.ts                     # personalRoom, userOf, toError, unauthorized, assertTokenFresh

src/modules/calls/
├── domain/
│   ├── entities/call.entity.ts
│   ├── enums/{call-media,call-status,call-end-reason,call-party}.enum.ts
│   ├── call.repository.ts            # port — Postgres
│   ├── call-state.repository.ts      # port — Redis jonli holat
│   ├── call-timers.repository.ts     # port — kechiktirilgan taymerlar
│   ├── student-directory.repository.ts  # port — caller nomi/avatari (§6.5)
│   ├── call-state-machine.ts         # sof TS: qonuniy o'tishlar + (status, endReason) matritsasi
│   └── glare.ts                      # sof TS: resolveGlare() — Lua faqat transkripsiya (§5.2)
├── application/
│   ├── calls.service.ts
│   ├── call-rate-limiter.ts
│   ├── call-push.service.ts
│   ├── call-ended.bus.ts             # calls → chat, MediaReadyBus naqshi (§7.2)
│   └── call-events.ts
├── infrastructure/
│   ├── call.prisma.repository.ts
│   ├── call-state.redis.repository.ts
│   ├── call-timers.queue.ts          # BullMQ
│   ├── call.mapper.ts
│   └── ice-credentials.ts
├── presentation/
│   ├── calls.controller.ts
│   └── dto/                          # REST DTO + 15 ta WS payload DTO (§6.3)
├── calls.gateway.ts
└── calls.module.ts

src/cron/call-reconciliation.cron.ts  # YANGI (§11)
src/infrastructure/push/
├── voip-push.provider.ts             # VOIP_PUSH_PROVIDER porti
├── apns-voip.provider.ts             # APNs HTTP/2 + p8 JWT
├── dev-voip.provider.ts
└── voip-push-provider.factory.ts
```

Qatlam yo'nalishi: `presentation → application → domain ← infrastructure`. `calls.gateway.ts`
modul ildizida turadi (`chat.gateway.ts` bilan bir xil) va prezentatsiya qatlami hisoblanadi.

## 4. Ma'lumotlar modeli

### 4.1 `Call`

```prisma
enum CallMedia     { AUDIO VIDEO }
enum CallStatus    { RINGING CONNECTING ACTIVE ENDED MISSED DECLINED FAILED CANCELED }
enum CallEndReason { HANGUP TIMEOUT DECLINED BUSY FAILED CANCELED UNAUTHORIZED }
enum CallParty     { CALLER CALLEE }

model Call {
  id             String         @id @default(cuid())
  conversationId String         @map("conversation_id")
  callerId       String         @map("caller_id")
  calleeId       String         @map("callee_id")
  media          CallMedia
  status         CallStatus     @default(RINGING)
  startedAt      DateTime       @default(now()) @map("started_at")
  answeredAt     DateTime?      @map("answered_at")
  endedAt        DateTime?      @map("ended_at")
  endReason      CallEndReason? @map("end_reason")
  endedBy        CallParty?     @map("ended_by")
  updatedAt      DateTime       @updatedAt @map("updated_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  caller       Student      @relation("CallCaller", fields: [callerId], references: [id], onDelete: Cascade)
  callee       Student      @relation("CallCallee", fields: [calleeId], references: [id], onDelete: Cascade)
  stats        CallStat[]
  reports      Report[]     @relation("ReportCall")

  @@index([callerId, startedAt])
  @@index([calleeId, startedAt])
  @@index([conversationId])
  @@index([status, startedAt])   // rekonsiliatsiya sweep'i (§11) — usiz seq scan
  @@map("calls")
}
```

**`durationMs` ustuni yo'q** — `answeredAt`..`endedAt` dan `call.mapper.ts` da hisoblanadi. Ikkita
haqiqat manbai bo'lmasin. DTO'da doimo son: `answeredAt` null bo'lsa `0`.

**`endedBy` — `CallParty` enum**, `Student` id emas: qiymat faqat ikkitadan biri bo'lishi mumkin,
FK va o'chirilgan hisob muammosi ham qolmaydi.

**`messageId` ustuni yo'q** — chetlashish #2, chatdagi yozuv `Message` ustunlarida (§4.2).

### 4.2 Mavjud modellarga qo'shimchalar

```prisma
enum MessageType     { TEXT IMAGE GIF VIDEO FILE VOICE STICKER SYSTEM CALL }   // +CALL
enum DeviceTokenType { FCM APNS APNS_VOIP }

model Message {
  // ...
  // Qo'ng'iroq yozuvi — snapshot, `replyTo*` va `sticker*` bilan bir xil naqsh. `Call` ga JOIN
  // qilinmaydi: ishtirokchi o'chirilsa Call qatori cascade bilan ketadi, xabar esa qoladi.
  callId       String?        @map("call_id")   // faqat "batafsil" uchun, FK emas
  callMedia    CallMedia?     @map("call_media")
  callStatus   CallStatus?    @map("call_status")
  callDuration Int?           @map("call_duration_ms")
  callEndReason CallEndReason? @map("call_end_reason")
}

model Conversation {
  // ...
  calls Call[]        // ⚠️ 1-tahrirda tushib qolgan — usiz Prisma kompilyatsiya QILMAYDI
}

model Student {
  // ...
  callsMade     Call[]     @relation("CallCaller")
  callsReceived Call[]     @relation("CallCallee")
  callStats     CallStat[]
}

model Report {
  // ...
  callId String? @map("call_id")
  call   Call?   @relation("ReportCall", fields: [callId], references: [id], onDelete: SetNull)
  @@index([callId])
  @@index([messageId])    // mavjud bo'shliq — SetNull uchun indeks yo'q edi
  @@index([reporterId])   // mavjud bo'shliq — Cascade uchun indeks yo'q edi
}

model DeviceToken {
  // ...
  tokenType DeviceTokenType @default(FCM) @map("token_type")
}
```

`DeviceToken` ga qo'shimcha indeks **qo'shilmaydi** — `tokensFor` baribir foydalanuvchining barcha
tokenlarini oladi va kodda ajratadi; mavjud `@@index([studentId])` yetarli.

### 4.3 `CallStat` — telemetriya (chetlashish #3)

```prisma
enum IceCandidateType { HOST SRFLX RELAY }

model CallStat {
  callId          String           @map("call_id")
  studentId       String           @map("student_id")
  rttMs           Int?             @map("rtt_ms")
  packetsLost     Int?             @map("packets_lost")
  packetsReceived Int?             @map("packets_received")   // usiz packetsLost tahlil qilib bo'lmaydi
  jitterMs        Int?             @map("jitter_ms")
  candidateType   IceCandidateType @map("candidate_type")
  createdAt       DateTime         @default(now()) @map("created_at")

  call    Call    @relation(fields: [callId], references: [id], onDelete: Cascade)
  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)

  @@id([callId, studentId])   // "har ishtirokchidan bir marta" — bazada kafolatlangan
  @@index([studentId])
  @@map("call_stats")
}
```

### 4.4 Redis jonli holat

| Kalit | Tur | Mazmun | TTL |
|---|---|---|---|
| `call:{callId}` | hash | `status, callerId, calleeId, conversationId, media, startedAt, answeredAt` | 4 soat 15 daqiqa |
| `busy:{studentId}` | string | joriy `callId` | `RINGING` da **60 s**, `ACTIVE` ga o'tganda 4 soat 15 daqiqaga uzaytiriladi |
| `call:{callId}:present:{studentId}` | string | ishtirokchining ochiq socket'i bor | 60 s, har `ping` da yangilanadi |

`busy:` TTL qisqa boshlanadi: nusxa `RINGING` va «tozalash» orasida o'lsa, foydalanuvchi 4 soat emas,
60 soniya band bo'lib qoladi.

`call:{id}:present:{studentId}` — `disconnect-grace` taymerining o'qiydigan yagona belgisi. **`/calls`
gateway `PresenceRepository` ga umuman tegmaydi** — aks holda `/chat` ning refcount'i ikki marta
sanaladi va foydalanuvchi doimo «onlayn» ko'rinadi.

### 4.5 Migratsiya xavfsizligi

Hammasi additive: yangi jadvallar, yangi nullable ustunlar, enum'ga yangi qiymatlar. `DROP` yo'q.

Tekshirilgan: `ALTER TYPE "MessageType" ADD VALUE 'CALL'` PG16'da tranzaksiya ichida xavfsiz (yangi
qiymat **o'sha tranzaksiyada ishlatilmaydi**); `ADD COLUMN ... NOT NULL DEFAULT 'FCM'` PG11+ da
jadvalni qayta yozmaydi. Repoda naqsh bor:
`prisma/migrations/20260729120000_chat_media_and_stickers/migration.sql`.

⚠️ **Bitta xavfli operatsiya bor.** `calls`, `call_stats` va `reports` ga FK qo'shish `messages`,
`conversations`, `students` jadvallariga ham `SHARE ROW EXCLUSIVE` qulf qo'yadi — ya'ni migratsiya
davomida **har bir chat xabari kutib qoladi**. `docker-compose.yml` da `migrate deploy` ilova
nusxalari trafik qabul qilib turganda ishlaydi. Shuning uchun migratsiya faylining birinchi qatori:

```sql
SET lock_timeout = '3s';
```

Qulf 3 soniyada olinmasa migratsiya tez tushadi va qayta urinish mumkin — chatni to'xtatib turgandan
ko'ra yaxshi.

⚠️ Enum qiymatini qo'shish **qaytarib bo'lmaydi** — PostgreSQL enum qiymatini o'chira olmaydi. Bu
migratsiyaning rollback'i yo'q.

## 5. Holat mashinasi

```
                    ┌──── call:decline ─────────► DECLINED
                    │
call:invite ──► RINGING ── call:accept ──► CONNECTING ── call:connected ──► ACTIVE
                    │                          │                              │
                    ├── call:cancel ─► CANCELED├── 30 s ──► FAILED            ├── call:end ──► ENDED
                    ├── 45 s ────────► MISSED  │                              ├── 4 soat ───► ENDED (TIMEOUT)
                    └── band ────────► DECLINED (BUSY)                        └── 20 s uzilish ► FAILED
```

`call-state-machine.ts` — sof funksiya, NestJS'siz, Prisma'siz. Ikki narsani kafolatlaydi:

1. `canTransition(from, to)` — terminal holatlardan chiqish yo'q; takroriy `call:end` jim
   e'tiborsiz qoldiriladi (klient qayta yuborishi normal).
2. `isValidOutcome(status, endReason)` — qonuniy juftliklar matritsasi. Ikkala enumda `DECLINED`,
   `FAILED`, `CANCELED`, `TIMEOUT` nomlari takrorlanadi va hech narsa `(ENDED, DECLINED)` kabi
   qarama-qarshi juftlikni to'xtatmaydi. Bir yillik ifloslangan analitikani tiklab bo'lmaydi.

### 5.1 `CONNECTING` — nima uchun kerak (chetlashish #5)

§12.4 «accept'dan keyin 30 soniyada ulanmasa `FAILED`» deydi. Lekin `accept` darhol `ACTIVE` qilsa,
«hali ulanmagan» degan holat umuman mavjud bo'lmaydi va taymer hech qachon ishlamaydi.

Shuning uchun: `call:accept` → `CONNECTING`. Klient ICE ulanishi `connected` bo'lganda yangi
**`call:connected`** hodisasini yuboradi → `ACTIVE`, `answeredAt` yoziladi.

✅ **Qaror qabul qilindi:** `call:connected` qo'shiladi. Bu manba spec'idagi 15 ta hodisaga
qo'shiladigan 16-chisi — mobil jamoaga alohida hujjatda aytiladi (`docs/architecture/calls.md` va
handoff yozuvi). Muqobil (birinchi `call:ice` ni «ulandi» deb olish) rad etildi: nomzod almashinuvi
ulanish muvaffaqiyatli degani emas, ya'ni 30 soniyalik taymer noto'g'ri ishlar edi.

### 5.2 Taymerlar

| Job id | Muddat | Shart | Natija |
|---|---|---|---|
| `ring:{callId}` | 45 s | hali `RINGING` | `MISSED` / `TIMEOUT` |
| `connect:{callId}` | 30 s | hali `CONNECTING` | `FAILED` |
| `max:{callId}` | 4 soat | hali `ACTIVE` | `ENDED` / `TIMEOUT` |
| `grace:{callId}:{studentId}` | 20 s | `present:` kaliti yo'q va holat terminal emas | `FAILED` |

Job id'lar **deterministik** — terminal o'tishda `queue.remove(id)` bilan bekor qilinadi. Bekor
qilishning o'zi yetarli emas: job otilib qolsa ham holatni o'qib, boshqa holatga o'tgan bo'lsa
**hech narsa qilmaydi**. Ikkalasi ham kerak — id mexanizm, no-op zaxira.

`removeOnComplete: true`, `removeOnFail` cheklangan. Aks holda soatiga yuzlab 4 soatlik job Redis'da
yig'ilib qoladi — Redis esa OTP, presence va Socket.IO adapterini ham ko'taradi.

### 5.3 Glare — eng nozik qism

Ikki foydalanuvchi bir vaqtda bir-biriga qo'ng'iroq qilsa, ikkala `call:invite` ham «peer bo'sh» deb
ko'radi, chunki ular **ikki xil kalitni** tekshiradi. Yechim — bitta Redis **Lua skripti** ikkala
ishtirokchining `busy:` kalitini atomar band qiladi.

Qaror mantig'i `domain/glare.ts` dagi **sof funksiyada** yoziladi
(`resolveGlare(incoming, holder) → 'CLAIM' | 'PREEMPT' | 'BUSY'`), Lua faqat uning transkripsiyasi.
Aks holda §12 dagi «unit test, DB yo'q» bajarib bo'lmaydi — Lua Redis ichida ishlaydi, mock qilinmaydi.

Qoida:

1. Ikkala kalit bo'sh → `CLAIM`.
2. Band, va egasi **aynan teskari juftlik** (`holder.callerId === incoming.calleeId && holder.calleeId
   === incoming.callerId`), **holati hali `RINGING`**, va uning `callId` i **mendan katta** →
   `PREEMPT` (egasini `BUSY` bilan yop, kalitlarni menikiga almashtir).
3. Aks holda → `BUSY`.

⚠️ **2-qadamdagi ikkala shart ham majburiy.**
- `RINGING` sharti bo'lmasa — yangi taklif, faqat `callId` i kichik bo'lgani uchun, **javob berilgan
  va davom etayotgan suhbatni** uzib yuborardi.
- **Teskari juftlik** sharti bo'lmasa — begona uchinchi shaxs (siz bilan bog'langan har kim) sizning
  jiringlayotgan qo'ng'irog'ingizni uzib yuborardi. Bu glare emas, bu hujum. Hozir buni cuid'ning
  vaqt bo'yicha tartiblanganligi *tasodifan* to'sib turibdi, lekin nusxalar orasidagi soat farqi bu
  himoyani buzadi.

Uchinchi holat: `busy:A` va `busy:B` **ikki xil** qo'ng'iroq tomonidan band bo'lishi mumkin — bu ham
`BUSY`.

### 5.4 Ko'p qurilma

`call:incoming` chaqirilganning **barcha** socket'lariga boradi. Birinchi `call:accept` yutadi:
`RINGING → CONNECTING` o'tishi Redis'da atomar (CAS). Yutqazgan qurilmalarga `call:taken` yuboriladi —
**javob bergan socket bundan chiqariladi** (`client.to(room)`, `server.to(room)` emas), aks holda
javob bergan qurilmaning o'ziga «jiringlashni to'xtat» ketadi.

## 6. `/calls` Socket.IO namespace

§12.1 dagi 15 ta hodisa + `call:connected` (§5.1) = **16 ta**.

### 6.0 Qoida 0 — har hodisada ishtirokchi tekshiruvi

**Bu dizaynning eng muhim xavfsizlik qoidasi.** 1-tahrirda faqat `call:invite` avtorizatsiya
qilingan edi; qolgan hodisalar uchun «begona `callId` → `CALL_NOT_FOUND`» deyilgan — ya'ni *mavjud
emas*, *sizniki emas* emas. `callId` ni bilgan har kim boshqaning qo'ng'irog'ini boshqara olardi.

`CallsService` ning **har bir** metodi autentifikatsiyalangan `studentId` ni oladi va birinchi ish
sifatida `assertParticipant(callId, studentId)` ni bajaradi. Undan tashqari rol matritsasi:

| Hodisa | Kim yubora oladi | Tekshiruvsiz nima bo'lardi |
|---|---|---|
| `call:accept` | faqat `calleeId` | Begona odam taklifni qabul qilib, **jonli audio/videoni tinglaydi** |
| `call:decline` | faqat `calleeId` | Istalgan qo'ng'iroqni rad etish |
| `call:cancel` | faqat `callerId` | Istalgan qo'ng'iroqni bekor qilish |
| `call:connected` | ikkalasi | — |
| `call:end` | ikkalasi | Istalgan suhbatni uzish |
| `call:ice` | ikkalasi | Media yo'lini o'zgartirish; begona socket'ga fan-out |
| `call:renegotiate` | ikkalasi | **Media oqimini hujumchi tomonga yo'naltirish** |
| `call:media-state` | ikkalasi | «Kamera o'chiq» deb soxta ko'rsatish |

Ishtirokchi bo'lmagan → **403 `FORBIDDEN`** (`CLAUDE.md` §Auth & Ownership: begona resurs uchun 403,
404 emas). Har biri uchun alohida unit test (§12).

### 6.1 `call:invite` — ruxsat

1. **Bog'lanish va blok.** Chaquvchi va chaqirilgan `Connection` ga egami, bloklanmaganmi.
   Mavjud `ConnectionCheckRepository.areConnected()` **yetarli emas** — u bitta `boolean` qaytaradi
   va bloklashni ham `false` ichiga yig'adi. `NOT_CONNECTED` va `USER_BLOCKED` ni ajratish uchun
   portga yangi metod kerak.
2. **`conversationId` klientdan olinmaydi.** ⚠️ 1-tahrirda u klientdan kelib to'g'ridan-to'g'ri
   `Call.conversationId` ga yozilardi. §7 esa qo'ng'iroq tugagach o'sha suhbatga `CALL` xabar
   yaratadi — ya'ni hujumchi **begona ikki kishining suhbatiga xabar in'ektsiya qilib**, ularning
   `seq` ini surib, o'qilmagan sonini ko'tara olardi. Server `conversationId` ni (caller, callee)
   juftligidan **o'zi topadi**, klientning qiymatini e'tiborsiz qoldiradi.
3. **Rate-limit** — §6.6.

### 6.2 Faqat uzatuvchi

Server SDP va ICE nomzodlarini **o'qimaydi va o'zgartirmaydi** — bir baytiga tegmay ikkinchi tomonga
uzatadi. Bu §15.1 dagi Opus sozlamalari (`useinbandfec`, `usedtx`) va §15.2 dagi H.264 kodek tartibi
buzilmasligining yagona kafolati.

⚠️ **SDP va ICE nomzodlari hech qachon, hech qanday darajada log'ga yozilmaydi** — ular
foydalanuvchining **uy IP manzilini** o'z ichiga oladi. Log'ga faqat `callId`, hodisa nomi, payload
**uzunligi** va nomzod **turi** yoziladi. Pino `redact` ro'yxatiga (`app.module.ts:45`) `sdp`,
`candidate`, `token`, `refreshToken` qo'shiladi.

### 6.3 Payload validatsiyasi

⚠️ `chat` dagi naqsh payload'larni **TypeScript interfeysi** deb e'lon qiladi — global
`ValidationPipe` esa metatipi `Object` bo'lgan parametrni **butunlay tekshirmaydi**. Ya'ni 16 ta
hodisa hech qanday validatsiyasiz ketardi. `CLAUDE.md` har endpointdan DTO talab qiladi.

Har hodisa uchun class-validator DTO klassi, gateway'da aniq validatsiya
(`plainToInstance` + `validateOrReject`). Cheklovlar:

| Maydon | Chek |
|---|---|
| `sdp` | `@MaxLength(65536)` |
| `candidate` | `@MaxLength(512)` |
| `sdpMid` | `@MaxLength(32)` |
| `sdpMLineIndex` | `@IsInt() @Min(0) @Max(64)` |
| `callId`, `calleeId` | `@IsString() @Length(20, 32)` |

Server tomonida sanagichlar: har ishtirokchidan **≤150 ICE nomzod**, har qo'ng'iroqda **≤10
`renegotiate`**, har socket uchun hodisa tezligi chegarasi. Socket.IO `maxHttpBufferSize` aniq
qo'yiladi — hozir standart 1 MB, va har uzatilgan hodisa **Redis adapteri orqali barcha nusxalarga**
tarqaydi, ya'ni 1 MB nusxalar soniga ko'payadi.

### 6.4 Token yangiligi — uch xil siyosat

⚠️ `assertTokenFresh` ni hamma hodisaga qo'llash **jiddiy xato bo'lardi**: `JWT_ACCESS_TTL` = 15
daqiqa, qo'ng'iroq esa 4 soatgacha. 15-daqiqada foydalanuvchi «tashlash» tugmasini bosadi, server
`TOKEN_EXPIRED` bilan rad etadi, ikkinchi tomonga xabar bormaydi va **mikrofon bilan kamera 4 soatlik
taymer otilgunicha oqishda qoladi**. Xavfsizlik nazorati maxfiylik buzilishiga aylanadi.

| Hodisa turi | Siyosat |
|---|---|
| Holat yaratuvchi (`invite`, `accept`) | Yangi token **shart** — rad etish xavfsiz |
| Holat tugatuvchi (`end`, `cancel`, `decline`) | **Doim qabul qilinadi** — tugatish fail-safe |
| Qo'ng'iroq ichidagi (`ice`, `renegotiate`, `media-state`, `connected`) | Qo'ng'iroqning `max-duration` i doirasida qabul qilinadi |

Qo'shimcha `call:auth { token }` hodisasi — klient socket'ni uzmasdan `tokenExp` ni yangilaydi.

**Socket umri** (`/chat` ga ham tegishli, mavjud bo'shliq): hozir socket tokendan uzoq yashaydi va
`logout` uni uzmaydi — ya'ni bir marta o'g'irlangan token bilan ochilgan socket **abadiy**
`call:incoming` (ichida chaquvchining SDP'si va IP'lari) va `message:new` qabul qilaveradi.
`handleConnection` da `exp + grace` ga `disconnect` taymeri qo'yiladi va `logout` da Redis orqali
o'sha talabaning socket'lari uziladi.

### 6.5 Umumiy WS kodi

`ws-jwt.ts` va `chat.gateway.ts` dagi `personalRoom`, `userOf`, `toError`, `unauthorized`,
`assertTokenFresh` — jami ~40 qator sof, holatsiz kod. `calls/presentation` dan
`chat/infrastructure` ga murojaat qatlam yo'nalishini buzadi, nusxalash esa ikki joyda ajralib
ketadigan xavfsizlik mantig'ini qoldiradi. Ikkinchi haqiqiy chaqiruvchi paydo bo'ldi — shuning uchun
`src/common/websocket/` ga ko'chiriladi va ikkala gateway import qiladi. Bu spekulyativ abstraksiya
emas, ikkinchi chaqiruvchi keltirgan ekstraksiya.

`caller: StudentSummaryDto` va VoIP push uchun kerak bo'lgan nom/avatar —
`domain/student-directory.repository.ts` porti orqali (`connections` modulidagi `STUDENT_DIRECTORY`
naqshi).

### 6.6 Rate-limit — **1-bosqichda**, 3-bosqichda emas

⚠️ 1-tahrirda limiter 3-bosqichga qo'yilgan edi, VoIP push esa 2-bosqichda — ya'ni **qulflangan
iPhone'ni to'liq ekranli qo'ng'iroq bilan uyg'otish imkoniyati cheklovsiz** ishga tushardi.

`@nestjs/throttler` bu yerda ishlamaydi — u HTTP/IP darajasida, `@SubscribeMessage` ga ta'sir
qilmaydi. Redis `INCR` + `EXPIRE` bilan `CallsService` ichida:

| Chek | Qiymat |
|---|---|
| Bir chaquvchidan jami | 10 taklif / daqiqa (§16) |
| **Bir juftlik uchun** | 15 daqiqada 3 ta javobsiz taklif, so'ng chaqirilgan o'zi harakat qilmaguncha sovish |
| `CANCELED` takliflar | Juftlik byudjetiga **kiradi** — aks holda invite→cancel sikli bepul |
| Kunlik | Bir juftlik uchun `MISSED`/`DECLINED` chegarasi, so'ng bloklash oqimi taklif qilinadi |

Juftlik chegarasi — ta'qibga qarshi haqiqiy himoya; 10/daqiqa global chegara bitta qurbonga soatiga
600 marta jiringlash imkonini beradi.

### 6.7 Xato kodlari

Mavjudlari qayta ishlatiladi: `NOT_CONNECTED`, `USER_BLOCKED` (yangi sinonim `BLOCKED`
**qo'shilmaydi** — bitta ma'no ikki kod bo'lmasin; §12.3.1 dagi nom bilan farqi mobil jamoaga
aytiladi), `FORBIDDEN`, `TOKEN_EXPIRED`, `VALIDATION_ERROR`, `RATE_LIMITED`.

Yangilari: `CALL_NOT_FOUND`, `CALL_BUSY`, `INVALID_CALL_STATE`.

### 6.8 Uzilish

`disconnect-grace` `call:{callId}:present:{studentId}` kalitini o'qiydi (§4.4) — ya'ni «qaysi socket»
degan noaniqlik yo'q va foydalanuvchining boshqa qurilmasi ulangan bo'lsa qo'ng'iroq o'lmaydi.

Nusxa `SIGKILL` bo'lsa `handleDisconnect` umuman ishlamaydi va grace job qo'yilmaydi — bu holatni
§11 dagi rekonsiliatsiya cron'i yopadi.

## 7. Chatdagi yozuv

### 7.1 Snapshot ustunlar (chetlashish #2)

Qo'ng'iroq tugagach `CALL` turidagi xabar yaratiladi. Ma'lumot `Message` ustunlariga **snapshot**
qilinadi (§4.2), `Call` ga JOIN qilinmaydi:

- Ishtirokchi hisobi o'chirilsa `Call` cascade bilan ketadi, xabar esa qoladi — JOIN'da mobil klient
  bo'sh «qo'ng'iroq» pufakchasini ko'rardi.
- Chat moduli `calls` modulini import qilmaydi → sikl yo'q.
- Tarixni o'qishda qo'shimcha JOIN kerak emas.

Bu `replyTo*` (`schema.prisma:1037`) va `sticker*` (`:1020`) ustunlari bilan aynan bir xil naqsh va
o'sha yerdagi izohda sababi ham shunday yozilgan.

`MessageDto.call` — `{ callId, media, status, durationMs, endReason }`.

### 7.2 Modullar orasidagi bog'lanish

`CallEndedBus` (`calls/application/`) — `MediaReadyBus` (`media/application/media-ready.bus.ts`) ning
aynan nusxasi; u ham xuddi shu sabab bilan yaratilgan («a port injected the other way round would
make the two modules import each other»). `ChatGateway.onModuleInit` unga obuna bo'ladi va
`ChatService.appendCallMessage(...)` ni chaqiradi.

`seq` poygasi **yo'q** — `appendMessage` `Conversation.nextSeq` ni `$transaction` ichida oshiradi
(`chat.prisma.repository.ts:167`) va orqasida `@@unique([conversationId, seq])` turadi. Shart:
`CALL` xabar **aynan `appendMessage` orqali** yozilishi kerak, yangi insert yo'li bilan emas.

### 7.3 Klient `CALL` xabar yubora olmasligi

⚠️ `ChatService.sendMessage` faqat `SYSTEM` ni bloklaydi (`chat.service.ts:88`), `toMessageType`
(`chat.gateway.ts:429`) esa enum'dagi har qiymatni qabul qiladi. `CALL` enum'ga qo'shilishi bilan
klient `message:send { type: "CALL" }` yuborib **soxta qo'ng'iroq tarixi** yasay oladi.

`CALL` `SYSTEM` bilan birga rad etiladigan ro'yxatga qo'shiladi — **WS va REST yo'llarining
ikkalasida ham**.

### 7.4 O'qilmaganlar

⚠️ O'qilmagan hisobi `seq > cursor AND sender_id != me` (`chat.prisma.repository.ts:404`). §14.2
faqat **`MISSED`** qo'ng'iroq o'qilmagan bo'lishini so'ragan, lekin §7 barcha `CALL` xabarlarga
`senderId = callerId` qo'yadi — ya'ni javob berilgan, tugagan 3 daqiqalik suhbat ham chaqirilganning
badge'ini ko'taradi.

Qoida: `MISSED` bo'lmagan `CALL` xabarlar chaqirilgan uchun insert paytida o'qilgan deb belgilanadi.

`MISSED` uchun oddiy push: «📞 Javobsiz qo'ng'iroq». `pushTextFor` (`chat.gateway.ts:443`) — to'liq
`switch`, ya'ni `CALL` qo'shilishi kompilyatsiya xatosi beradi va e'tibordan chetda qolmaydi. Xuddi
shu ikkinchi bepul darvoza: `REQUIRED_KIND` (`chat/domain/message-composition.ts:14`). Eski nusxada
`undefined` qaytmasligi uchun `default: return 'Xabar';` qo'shiladi.

## 8. VoIP push (§13)

### 8.1 Kanal ajratish — majburiy

⚠️ `DeviceTokenRepository.tokensFor(studentId)` **barcha** tokenlarni qaytaradi va
`NotificationsService.pushToStudent` hammasiga yuboradi. `APNS_VOIP` qatorlari paydo bo'lishi bilan
oddiy «Yangi xabar» **VoIP kanalidan** ketadi — §13.2 esa aniq aytadi: `reportNewIncomingCall` bilan
javob berilmagan VoIP push **ilovani o'ldiradi**.

Shuning uchun `tokensFor(studentId, tokenType)` va `pushToStudent` da filtr — **2-bosqichda,
ustun bilan birga**, keyinroq emas.

### 8.2 Yo'naltirish

| Platforma | Transport | Muhim |
|---|---|---|
| iOS | to'g'ridan-to'g'ri APNs HTTP/2 | `apns-push-type: voip`, `apns-priority: 10`, `apns-topic: <bundleId>.voip`, p8 JWT |
| Android | FCM, **data-only** | `android.priority: high`, `notification` bloki **bo'lmasin** |

⚠️ Mavjud `FcmPushProvider.buildMessage` (`fcm-push.provider.ts:137`) **doim** `notification` bloki
yuboradi, `PushProvider` porti esa `title`/`body` ni majburiy qiladi. Ya'ni «mavjud provayderni
qayta ishlatamiz» deyish §13.3 ni buzadi. Port data-only rejim oladi (`PushNotification.data` bilan
`title`/`body` ixtiyoriy) — bu **umumiy portga o'zgarish**, chat push yo'liga ham tegadi, shuning
uchun regressiya testi bilan.

APNs provayder JWT'ni **keshlaydi** (~40 daqiqa), har push uchun yangisini yasamaydi — aks holda
APNs `TooManyProviderTokenUpdates` qaytaradi va qo'ng'iroqlar tushadi. `APNS_PRIVATE_KEY` ko'p
qatorli PEM; `\n` ni ochish `fcm-push.provider.ts:44` da qilingandek.

### 8.3 Bekor qilish (chetlashish #6)

⚠️ §13.4 «darhol VoIP bekor push'i» deydi. APNs VoIP push'larni tartiblamaydi — bekor push'i invite
push'idan **oldin** yetib borsa, ilova uyg'onadi va hisobot berishga hech narsa topmaydi. iOS ilovani
o'ldiradi; takrorlansa **o'sha qurilmaga VoIP yetkazishni butunlay to'xtatadi**. Ya'ni:
invite → 100 ms ichida cancel → takrorlash = qurbonning telefonida **boshqa hech qachon qo'ng'iroq
jiringlamaydi**, tuzatish uchun ilovani qayta o'rnatish kerak.

Qoida: bekor xabari **VoIP kanalidan ketmaydi** — oddiy background push yoki socket orqali, klient
esa CallKit'ning standart «report qil, so'ng darhol tugat» naqshini bajaradi. Qo'shimcha: invite
push'i haqiqatan yuborilmagan bo'lsa bekor push'i umuman yuborilmaydi, va ular orasida minimal ~2
soniya oralig'i. `CallPushService` uchun alohida unit test.

### 8.4 Provayder tanlash va token egaligi

`VOIP_PUSH_PROVIDER` = `dev | apns`; productionda `dev` bo'lsa har bootda ERROR log, bootni
to'xtatmaydi — mavjud `createPushProvider` naqshi.

⚠️ `DELETE /v1/devices/:token` tokenni **URL yo'lida** olib yuradi va pino `autoLogging` URL'larni
yozadi → tokenlar log'ga tushadi. `upsert({ where: { token }, update: { studentId } })` esa tokenni
ro'yxatdan o'tkazgan har kimga biriktiradi. VoIP tokenlar shu yo'ldan o'tsa: hujumchi qurbonning
VoIP tokenini o'z hisobiga bog'lab, qurbonning qo'ng'iroqlarini **jimlatadi**, o'zi qilgan
qo'ng'iroqlar esa qurbonning qulflangan ekranida to'liq ekranli jiringlaydi.

Tuzatish: `DELETE` da token **body**da; qayta biriktirish qoladi (qurilma qo'l almashtirishi mumkin)
lekin xavfsizlik hodisasi sifatida log qilinadi; `APNS_VOIP` faqat `platform: IOS` uchun qabul
qilinadi.

## 9. TURN / ICE (§11)

### 9.1 `GET /v1/calls/ice-servers`

```
username   = "<unixTimestamp + ttl>:<studentId>"
credential = base64( HMAC_SHA1( TURN_STATIC_SECRET, username ) )
```

HMAC-SHA1 — coturn'ning `use-auth-secret` protokoli
(draft-uberti-behave-turn-rest-00), **boshqasini qabul qilmaydi**. SHA-1 ning to'qnashuv
zaifliklari HMAC'ga taalluqli emas. Buni SHA-256 ga «yangilash» kerak emas.

Lekin nima ekanini aniq bilib turaylik: bu — **relay tarmoq kengligiga bearer capability**, aniq
qo'ng'iroqqa yoki peer'ga bog'lanmagan. Shuning uchun: `@UseGuards(JwtAuthGuard, StudentGuard)`,
`studentId` **faqat `@CurrentUser()` dan** (query/body'dan emas), `@Throttle(10/daqiqa)`. coturn
tomonda `user-quota` 12 emas **~4** (2 ta parallel qo'ng'iroq) — bitta suiiste'molchi global
`total-quota` ni yeb, hammaga relay'ni to'sib qo'ymasin.

### 9.2 IP maxfiyligi — hal qilinishi kerak

⚠️ TURN majburlanmasa, WebRTC ikkala tomonning **umumiy IP manzilini** bir-biriga ochadi. Bu yerda
offer **taklif bilan birga** ketadi (§12.2) va `call:incoming` uni chaqirilganning barcha
qurilmalariga yuboradi — ya'ni **chaqirilgan javob bermasa ham, hatto rad etsa ham, chaquvchining IP
si unga yetib boradi**. IP → provayder + shahar. Talabalar ko'pincha bir-birini tanimaydi.

✅ **Qaror qabul qilindi: `relayOnly` maydoni qo'shiladi va yangi juftlik uchun TURN majburiy.**

- `ice-servers` javobiga va `call:incoming` / `call:accepted` ga `relayOnly: boolean` maydoni —
  **1-bosqichda**, chunki bu protokol maydoni va keyin qo'shish klient uchun buzuvchi o'zgarish.
- Server qoidasi: juftlik orasida **avval tugallangan qo'ng'iroq bo'lmagan** bo'lsa `relayOnly: true`.
  Bir marta muvaffaqiyatli gaplashgandan keyin P2P ga ruxsat beriladi (ular bir-birini biladi).
- Foydalanuvchi sozlamasi («IP manzilimni yashirish», sukut bo'yicha yoqilgan) — **3-bosqichda**,
  chunki u yangi profil maydonini talab qiladi.
- Halol klient relay-only rejimida host/srflx nomzodlarini umuman chiqarmaydi — ya'ni himoya
  peer'ning xatti-harakatiga bog'liq emas.
- Server tomonda qo'shimcha: siyosat `relay` bo'lganda relay bo'lmagan nomzodlar uzatishda
  **tashlab yuboriladi**. Bu «server ICE'ga tegmaydi» qoidasi (§6.2) egiladigan yagona joy — va bu
  **filtr**, qayta yozish emas, ya'ni Opus/H.264 kafolatlariga ta'sir qilmaydi.

**Narxi ochiq aytilsin:** yangi juftliklarda butun media TURN orqali oqadi (faqat signalizatsiya
emas). TURN trafigi va coturn server xarajati sezilarli oshadi. Bu ongli savdo: talabalar ko'pincha
bir-birini tanimaydi va IP → provayder + shahar demakdir.

### 9.3 coturn — `denied-peer-ip` to'liq ro'yxati

⚠️ Manba spec'idagi (§11.1) ro'yxat faqat RFC1918 + loopback'ni yopadi. Yetishmayotganlar:

| Diapazon | Nima uchun |
|---|---|
| **`169.254.0.0/16`** | Bulut **metadata** endpointi (`169.254.169.254`). TURN hisobiga ega har kim relay ochib, TURN xostidan metadata xizmatiga murojaat qilib **IAM kalitlarini o'qiy oladi** |
| **Butun IPv6** (`::1`, `fc00::/7`, `fe80::/10`, `::ffff:10.0.0.0/104`) | Dual-stack xostda butun IPv4 deny ro'yxati chetlab o'tiladi |
| `0.0.0.0/8`, `100.64.0.0/10` (CGNAT) | — |
| TURN xostining o'z umumiy IP'si | O'ziga relay sikli |

Qo'shimcha: `no-tcp-relay` (TCP relay zarurligi isbotlanmaguncha), coturn API/DB/metadata'ga
marshruti bo'lmagan tarmoq segmentida. `deploy/coturn/README.md` da bu **deploy'ni bloklovchi
ro'yxat** sifatida yoziladi.

`static-auth-secret` repoda **placeholder** bo'ladi, deploy paytida env'dan render qilinadi.

**443/TCP (TLS)** — talabalar universitet tarmog'idan qo'ng'iroq qiladi, u yerda odatda faqat 443
ochiq. Busiz qo'ng'iroqlarning bir qismi umuman ulanmaydi.

### 9.4 Env o'zgaruvchilari

| Bosqich | O'zgaruvchilar |
|---|---|
| 1 | `TURN_HOST`, `TURN_STATIC_SECRET`, `TURN_TTL_SECONDS` (default 3600) |
| 2 | `VOIP_PUSH_PROVIDER`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID` |

⚠️ `env.ts` da xavfli naqsh bor: `JWT_ACCESS_SECRET: z.string().min(1).default('change-me-access')`
(`env.ts:24`) — o'zgaruvchini unutgan production **hammaga ma'lum kalit bilan** ko'tariladi. Yangi
sirlar buni nusxalamaydi: `.optional()` + mavjud `superRefine` (`env.ts:96`) da productionda qattiq
xato. JWT sirlarini ham shu yo'l bilan tuzatish kerak — bu alohida, o'z holicha kritik masala.

## 10. REST endpointlar

| Endpoint | Nima | Xavfsizlik |
|---|---|---|
| `GET /v1/calls/ice-servers` | Vaqtinchalik TURN hisobi | Guard + throttle + `@CurrentUser()` (§9.1) |
| `GET /v1/calls?page=1&size=20` | Qo'ng'iroqlar tarixi | Filtr **repozitoriyda**: `callerId = me OR calleeId = me` |
| `POST /v1/calls/{id}/stats` | Telemetriya | Ishtirokchi bo'lmasa 403; DTO chegaralari majburiy |
| `POST /v1/reports` (`+callId`) | Qo'ng'iroq ustidan shikoyat | Shikoyatchi o'sha qo'ng'iroq ishtirokchisi bo'lishi shart |

**`GET /v1/calls` indeks haqiqati.** `WHERE caller_id = $1 OR callee_id = $1 ORDER BY started_at
DESC` — PostgreSQL `BitmapOr` qilib, so'ng **aniq `Sort`** bajaradi; kompozit indekslarning
`started_at` qismi tartib uchun ishlatilmaydi. Shuning uchun repozitoriy **ikkita tartiblangan
indeks skanini** `UNION ALL` bilan birlashtiradi va ≤2×N natijani qayta saralaydi. Shundagina
`@@index([callerId, startedAt])` o'z narxini oqlaydi. `total` uchun `count(*)` arzon — u
foydalanuvchining qatorlari bilan chegaralangan.

**`POST /v1/calls/{id}/stats` DTO chegaralari** — `rttMs`, `packetsLost`, `jitterMs`, `packetsReceived`
Prisma `Int` (int4). Cheklovsiz klient soni **500 xato** beradi: `@IsInt() @Min(0) @Max(...)`.
`candidateType` — enum, erkin satr emas. Bularning barchasi **ishonchsiz, o'zi haqida o'zi aytgan
telemetriya** — moderatsiya yoki hisob-kitobga hech qachon kirmaydi.

⚠️ **`POST /v1/reports` ni kengaytirish ko'ringanidan kattaroq ish.**
`reports.service.ts:42` da nishonni tekshirish `(targetStudentId === null) === (messageId === null)`
— ikkita nishon uchun yozilgan XOR. Uchinchisi qo'shilishi bilan: faqat `callId` bo'lgan shikoyat
**rad etiladi**, `{targetStudentId, callId}` esa **o'tib ketadi**. «Uchtadan aniq bittasi» deb qayta
yozilishi kerak; `findOpenReport` dedupe kaliti ham, `CreateReportDto` ham, `Report` entity/DTO ham
tegiladi.

Hammasi `BaseResponse` konvertida; har endpoint `@ApiTags`/`@ApiOperation`/`@ApiResponse` bilan.

## 11. Rekonsiliatsiya — Redis va Postgres ajralib ketganda

⚠️ 1-tahrirda bu umuman yo'q edi. Ajralish yo'llari: Redis restart (`docker-compose.yml` da
`appendonly` **yoqilmagan** — RDB standart siyosati bilan 60 soniyagacha yozuv yo'qoladi, jumladan
BullMQ kechiktirilgan joblari); job tugab qolishi; kalit evikatsiyasi.

Har holatda natija bir xil: `call:end` keladi, Redis'da holat yo'q, `CALL_NOT_FOUND` qaytadi, va
Postgres qatori **abadiy `RINGING`** bo'lib qoladi — foydalanuvchining tarixida to'xtovsiz
jiringlayotgan qo'ng'iroq turadi.

Uchta chora:

1. **Cron backstop** (`src/cron/call-reconciliation.cron.ts` — `story-cleanup.cron.ts` naqshi):
   `status IN ('RINGING','CONNECTING','ACTIVE') AND started_at < now() - interval '4 hours'` →
   `FAILED`. Bu rad etilgan B variantning sweeper'i, lekin **zaxira sifatida**, UX taymeri sifatida
   emas — §2.1 dagi e'tiroz bunga taalluqli emas.
2. **`@@index([status, startedAt])`** (§4.1) — usiz sweep butun `calls` ni skanerlaydi. Haqiqiy
   partial indeks to'g'riroq bo'lardi, lekin **Prisma 5 uni ifodalay olmaydi** va keyingi
   `migrate dev` uni drift deb o'chirishga urinadi.
3. **Shartli terminal yozuvlar.** Har terminal `UPDATE` `WHERE id = $1 AND status IN (...)` bilan —
   hech qachon read-modify-write emas. 44.9-soniyada kelgan `call:accept` va 45-soniyada otilgan
   `ring-timeout` poygasida `MISSED` `ACTIVE` ustiga yozilmasin. Shu qoida takroriy `call:end` ni
   ham baza darajasida idempotent qiladi.

Qo'shimcha: `docker-compose.yml` da Redis uchun `appendonly yes` yoqilsin, va BullMQ uchun **alohida
Redis logical DB** — qo'ng'iroq suiiste'moli OTP holatini siqib chiqarmasin.

## 12. Testlar

**Unit (mock portlar, DB va Redis yo'q):**
- `call-state-machine` — barcha qonuniy/noqonuniy o'tishlar; `(status, endReason)` matritsasi
- `glare.ts` — `CLAIM` / `PREEMPT` / `BUSY`; teskari juftlik sharti; `RINGING` sharti; uchinchi shaxs
  urinishi; ikki xil qo'ng'iroq ikki kalitni band qilgan holat
- `ice-credentials` — HMAC ma'lum vektorga mosligi, TTL
- `CallsService` — **har hodisa uchun «begona odam qila olmaydi»** (§6.0 matritsasi); ruxsat;
  `conversationId` klientdan olinmasligi; band; ko'p qurilmada birinchi accept; terminal holatda
  takroriy `end` jim o'tishi
- `CallPushService` — iOS→VoIP, Android→data-only, bekor push'i VoIP'dan ketmasligi va invite'dan
  oldin ketmasligi
- Rate limiter — juftlik chegarasi, cancel siklining hisoblanishi

**E2E** (`test/chat-ws.e2e-spec.ts` da real `socket.io-client` bilan ishlaydigan harness bor):
- to'liq qo'ng'iroq: invite → ringing → accept → connected → ice → end → chatda `CALL` xabar
- javobsiz: `MISSED` + o'qilmaganga qo'shilishi + push; javob berilgan qo'ng'iroq o'qilmagan **emas**
- rad etish, bekor qilish, band
- `GET /v1/calls` faqat o'z qo'ng'iroqlarini qaytarishi, tartibi, sahifalashi
- `message:send { type: "CALL" }` rad etilishi

⚠️ **Taymer testlari Jest fake timer bilan ishlamaydi** — kechikish BullMQ ichida, Redis'da.
Job handler'i to'g'ridan-to'g'ri chaqiriladi.

## 13. Bosqichlar

| # | Nima | Natija |
|---|---|---|
| **1** | Prisma (`Call`, `CallStat`, enumlar, `MessageType.CALL`, `Message` snapshot ustunlari, `Conversation.calls`, migratsiya `lock_timeout` bilan) · umumiy WS kodi `src/common/websocket/` ga · `calls` moduli · 16 hodisa · **§6.0 avtorizatsiya matritsasi** · payload DTO'lari va cheklari · state machine · glare · taymerlar · **rate-limit** · token siyosati · `CallEndedBus` + chatdagi yozuv · `message:send type=CALL` bloki · rekonsiliatsiya cron · `GET /v1/calls` · `GET /v1/calls/ice-servers` · coturn konfiguratsiyasi · `docs/architecture/calls.md` | Ilova **ochiq** bo'lganda qo'ng'iroq to'liq va xavfsiz ishlaydi |
| **2** | `DeviceToken.tokenType` · **`tokensFor(studentId, tokenType)` filtri** · `PushProvider` data-only rejimi · `VoipPushProvider` porti · APNs HTTP/2 provayderi (JWT keshi bilan) · `CallPushService` · invite push · bekor push'i (VoIP'dan **emas**) · `DELETE /v1/devices` tokenni body'ga | Ilova **yopiq** bo'lganda jiringlaydi |
| **3** | `POST /v1/calls/{id}/stats` · `Report.callId` + XOR tuzatish · «IP manzilimni yashirish» profil sozlamasi · RUNBOOK · `npm run openapi:dump` | Sayqal va kuzatuv |

1-bosqichga `relayOnly` maydoni **ham kiradi** (protokol maydoni — keyin qo'shish klientni buzadi),
`call:connected` ham (16-hodisa).

Rate-limit 1-bosqichda — VoIP push'idan **oldin**.

## 14. Qamrovdan tashqari, lekin yo'lda ko'ringan

Bular bu ishning qismi emas; alohida hal qilinsin:

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` ning `.default('change-me-...')` qiymati (`env.ts:24`)
- `logout` socket'larni uzmaydi va token versiyasi yo'q (`/chat` ga hozir ham tegishli)
- `reports.message_id` va `reports.reporter_id` da indeks yo'q
- `CLAUDE.md` modul ro'yxati `chat` va `notifications` ni «ishlatilmaydi» deb ko'rsatadi — real
  holatga zid

## 15. Qabul mezonlari

**Funksional**
- [ ] Ikki qurilma orasida audio va video qo'ng'iroq ulanadi, tovush/tasvir o'tadi
- [ ] Cheklovchi tarmoqda (faqat 443 ochiq) TURN orqali ulanadi
- [ ] 45 s javob bo'lmasa `MISSED`, chatda yozuv, o'qilmaganlarga qo'shiladi, push ketadi
- [ ] **Javob berilgan qo'ng'iroq o'qilmagan sanoqni ko'tarmaydi**
- [ ] Ikkinchi qurilmada javob berilganda birinchisi `call:taken` oladi; **javob bergan qurilma
      `call:taken` olmaydi**
- [ ] Ilova yopiq iPhone'da qulflangan ekranda jiringlaydi (CallKit)
- [ ] Chaquvchi tashlasa telefon darhol jiringlashdan to'xtaydi
- [ ] Wi-Fi → mobil almashuvida qo'ng'iroq uzilmaydi (ICE restart)
- [ ] `GET /v1/calls` tarixni to'g'ri tartibda va sahifalab qaytaradi

**Xavfsizlik** *(1-tahrirda yo'q edi)*
- [ ] Ishtirokchi bo'lmagan foydalanuvchi `callId` ni bilsa ham qo'ng'iroqni **qabul qila,
      tugata, ICE yubora yoki renegotiate qila olmaydi** — 403
- [ ] `call:accept` faqat chaqirilgandan, `call:cancel` faqat chaquvchidan qabul qilinadi
- [ ] Klient yuborgan `conversationId` e'tiborsiz qoldiriladi; begona suhbatga `CALL` xabar
      tushmaydi
- [ ] `message:send { type: "CALL" }` rad etiladi (WS va REST)
- [ ] Bog'lanmagan yoki bloklangan foydalanuvchiga qo'ng'iroq qilib bo'lmaydi
- [ ] Token muddati tuganda ham foydalanuvchi qo'ng'iroqni **tashlab yubora oladi**
- [ ] Juftlik rate-limiti takroriy jiringlatishni to'xtatadi
- [ ] Bekor push'i VoIP kanalidan ketmaydi
- [ ] `GET /v1/calls` boshqaning qo'ng'irog'ini qaytarmaydi
- [ ] SDP va ICE nomzodlari hech qanday log darajasida ko'rinmaydi
- [ ] Avval gaplashmagan juftlikda `relayOnly: true` qaytadi va **IP manzil ochilmaydi**; bir marta
      tugallangan qo'ng'iroqdan keyin P2P ga o'tadi

**Ishonchlilik**
- [ ] Redis yo'qolgan qo'ng'iroq 4 soatdan keyin cron bilan `FAILED` bo'ladi, `RINGING` qolmaydi
- [ ] Terminal yozuvlar shartli — `accept` va `ring-timeout` poygasida holat buzilmaydi
- [ ] Barcha javoblar `BaseResponse` konvertida; `npm run openapi:dump` toza spec beradi

## 16. Ko'rik tarixi

**2-tahrir (2026-08-01)** — `reviewer`, `security-engineer`, `database-architect` mustaqil ko'rigi.
Qabul qilingan asosiy tuzatishlar:

| Manba | Tuzatish |
|---|---|
| security | §6.0 — har hodisada ishtirokchi tekshiruvi va rol matritsasi (1-tahrirda `call:accept` ni begona odam yubora olardi → jonli media tinglash) |
| security | §6.1.2 — `conversationId` server tomonda topiladi (begona suhbatga xabar in'ektsiyasi) |
| security | §9.3 — `denied-peer-ip` ga `169.254.0.0/16` va IPv6 (bulut metadata SSRF) |
| security | §6.4 — token siyosati uchga bo'lindi (aks holda «tashlash» ishlamay, mikrofon oqib turardi) |
| security | §8.3 — bekor push'i VoIP kanalidan chiqarildi (PushKit qoidasi buzilishi → qurilmada VoIP butunlay o'chishi) |
| security | §6.6 — rate-limit 3-bosqichdan 1-bosqichga; juftlik chegarasi qo'shildi |
| security | §6.3 — WS payload validatsiyasi va o'lchov cheklari (global `ValidationPipe` interfeys payload'ni tekshirmaydi) |
| security | §9.2 — IP maxfiyligi masalasi ko'tarildi (qaror kutilmoqda) |
| reviewer | §7.3 — `message:send { type: "CALL" }` bloklanadi |
| reviewer | §8.1 — VoIP tokenlar oddiy push'dan ajratiladi |
| reviewer | §8.2 — `PushProvider` data-only rejimi (mavjud provayder Android VoIP'ni qila olmaydi) |
| reviewer | §7.2 — `CallEndedBus` bilan modul sikli hal qilindi |
| reviewer | §5.1 — `CONNECTING` holati (`connect-timeout` aks holda hech qachon ishlamaydi) |
| reviewer | §7.4 — faqat `MISSED` o'qilmagan bo'ladi |
| reviewer | §6.5 — umumiy WS kodi `src/common/websocket/` ga |
| reviewer + security | §5.3 — glare'da teskari-juftlik sharti |
| db | §4.2 — `Conversation.calls` (usiz Prisma kompilyatsiya qilmaydi) |
| db | §11 — rekonsiliatsiya cron + `@@index([status, startedAt])` + shartli terminal yozuvlar |
| db | §4.5 — migratsiyada `lock_timeout` (FK `messages` ni qulflaydi) |
| db | §2.2 #4 — `tokenType` taxmini `FCM` (aks holda mavjud iOS push'i o'ladi) |
| db | §4.3 — telemetriya alohida jadvalga (ikki ishtirokchi, har xil metrika) |
| db | §4.1 — `durationMs` olib tashlandi, `endedBy` → enum, `updatedAt` qo'shildi |

## 17. Mobil jamoaga aytiladigan o'zgarishlar

Bu dizayn manba spec'iga ikkita **protokol qo'shimchasi** kiritadi. Ikkalasi ham 1-bosqichda
yetkaziladi va klient regeneratsiyasini talab qiladi:

| O'zgarish | Nima uchun |
|---|---|
| **16-hodisa `call:connected`** | Klient ICE ulanishi `connected` bo'lganda yuboradi. `CONNECTING → ACTIVE` o'tishi va §12.4 dagi «accept'dan keyin 30 s» taymeri shunga tayanadi (§5.1) |
| **`relayOnly: boolean`** — `ice-servers` javobida va `call:incoming`/`call:accepted` da | `true` bo'lsa klient `iceTransportPolicy: "relay"` bilan ishlaydi va host/srflx nomzodlarini chiqarmaydi. Yangi juftlik uchun server `true` qaytaradi — IP manzil ochilmaydi (§9.2) |

Qolgan chetlashishlar §2.2 jadvalida.
