# Chat — backend o'zgarishlari (mobil jamoa uchun)

Bu papka `CHAT_MEDIA_AND_CALLS_BACKEND.md` hujjatingizga javoban qilingan **barcha** backend
ishlarini o'z ichiga oladi. Boshqa hech qayerga qarash shart emas.

Sana: **2026-07-31 — hammasi production'da** (`api.studentclub.uz`). Branch: `main`.

## Nima o'qish kerak

| Fayl | Nima uchun |
|---|---|
| **`02-API-CHANGES.md`** | Asosiy hujjat. Sizning §17/§18/§19 bandlaringizning **har biri** bo'yicha holat, o'zgargan kontrakt va yangi endpointlarning to'liq tavsifi |
| **`03-WEBSOCKET.md`** | `/chat` WS protokoli. **Swagger'da yo'q** — generatsiya qilingan klient buni bilmaydi, qo'lda yoziladi |
| **`04-GIF-INTEGRATION.md`** | GIF paneli: provayder, atribut majburiyati, xatolar |
| **`05-PUSH-SETUP.md`** | Push: Firebase loyihasi, APNs kaliti, `/v1/devices`, payload shakli. **Sizda bajarilmagan ish shu yerda** |
| **`student-api.json`** | OpenAPI 3.0 — **Kotlin klientini shundan generatsiya qiling** |

## Eng qisqa xulosa

**Bajarildi:**

- **C qism (§17) to'liq** — `clientMsgId`, `TOKEN_EXPIRED`, `hasMore`, `/delivered`, suhbatlar
  tartibi, `read`/`delivered` ack'lari, `reports` tekshiruvi
- **§18 dan 4 ta endpoint** — xabar o'chirish, bitta suhbat, bloklanganlar ro'yxati, unread-count
- **§19 spec sifati to'liq** — pastda alohida
- **A qism (media) to'liq** — rasm, GIF, video, ovoz, fayl, stiker, albom, `media:ready`

- **Push (§13 ning birinchi yarmi)** — real FCM provayderi yozildi va production'da ishlayapti
- **nginx WS upgrade (§17.2)** — qo'llandi, `ws: 101`. Chat endi haqiqiy WebSocket ustida

**Bajarilmagan:**

- **B qism (qo'ng'iroq)** — boshlanmagan. Qolgan bloklovchilar: **VoIP push (PushKit)** — buni FCM
  yubora olmaydi, alohida APNs adapteri kerak — va **coturn** serveri
- **§18 dagi qolganlari** — tahrirlash, arxiv, qidiruv, reply, reaksiya, forward, guruh. Talab
  qilinmagan, ro'yxatga olingan

## §19 — codegen endi toza

- Ikkala hujjatda ham tipsiz `{"type":"object","nullable":true}` **0 ta qoldi** (avval 176 ta edi)
- Butun sonlar `integer/int32` (pul — `int64`) — har bir hujjatda 117 ta maydon
- `MessageDto.body` endi spec'da ham `string`
- Nullable `$ref` lar `allOf` ichida

**`cleanSwagger` Gradle taskini olib tashlashingiz mumkin.** Regressiya qaytmasligi uchun backendda
guard testi turibdi — noto'g'ri tipdagi yangi DTO qo'shilsa, test qizil bo'ladi.

## Sizga bog'liq uchta ish

1. **Firebase sozlamasi** — Android va iOS ilovalarini `studentclub-191b0` loyihasiga qo'shish,
   iOS uchun APNs `.p8` kalitini yuklash, `/v1/devices` ga tokenni yuborish.
   **Busiz push umuman ishlamaydi.** Batafsil: `05-PUSH-SETUP.md`
2. **Optimistik xabarni `clientMsgId` bo'yicha moslashtirishga o'tish** — matn bo'yicha emas.
   Batafsil: `03-WEBSOCKET.md`. Bu sizning §17.1 dagi xatoyingizni yopadi
3. **GIF panelida atribut** — `04-GIF-INTEGRATION.md`

## Tekshirilganlik holati

Backend **haqiqiy baza bilan tekshirildi**: 11 e2e suite / 114 test o'tdi. Bu yerda tasvirlangan
har bir yangi endpoint va xatti-harakat e2e test bilan qoplangan. Unit testlar: 808 ta, tiplar va
build toza.

**Production'da tasdiqlangan (2026-07-31):**

| | |
|---|---|
| Migratsiyalar qo'llandi | 3 ta yangi |
| `ffmpeg` image ichida | `version 8.0.1` — GIF, video, ovoz ishlaydi |
| WebSocket | `ws: 101` (ilgari 400) |
| Yuklash hajmi chegarasi | 70 MB (64 MB video sig'adi) |
| FCM autentifikatsiyasi | `OK — project studentclub-191b0` |
| Yuklangan fayllar doimiyligi | volume qo'shildi |

⚠️ **Stiker paketlari hozircha bo'sh.** `GET /v1/stickers/packs` ishlaydi va to'g'ri shakl
qaytaradi, lekin tasvirlar hali tayyorlanmagan (512×512 WebP, Fluent Emoji / MIT). Panelni bo'sh
ro'yxatga chidamli qilib yozing — kontent keyinroq qo'shiladi va `version` o'zgaradi.

Nima qolganining to'liq ro'yxati backend repo'sida: `docs/handoff/PENDING_ACTIONS.md` — u
backend/DevOps uchun va bu papkaga ataylab kiritilmagan.
