# Kutayotgan amallar — kod bilan bajarib bo'lmaydiganlar

Chat Bosqich 0 / 2 / 3 ishlari davomida to'plangan, **odam qo'li bilan** bajarilishi kerak bo'lgan
ishlar. Har biri kimga tegishli va nima bloklanayotgani bilan.

Holat: **2026-07-31 — production'ga deploy qilindi.**

---

## 1. ✅ Migratsiyalar — qo'llandi (lokal **va** production)

To'rtta migratsiya bazaga muvaffaqiyatli qo'llandi, jumladan qo'lda yozilgan uchtasi:
`message_soft_delete`, `chat_media_and_stickers`, `media_provider_klipy`.

Hammasi qo'shuvchi (additive) — hech narsa o'chirilmaydi, jadval qayta yozilmaydi, uzoq qulf yo'q.
Eski kod yangi ustunlarni e'tiborsiz qoldiradi, ya'ni rolling deploy xavfsiz.

Production'da `docker compose run --rm migrate` bilan qo'llandi (2026-07-31): `17 migrations found`,
uchtasi yangi. Prod'da **hech qachon** `migrate dev` emas.

> ⚠️ **Tuzoq:** `migrate` xizmati o'z image'idan ishlaydi (`target: build`). `git pull` dan keyin uni
> **qayta qurmasangiz** eski kod bilan ishga tushadi va `No pending migrations to apply` deb yolg'on
> xabar beradi. Har deploy'da avval `docker compose build migrate`.

## 2. ✅ E2E testlar — o'tdi

**11 suite, 114 test** haqiqiy Postgres va Redis bilan. `chat.e2e-spec.ts` dagi 24 tadan
**15 tasi shu ishda yozilgan** va hammasi yashil: §17.1 `clientMsgId`, §17.4 reports, §17.5
`hasMore`, §17.6 `/delivered`, §17.7 tartib, §18 ning to'rtta endpointi.

```bash
docker compose up -d db redis
npm run test:e2e
```

⚠️ **Sizning `.env` da `DATABASE_URL` hosti `db`** — bu Docker tarmog'i ichidagi nom, host'dan
ishlamaydi. `localhost` ga o'zgartiring; containerlar buzilmaydi, chunki `docker-compose.yml`
ular uchun `db:5432` ni qayta belgilaydi. Batafsil: `RUNBOOK.md` A2.

## 3. ✅ Nginx — WebSocket upgrade (qo'llandi 2026-07-31)

`api.studentclub.uz` konfiguratsiyasiga `location /socket.io/` bloki qo'shildi (`Upgrade` +
`Connection` sarlavhalari, 3600s timeout, `proxy_buffering off`). Tasdiqlandi: **`ws: 101`**,
polling zaxira yo'li ham ishlayapti. Chat endi haqiqiy WebSocket ustida.

Bir vaqtning o'zida **`client_max_body_size` `10m` → `70m`** ga ko'tarildi. Bu alohida nuqson edi:
eng katta yuklama 64 MB video, ya'ni nginx 10 MB dan kattasini **413** bilan rad etardi va so'rov
Node'ga umuman yetib bormasdi. `media-limits.ts` dagi `maxBytes` oshsa, buni ham oshiring.

Namuna va tekshirish buyruqlari: `deploy/nginx/socket-io.conf` + `deploy/nginx/README.md`.

## 4. ✅ Docker image + volume (qo'llandi 2026-07-31)

`Dockerfile` ga **`ffmpeg`** qo'shildi (GIF→MP4, video probe/transkod, ovoz dekodi). Serverda
tasdiqlandi: `ffmpeg version 8.0.1`.

`docker-compose.yml` ga **`elonuz-uploads:/app/uploads`** volume'i qo'shildi. Ilgari volume
**umuman yo'q edi** — har `docker compose up` yuklangan fayllarni yo'q qilardi.

## 5. 🟡 GIF qidiruvi — KLIPY ulandi, production access qoldi

Integratsiya tayyor va haqiqiy kalit bilan tekshirilgan. Qolgani — **test kalitidan production
kalitiga o'tish** (test = soatiga 100 ta, prod uchun yetarli emas). Batafsil quyida.

## 6. ✅ ~~Stiker kontenti — 2 paket × 24 ta WebP~~ — BEKOR QILINDI (2026-07-31)

**Bu ish endi kerak emas.** Mobil jamoa o'z zaxira katalogini qurib oldi (1625 ta Fluent Emoji 3D
stiker, MIT litsenziya, CDN'dan yuklanadi) va stiker paneli ilovada to'liq ishlayapti. Hech qanday
tasvir tayyorlash, seed qilish yoki `GET /v1/stickers/packs` ni o'zgartirish shart emas —
kontrakt o'z holicha qoldi.

