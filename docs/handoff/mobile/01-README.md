# Chat — backend o'zgarishlari (mobil jamoa uchun)

Bu papka `CHAT_MEDIA_AND_CALLS_BACKEND.md` hujjatingizga javoban qilingan **barcha** backend
ishlarini o'z ichiga oladi. Boshqa hech qayerga qarash shart emas.

Sana: 2026-07-29. Branch: `fix/chat-phase0-mobile-feedback`.

## Nima o'qish kerak

| Fayl | Nima uchun |
|---|---|
| **`02-API-CHANGES.md`** | Asosiy hujjat. Sizning §17/§18/§19 bandlaringizning **har biri** bo'yicha holat, o'zgargan kontrakt va yangi endpointlarning to'liq tavsifi |
| **`03-WEBSOCKET.md`** | `/chat` WS protokoli. **Swagger'da yo'q** — generatsiya qilingan klient buni bilmaydi, qo'lda yoziladi |
| **`04-GIF-INTEGRATION.md`** | GIF paneli: provayder, atribut majburiyati, xatolar |
| **`student-api.json`** | OpenAPI 3.0 — **Kotlin klientini shundan generatsiya qiling** |

## Eng qisqa xulosa

**Bajarildi:**

- **C qism (§17) to'liq** — `clientMsgId`, `TOKEN_EXPIRED`, `hasMore`, `/delivered`, suhbatlar
  tartibi, `read`/`delivered` ack'lari, `reports` tekshiruvi
- **§18 dan 4 ta endpoint** — xabar o'chirish, bitta suhbat, bloklanganlar ro'yxati, unread-count
- **§19 spec sifati to'liq** — pastda alohida
- **A qism (media) to'liq** — rasm, GIF, video, ovoz, fayl, stiker, albom, `media:ready`

**Bajarilmagan:**

- **B qism (qo'ng'iroq)** — boshlanmagan. Sabab: push provayderi hozir faqat log yozadigan stub,
  ya'ni **bugun hech qanday push haqiqiy qurilmaga bormaydi**. Real FCM/APNs qo'ng'iroqdan oldin
  yozilishi kerak. coturn ham ko'tarilmagan
- **§18 dagi qolganlari** — tahrirlash, arxiv, qidiruv, reply, reaksiya, forward, guruh. Talab
  qilinmagan, ro'yxatga olingan

## §19 — codegen endi toza

- Ikkala hujjatda ham tipsiz `{"type":"object","nullable":true}` **0 ta qoldi** (avval 176 ta edi)
- Butun sonlar `integer/int32` (pul — `int64`) — har bir hujjatda 117 ta maydon
- `MessageDto.body` endi spec'da ham `string`
- Nullable `$ref` lar `allOf` ichida

**`cleanSwagger` Gradle taskini olib tashlashingiz mumkin.** Regressiya qaytmasligi uchun backendda
guard testi turibdi — noto'g'ri tipdagi yangi DTO qo'shilsa, test qizil bo'ladi.

## Sizga bog'liq ikkita ish

1. **Optimistik xabarni `clientMsgId` bo'yicha moslashtirishga o'tish** — matn bo'yicha emas.
   Batafsil: `03-WEBSOCKET.md`. Bu sizning §17.1 dagi xatoyingizni yopadi
2. **GIF panelida atribut** — `04-GIF-INTEGRATION.md`

## Tekshirilganlik holati

Backend **haqiqiy baza bilan tekshirildi**: 11 e2e suite / 114 test o'tdi, migratsiyalar qo'llandi.
Bu yerda tasvirlangan har bir yangi endpoint va xatti-harakat e2e test bilan qoplangan.

Unit testlar: 808 ta, tiplar va build toza.

⚠️ Bir narsa qoldi: **serverdagi Docker image `ffmpeg` bilan qayta qurilishi kerak**. Busiz rasm
yuklash ishlaydi, lekin GIF, video va ovoz ish vaqtida yiqiladi. Integratsiyani boshlashdan oldin
backend jamoasidan buni so'rang.

Nima qolganining to'liq ro'yxati backend repo'sida: `docs/handoff/PENDING_ACTIONS.md` — u
backend/DevOps uchun va bu papkaga ataylab kiritilmagan.
