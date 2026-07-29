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

Bu **birinchi navbatdagi ish** — unit testlar (779 ta) yashil, lekin ular haqiqiy so'rov-javob
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

## 5. 🟡 GIF qidiruvi — KLIPY ulandi, production access qoldi

Integratsiya tayyor va haqiqiy kalit bilan tekshirilgan. Qolgani — **test kalitidan production
kalitiga o'tish** (test = soatiga 100 ta, prod uchun yetarli emas). Batafsil quyida.

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

## GIF qidiruvi — KLIPY ulandi ✅

Provayder tanlandi va integratsiya **haqiqiy kalit bilan tekshirildi**: `mapped 8 of 8 results`.

### Nega KLIPY

| Provayder | Holat |
|---|---|
| Tenor | ⛔ API **2026-yil 30-iyunda o'chirilgan**. Mavjud kalitlar ham ishlamaydi |
| Giphy | ⚠️ Bepul kalit — soatiga **100 ta** so'rov. Cheksiz uchun **pullik** shartnoma |
| **KLIPY** | ✅ **Bepul, cheksiz production tarifi.** Tenor jamoasi qurgan; WhatsApp o'tgan, Discord ko'chmoqda |

### Konfiguratsiya

```dotenv
KLIPY_API_KEY=<kalit>
KLIPY_BASE_URL=https://api.klipy.com/api/v1   # default, o'zgartirish shart emas
```

⚠️ Kalit so'rov **yo'lida** ketadi (`/api/v1/<KEY>/gifs/search`) — parol darajasidagi sir.
Adapter URL'ni **hech qachon log qilmaydi**, faqat xato sababini yozadi.

Kalit sozlanmagan bo'lsa `GET /v1/gifs/search` **503** qaytaradi va boshqa hech narsa buzilmaydi.

### Qolgan ish: production access — **uch tomonlama**

Hozirgi **test kaliti — soatiga 100 ta so'rov**, prod uchun yetarli emas. Production kaliti bepul va
cheksiz, lekin so'rov formasi **ilova ichida ishlab turgan GIF panelining video yozuvini** talab
qiladi (Partner Panel → API Keys → Upgrade to Production Key).

Ya'ni buni **backend yolg'iz topshira olmaydi** — mobil panel qurilmaguncha ko'rsatadigan narsa yo'q.

| # | Kim | Ish |
|---|---|---|
| 1 | Backend | ✅ `GET /v1/gifs/search` tayyor, haqiqiy kalit bilan tekshirilgan (`mapped 8 of 8`) |
| 2 | Siz | Partner Panel'dagi «Download them here» dan **atribut assetlarini** yuklab olib, mobil jamoaga bering |
| 3 | Mobil jamoa | GIF panelini quradi, **«Powered by KLIPY» belgisini** qo'yadi |
| 4 | Mobil jamoa | 30–60 soniyalik ekran yozuvi: chat → GIF paneli (**atribut kadrda**) → qidiruv → yuborish → suhbatda o'ynashi |
| 5 | Siz | Formani topshirasiz. Javob bir necha ish kunida keladi |

**Formani to'ldirish:**

- **App Category** → `Messaging` (GIF paneli chatda yashaydi; `Social Media` ham noto'g'ri emas)
- **Monthly Active Users** → rostini: `0 (pre-launch)` yoki aniq belgi bilan kutilayotgan son.
  Bo'rttirmang — integratsiya videodan baribir tekshiriladi
- **URL** → `studentclub.uz`

⚠️ Production access **`.env` dagi kalit uchun** so'ralsin. Panelda uchta ilova ro'yxatdan o'tgan
(`studentclub-android/-ios/-web`), lekin backend bittasini ishlatadi — boshqasiga so'ralsa, prod'da
baribir 100/soat chegarasiga urilib, sababi topilmay qoladi.

**Nega video kerak.** Production kaliti bepul va cheksiz, ya'ni Klipy o'z CDN trafigini beradi.
Kalit butunlay serverda bo'lgani uchun ular faqat so'rovlar sonini ko'radi — natijalar bilan nima
qilinayotganini emas. Video ularga uchta savolga javob beradi: kontent qayerda ishlatilyapti,
atribut haqiqatan ko'rsatilyaptimi, va katalog ko'chirib olinmayaptimi.

**Ads API'ni yoqmang** — panel taklif qiladi, lekin talabalar ilovasida GIF panelida reklama
o'rinsiz va u klient tomonda qo'shimcha integratsiya talab qiladi.

### Bu v1 rejasiga qanday ta'sir qiladi

GIF **qidiruvi** endi ikkita tashqi bog'liqlikka bog'liq: mobil panel va Klipy tasdig'i. v1 ga
ulgurmasligi mumkin.

GIF **yuborish** esa hech kimga bog'liq emas va **allaqachon ishlaydi** — foydalanuvchi o'z GIF'ini
yuklaydi, server uni ovozsiz MP4 ga o'giradi. Panel keyinga qolsa ham bu yo'qolmaydi.

### Klient tomonda

**Atribut majburiy** — «Powered by KLIPY» brendi qidiruv panelida ko'rsatilishi shart (Tenor va
Giphy'da ham shunday edi). Javobdagi `provider` maydoni qaysi belgini ko'rsatishni aytadi.

Ads API **ixtiyoriy** va biz uni **yoqmadik** — talabalar ilovasida reklama o'rinsiz.

### Tekshirish

```bash
npm run gifs:probe          # .env dan kalitni o'qiydi
```

Javob shaklini va adapter nechta natijani o'giraganini ko'rsatadi. Provayder javobini o'zgartirsa
(bu bir oyda ikki marta bo'ldi), bu skript buni **darhol** aniqlaydi — aks holda endpoint xato
bermay, jimgina bo'sh ro'yxat qaytaraverardi.

---

## Qisqacha ustuvorlik

| # | Ish | Kim | Nimani bloklaydi |
|---|---|---|---|
| 1 | Migratsiyalarni qo'llash | backend/devops | hamma narsa |
| 2 | E2E testlarni ishga tushirish | backend | ishonch |
| 3 | Docker image + ffmpeg + volume | devops | rasmdan boshqa hamma media |
| 4 | Nginx WS upgrade | devops | chat sifati, keyin qo'ng'iroq |
| 5 | KLIPY **production access** (test kaliti 100/soat) | siz | GIF qidiruvi prod'da |
| 6 | Stiker tasvirlari | dizayn/kontent | faqat stikerlar |
| 7 | FCM/APNs | backend + Apple/Google hisoblari | push va qo'ng'iroq |
| 8 | coturn | devops | qo'ng'iroq (keyinroq) |