O'rniga **`GET /v1/stickers/search`** qo'shildi (KLIPY Sticker API — o'sha kalit, o'sha base URL,
yangi shartnoma kerak bo'lmadi). Fluent Emoji emoji shaklidagi stikerlar edi; foydalanuvchi
kutadigan **personaj** stikerlarini faqat qidiruv bera oladi. Batafsil:
`docs/api/mobile_questions/STICKER_SEARCH_RESPONSE.md`.

⚠️ **Qolgan yagona ish** — §5 dagi production kalit. Stiker qidiruvi qo'shilgani uchun test
kalitining soatiga 100 ta chegarasi endi **ikki barobar tezroq** tugaydi (GIF + stiker bitta
kvotani bo'lishadi). Prod kalit uchun so'raladigan videoda **ikkala panelni** ko'rsating — bitta
ariza yetadi.

⛔ **Telegram stikerlarini olib ishlatmang.** Mobil jamoa buni to'g'ri ogohlantirgan: mualliflik
huquqi buzilishi va ilovaning App Store / Google Play dan olib tashlanishi xavfi.

## 7. 🟡 FCM push — backend ✅, mobil tomon qoldi

`FcmPushProvider` yozildi, testlandi va **production'da yoqildi** (2026-07-31). Firebase loyihasi:
**`studentclub-191b0`** (Spark tarifi — FCM uchun yetarli). Tasdiqlandi:

```
FCM auth: OK — project studentclub-191b0
```

### Qolgan ish — mobil jamoada

Firebase loyihasida hali **bitta ham ilova ro'yxatdan o'tmagan**. Mobil ilova FCM token'ini faqat
o'z Firebase konfiguratsiyasi bo'lsa oladi; token bo'lmasa `POST /v1/devices` ga yuboradigan narsa
yo'q va backend kimga push yuborishni bilmaydi.

| Kim | Ish |
|---|---|
| ✅ Backend | Service account kaliti `.env` da, autentifikatsiya tekshirilgan |
| ⏳ Mobil (Android) | Firebase'ga Android ilovasini qo'shish → `google-services.json` |
| ⏳ Mobil (iOS) | iOS ilovasini qo'shish → `GoogleService-Info.plist` **va** APNs `.p8` kalitini Firebase'ga yuklash |

⚠️ `google-services.json` ichidagi `project_id` **`studentclub-191b0`** bo'lishi shart. Boshqa
loyiha bo'lsa tokenlar mos kelmaydi va push jimgina yo'qoladi.

### Kalitni `.env` ga qo'yish (takrorlash kerak bo'lsa)

Firebase Console → Project settings → **Service accounts** → *Generate new private key* → JSON.
Faylni serverga `scp` bilan yuboring, so'ng uchta qatorni **qo'lda ko'chirmasdan** yasang — PEM
kalitini qo'lda yopishtirish deyarli har doim buziladi:

```bash
python3 - <<'EOF' > /tmp/fcm.env
import json
d = json.load(open('service-account.json'))
print('FCM_PROJECT_ID=' + d['project_id'])
print('FCM_CLIENT_EMAIL=' + d['client_email'])
print('FCM_PRIVATE_KEY=' + d['private_key'].replace('\n', '\\n'))
EOF
```

Eski `FCM_*` qatorlarini o'chirib, bularni `.env` ga qo'shing (qo'shtirnoqsiz, har biri bitta
qatorda), so'ng `shred -u /tmp/fcm.env service-account.json`.

Keyin **`docker compose up -d --force-recreate backend`** — `restart` `.env` ni qayta o'qimaydi.

Tekshirish (sirni chiqarmaydi):

```bash
docker compose exec -T backend node -e '
const {JWT} = require("google-auth-library");
new JWT({ email: process.env.FCM_CLIENT_EMAIL,
          key: (process.env.FCM_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
          scopes: ["https://www.googleapis.com/auth/firebase.messaging"] }).authorize()
 .then(() => console.log("FCM auth: OK — project " + process.env.FCM_PROJECT_ID))
 .catch(e => console.log("FCM auth: XATO — " + e.message));'
```

`DECODER routines::unsupported` → kalit `.env` ga noto'g'ri yozilgan (qisqargan, qo'shtirnoq ichida,
yoki `\n` belgilari yo'q), kalitning o'zi emas.

### iOS uchun alohida integratsiya kerak emas

FCM Android **va** iOS ga yetkazadi — Firebase loyihasiga APNs kalitini yuklaganingizdan keyin u
o'zi APNs ga uzatadi. Ya'ni ikkita emas, bitta integratsiya.

**Apple Developer → Keys → APNs kaliti (`.p8`)** kerak bo'ladi, lekin u bizning `.env` ga emas,
**Firebase konsoliga** yuklanadi (Project settings → Cloud Messaging → APNs Authentication Key).

### Qo'ng'iroq uchun keyinroq

Yopiq ilovada jiringlash uchun **VoIP push (PushKit)** kerak, uni FCM yubora olmaydi — u APNs ga
to'g'ridan-to'g'ri, `apns-push-type: voip` bilan ketishi shart. Bu alohida adapter va qo'ng'iroq
bosqichida yoziladi. Unda **VoIP Services sertifikati** kerak bo'ladi.

### Qachon qattiqroq qilish kerak

`PUSH_PROVIDER=fcm` hamma muhitda qo'yilgach, ogohlantirishni yana boot'ni to'xtatuvchi xatoga
aylantirish mumkin — `push-provider.factory.ts` da ikki qatorlik o'zgarish (SMS provayderi shunday
ishlaydi).

### O'lik tokenlar

FCM `UNREGISTERED`/`INVALID_ARGUMENT` qaytarsa (ilova o'chirilgan, token qayta berilgan), token
bazadan **avtomatik o'chiriladi**. Vaqtinchalik nosozliklarda (500, tarmoq) token saqlanadi —
aks holda bitta uzilish tirik foydalanuvchilarni yo'qotardi.

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

## 9. 🔴 `.env` sirlarini almashtirish

Ishlab chiqish jarayonida production `.env` ning to'liq mazmuni suhbat oynasiga joylashtirildi.
Quyidagilar **oshkor bo'lgan deb hisoblanadi** va almashtirilishi shart:

`JWT_ACCESS_SECRET` · `JWT_REFRESH_SECRET` · `ESKIZ_PASSWORD` · `TELEGRAM_GATEWAY_TOKEN` ·
`KLIPY_API_KEY` · `SWAGGER_PASSWORD` · `ADMIN_PASSWORD_HASH`

⚠️ JWT sirlarini almashtirsangiz **hamma sessiya bekor bo'ladi** — foydalanuvchilar qaytadan
kirishga majbur. Kam faollik vaqtida qiling.

Yangi tasodifiy sir yasash: `openssl rand -base64 48`

**Qoida:** sir **qiymatini** hech qachon chatga, issue'ga yoki commit'ga yozmang — faqat
o'zgaruvchi **nomini**.

## 10. 🟠 `APPLE_ALLOWED_CLIENT_IDS` — nomi noto'g'ri

Serverdagi `.env` da `APPLE_OAUTH_CLIENT_ID` deb yozilgan, `config/env.ts` esa
**`APPLE_ALLOWED_CLIENT_IDS`** kutadi. Ya'ni Apple orqali kirish hozir ishlamaydi — o'zgaruvchi
o'qilmaydi. Nomni to'g'rilab `docker compose up -d --force-recreate backend`.

Yana bir keraksiz qator bor: `ADMIN_API_KEY` — admin autentifikatsiyasi JWT/RBAC ga o'tgandan
keyin ishlatilmaydi, o'chirish mumkin.

---

## Qisqacha ustuvorlik

**Bajarildi (2026-07-31 deploy):**

| # | Ish | Tasdiq |
|---|---|---|
| 1 | Migratsiyalar (lokal + prod) | 3 ta yangi migratsiya qo'llandi |
| 2 | E2E testlar | 114/114 · unit 808/808 |
| 3 | Docker image + ffmpeg + uploads volume | `ffmpeg version 8.0.1` |
| 4 | Nginx WS upgrade + `client_max_body_size` | `ws: 101` |
| 5 | FCM backend kredensiallari | `FCM auth: OK` |

**Qoldi:**

| # | Ish | Kim | Nimani bloklaydi |
|---|---|---|---|
| 6 | **`.env` sirlarini almashtirish** | siz | xavfsizlik — eng ustuvor |
| 7 | `APPLE_ALLOWED_CLIENT_IDS` nomini to'g'rilash | siz | Apple orqali kirish |
| 8 | Firebase'ga Android/iOS ilovalarini qo'shish + APNs `.p8` | mobil jamoa | push haqiqiy qurilmaga |
| 9 | KLIPY **production access** (test kaliti 100/soat) | siz + mobil jamoa | GIF **va stiker** qidiruvi prod'da |
| 10 | ~~Stiker tasvirlari~~ — **bekor qilindi**, §6 ga qarang | — | — |
| 11 | coturn | devops | qo'ng'iroq (keyinroq) |

**2026-07-31, ikkinchi to'plam** (mobil jamoaning ikkita hujjati bo'yicha) — ✅ **deploy qilindi**
(`f56071f`):

| Ish | Hujjat |
|---|---|
| Stiker qidiruvi (KLIPY) + `SendMessageDto.sticker` | `docs/api/mobile_questions/STICKER_SEARCH_RESPONSE.md` |
| Story (to'liq) + bio / phoneVisibility / profil rasmlari / `GET /v1/students/{id}` | `docs/api/mobile_questions/STORY_AND_PROFILE_RESPONSE.md` |

Deploy tasdig'i: uchala migratsiya `_prisma_migrations` da, `/v1/health` → `200`,
`/v1/stories/feed` va `/v1/stickers/search` → `401` (marshrut bor, guard ishlayapti),
boot loglarida xato yo'q.

**Mobil jamoada qolgan ish:** `docs/handoff/mobile/student-api.json` dan Kotlin klientini qayta
generatsiya qilish. ⚠️ `MessageDto.sticker.packId` va `.emoji` endi nullable — bu yagona buzuvchi
o'zgarish.
