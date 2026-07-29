# Kutayotgan amallar — kod bilan bajarib bo'lmaydiganlar

Chat Bosqich 0 / 2 / 3 ishlari davomida to'plangan, **odam qo'li bilan** bajarilishi kerak bo'lgan
ishlar. Har biri kimga tegishli va nima bloklanayotgani bilan.

Holat: 2026-07-29.

---

## 1. 🔴 Ma'lumotlar bazasi migratsiyalari — qo'llanmagan

Ikkita migratsiya yozilgan, lekin **hech qachon bazaga qo'llanmagan** (ishlab chiqish mashinasida
Docker ishlamayotgani uchun):

| Migratsiya | Nima qiladi |
|---|---|
| `20260729090000_message_soft_delete` | `messages.deleted_at` — bitta nullable ustun |
| `20260729120000_chat_media_and_stickers` | `media_assets`, `sticker_packs`, `stickers` jadvallari; `messages` ga `sticker_id`/`album_id`; 4 ta yangi enum |

```bash
docker compose up -d db          # yoki bazangizni ko'taring
npx prisma migrate deploy        # prod: hech qachon `migrate dev` emas
npx prisma generate
```

Ikkalasi ham qo'shuvchi (additive) — hech narsa o'chirilmaydi, jadval qayta yozilmaydi, uzoq qulf
yo'q. Eski kod yangi ustunlarni e'tiborsiz qoldiradi, ya'ni rolling deploy xavfsiz.

**Bloklaydi:** e2e testlar, media va o'chirish funksiyalarining ishlashi.

## 2. 🔴 E2E testlar — bir marta ham ishlamagan

`test/chat.e2e-spec.ts` da 24 ta test bor, shundan **15 tasi shu ishda yozilgan** va hech qachon
bajarilmagan (baza yo'q). Ular tipdan o'tgan, lekin bu ishlashini isbotlamaydi.

```bash
docker compose up -d db redis
npx prisma migrate deploy
npm run test:e2e
```

Bu **birinchi navbatdagi ish** — unit testlar (738 ta) yashil, lekin ular haqiqiy so'rov-javob
yo'lini, marshrut tartibini va Prisma so'rovlarini tekshirmaydi.

## 3. 🟠 Nginx — WebSocket upgrade

Konfiguratsiya tayyor: `deploy/nginx/socket-io.conf` + `deploy/nginx/README.md`.

```bash
sudo cp deploy/nginx/socket-io.conf /etc/nginx/snippets/socket-io.conf
# server { } bloki ichiga: include /etc/nginx/snippets/socket-io.conf;
sudo nginx -t && sudo systemctl reload nginx
```

Tekshirish (`101` kutiladi, `400` — qo'llanmagan):

```bash
curl -i -o /dev/null -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  'https://<host>/socket.io/?EIO=4&transport=websocket'
```

**Bloklaydi:** hozir chat long-polling ustida ishlayapti (batareya, kechikish); keyinchalik
qo'ng'iroq **umuman** ishlamaydi.

## 4. 🟠 Docker image'ni qayta qurish

`Dockerfile` ga **`ffmpeg`** qo'shildi (GIF→MP4, video probe/transkod, ovoz dekodi). Eski image
bilan rasm ishlaydi, qolgan hamma media ish vaqtida yiqiladi.

```bash
docker compose build app && docker compose up -d app
docker compose exec app ffmpeg -version   # tekshirish
```

Shuningdek `CHAT_MEDIA_DIR` (`./uploads/chat`) uchun **doimiy volume** kerak — konteyner qayta
ishga tushganda chat fayllari yo'qolmasin. `docker-compose.yml` da volume borligini tekshiring.

## 5. 🟡 Tenor API kaliti — GIF qidiruvi uchun

Batafsil qadamlar §7 da. Kalitsiz `GET /v1/gifs/search` **503** qaytaradi (kod yoziladi, faqat
ishlamaydi) — qolgan hamma narsa normal ishlayveradi.

## 6. 🟡 Stiker kontenti — 2 paket × 24 ta WebP

Backend sxemasi, endpointi va seed skripti tayyor bo'ladi, lekin **tasvirlarning o'zi** kontent
ishi. Mobil jamoaning tavsiyasi (va u to'g'ri): **Microsoft Fluent Emoji, MIT litsenziya**.

- Manba: <https://github.com/microsoft/fluentui-emoji>
- Litsenziya: MIT — tijoriy ishlatishga ruxsat, atribut talab qilmaydi
- Kerak: har biri **512×512 WebP, shaffof fon**, talaba mavzusida (imtihon, kutubxona, kofe, uyqu,
  deadline, "5 baho")

⛔ **Telegram stikerlarini olib ishlatmang.** Mobil jamoa buni to'g'ri ogohlantirgan: mualliflik
huquqi buzilishi va ilovaning App Store / Google Play dan olib tashlanishi xavfi.

## 7. 🔵 Real FCM / APNs push provayderi

Hozir `DevPushProvider` — **faqat log yozadi**. Ya'ni bugun hech qanday push, hatto oddiy xabar
push'i ham, haqiqiy qurilmaga bormaydi.

Kerak bo'ladi:
- Firebase loyihasi + service account JSON (Android FCM v1)
- Apple Developer: APNs kaliti (`.p8`) yoki sertifikat, Team ID, Key ID
- Qo'ng'iroq uchun alohida: **VoIP Services** sertifikati (`apns-topic: <bundleId>.voip`)

**Bloklaydi:** offline xabar push'i (hozir ham ishlamaydi) va butun qo'ng'iroq funksiyasi.

## 8. ⚪ coturn (TURN/STUN) — qo'ng'iroq bosqichida

Hali kerak emas. Kerak bo'lganda mobil hujjatning §11.1 dagi konfiguratsiyasi asos bo'ladi.
**443/TLS porti majburiy** — talabalar universitet Wi-Fi sidan qo'ng'iroq qiladi.

---

## Tenor API kaliti — qadamma-qadam

Tenor Google'niki, shuning uchun kalit **Google Cloud Console** orqali olinadi. Bepul va
cheklovi katta (kuniga o'n minglab so'rov).

### 1-qadam — Google Cloud loyihasi

<https://console.cloud.google.com/projectcreate>

Loyiha nomi: masalan `studentclub-tenor`. Mavjud loyihangiz bo'lsa, o'shani ishlatsangiz ham bo'ladi.

### 2-qadam — Tenor API ni yoqish

<https://console.cloud.google.com/apis/library/tenor.googleapis.com>

Yuqorida to'g'ri loyiha tanlanganiga ishonch hosil qiling → **Enable** tugmasi.

> Agar sahifa topilmasa, API kutubxonasida <https://console.cloud.google.com/apis/library> qidiruvga
> `Tenor` yozing.

### 3-qadam — Kalit yaratish

<https://console.cloud.google.com/apis/credentials>

**+ CREATE CREDENTIALS** → **API key**. Kalit darhol ko'rsatiladi — nusxa oling.

### 4-qadam — Kalitni cheklash (bu qadamni tashlab ketmang)

Yaratilgan kalit yonidagi **Edit** (qalam) belgisi:

- **API restrictions** → `Restrict key` → ro'yxatdan **Tenor API** ni tanlang.
  Shu bilan kalit sizib chiqsa ham, faqat GIF qidiruvi uchun ishlaydi, boshqa Google xizmatlari
  uchun emas.
- **Application restrictions** → **`None` qoldiring**.
  ⚠️ «HTTP referrers» ni tanlamang — bu brauzer uchun. Bizda so'rovni **server** yuboradi.
  Serveringizning IP si o'zgarmas bo'lsa, `IP addresses` ni tanlab, o'sha IP ni qo'shsangiz —
  yanada yaxshi.

### 5-qadam — Serverga qo'yish

`.env` fayliga (repoga **hech qachon** commit qilinmaydi):

```dotenv
TENOR_API_KEY=AIzaSy...
```

Konfiguratsiya sxemasida u allaqachon bor (`src/config/env.ts`), ixtiyoriy maydon sifatida.

### 6-qadam — Tekshirish

```bash
curl -s "https://tenor.googleapis.com/v2/search?q=cat&key=$TENOR_API_KEY&limit=1" | head -c 300
```

JSON kelsa — kalit ishlayapti. `403` kelsa — API yoqilmagan yoki cheklov noto'g'ri.

### Muhim: Tenor shartlaridan kelib chiqadigan majburiyatlar

Bular **mobil jamoa** bilan birga bajariladi:

1. **Fayllarni o'z serverimizga ko'chirmaymiz.** Tenor CDN havolasi to'g'ridan-to'g'ri ishlatiladi —
   re-hosting shartlarga zid. Shuning uchun Tenor GIF'ida `mediaId` yo'q, faqat tashqi havola.
   (Backend shunga moslab yozilgan: `MediaAsset.externalUrl`, `storageKey: null`.)
2. **«Powered by Tenor» atributi** — qidiruv panelida logotip bilan ko'rsatilishi shart (klient ishi).
3. **`registershare`** — foydalanuvchi GIF tanlaganda Tenor'ga xabar berilishi kerak.
   Backend buni `POST /v1/gifs/{id}/share` orqali qiladi.

> Giphy ham xuddi shunday ishlaydi va kontrakt bir xil (`provider: "GIPHY"`). Tenor tavsiya
> etiladi: Google'niki, ishonchliroq va O'zbekistondan tez ochiladi.

---

## Qisqacha ustuvorlik

| # | Ish | Kim | Nimani bloklaydi |
|---|---|---|---|
| 1 | Migratsiyalarni qo'llash | backend/devops | hamma narsa |
| 2 | E2E testlarni ishga tushirish | backend | ishonch |
| 3 | Docker image + ffmpeg + volume | devops | rasmdan boshqa hamma media |
| 4 | Nginx WS upgrade | devops | chat sifati, keyin qo'ng'iroq |
| 5 | Tenor kaliti | siz | faqat GIF qidiruvi |
| 6 | Stiker tasvirlari | dizayn/kontent | faqat stikerlar |
| 7 | FCM/APNs | backend + Apple/Google hisoblari | push va qo'ng'iroq |
| 8 | coturn | devops | qo'ng'iroq (keyinroq) |
