# Runbook — ishga tushirish va tekshirish

Qadamma-qadam. Har bir qadamda: **nima qilish**, **nima uchun**, va **ishlaganini qanday bilish**.

Tartib muhim. Yuqoridagi qadam bajarilmasa, pastdagisi baribir ishlamaydi.

---

# A. Lokalda — bugun (~30 daqiqa)

Bu eng muhim qism. Hozirgacha yozilgan **hamma narsa faqat unit testlar bilan tekshirilgan** —
ya'ni funksiyalar alohida-alohida to'g'ri ishlaydi, lekin haqiqiy HTTP so'rovi → baza → javob yo'li
**bir marta ham** sinalmagan. E2E testlar aynan shuni tekshiradi.

## A1. Docker Desktop ni ishga tushiring

Mac'da Docker Desktop ilovasini oching va u to'liq ishga tushishini kuting.

```bash
docker ps
```

**Ishladi:** jadval sarlavhasi chiqadi (bo'sh bo'lsa ham).
**Ishlamadi:** `Cannot connect to the Docker daemon` — Docker hali ko'tarilmagan, biroz kuting.

## A2. `.env` da `DATABASE_URL` ni tuzating

Faylni oching va hostni **`localhost`** ga o'zgartiring:

```dotenv
DATABASE_URL=postgresql://elonuz:elonuz@localhost:5432/elonuz?schema=public
REDIS_URL=redis://localhost:6379
```

**Nega.** `db` va `redis` — Docker tarmog'i ichidagi xizmat nomlari. Sizning kompyuteringizda
bunday nomlar yo'q, shuning uchun `db:5432` ga ulanib bo'lmaydi.

Containerlar buzilmaydi: `docker-compose.yml` ular uchun `DATABASE_URL` ni `db:5432` deb
**qayta belgilaydi**, va Compose'da `environment` har doim `env_file` dan ustun turadi.

## A3. Bazani va Redis'ni ko'taring

```bash
docker compose up -d db redis
docker compose ps
```

**Ishladi:** `elonuz-db` va `elonuz-redis` `running` holatida; db yonida `healthy`.

## A4. Migratsiyalarni qo'llang

```bash
npx prisma migrate deploy
npx prisma generate
```

**Ishladi:** «N migrations applied» yoki «No pending migrations».

Bu **3 ta kutayotgan migratsiyani** qo'llaydi: xabar soft-delete, chat media + stikerlar,
KLIPY provayder qiymati.

> ⚠️ Prod'da **hech qachon** `prisma migrate dev` ishlatmang — u schema'ni bazaga moslashtirish
> uchun jadval o'chirishi mumkin. `migrate deploy` faqat tayyor migratsiyalarni qo'llaydi.

## A5. E2E testlarni ishga tushiring

```bash
npm run test:e2e
```

**Ishladi:** hamma suite yashil.
**Ishlamadi:** chiqishni menga bering — bu kutilgan holat, chunki bu testlar hech qachon
bajarilmagan. Xatolar bo'lsa men tuzataman.

Bu qadam **eng qimmatlisi**: u Bosqich 0, 2 va 3 ning haqiqatan ishlashini tasdiqlaydi.

## A6. Ilovani ko'taring va qo'lda ko'ring

```bash
npm run start:dev
```

Brauzerda: <http://localhost:3000/docs/student> — Swagger UI.

Yangi endpointlarni ko'rasiz: `/v1/media/chat-upload`, `/v1/media/{id}/raw`,
`/v1/stickers/packs`, `/v1/gifs/search`, `/v1/messages/{id}`, `/v1/conversations/unread-count`.

---

# B. Serverda — A tugagandan keyin

**A bajarilmaguncha bu qadamlarga o'tmang.** Ishlamaydigan kodni deploy qilish faqat vaqt yo'qotadi.

## B1. Docker image'ni qayta quring

```bash
docker compose build backend
docker compose up -d
docker compose exec backend ffmpeg -version
```

**Nega.** `Dockerfile` ga **`ffmpeg`** qo'shildi. Eski image bilan rasm yuklash ishlaydi, lekin
GIF, video va ovoz **ish vaqtida yiqiladi**.

**Ishladi:** `ffmpeg version …` chiqadi.

## B2. Fayllar uchun volume borligini tekshiring

```bash
docker compose exec backend ls -la /app/uploads
```

`docker-compose.yml` ga `elonuz-uploads` volume qo'shildi. Busiz **har bir qayta ishga tushirishda
yuklangan hamma fayl o'chib ketardi** — e'lon rasmlari ham, chat fayllari ham.

## B3. Nginx — WebSocket

Hozir chat **long-polling** ustida ishlayapti (batareya sarfi, kechikish). Konfiguratsiya tayyor:

```bash
sudo cp deploy/nginx/socket-io.conf /etc/nginx/snippets/socket-io.conf
# server { } bloki ichiga qo'shing:
#   include /etc/nginx/snippets/socket-io.conf;
sudo nginx -t && sudo systemctl reload nginx
```

Tekshirish:

```bash
curl -i -o /dev/null -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  'https://<sizning-domeningiz>/socket.io/?EIO=4&transport=websocket'
```

**`101`** — tuzatildi. **`400`** — hali qo'llanmagan.

Bu keyinchalik qo'ng'iroq uchun **majburiy** bo'ladi — polling ustida WebRTC signalizatsiya
ishlamaydi.

## B4. Server `.env` ini to'ldiring

Prod'da majburiy:

| O'zgaruvchi | Nega |
|---|---|
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Default `change-me-…` — **albatta almashtiring** |
| `PUBLIC_MEDIA_BASE_URL` | `localhost` bo'lsa **ilova boot bo'lmaydi** (ataylab) |
| `CORS_ORIGINS` | Bo'lmasa admin panel API'ga murojaat qila olmaydi |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` | Bo'lmasa admin panelga hech kim kira olmaydi |
| `DATABASE_URL` | Serverda ham `localhost` (compose containerlar uchun qayta belgilaydi) |

---

# B5. Serverga deploy — qadamma-qadam

## ⚠️ AVVAL: yuklangan fayllarni zaxiralang

Bu **eng oson unutiladigan va eng qimmat** xato.

Ilgari `docker-compose.yml` da `uploads` uchun **volume yo'q edi** — ya'ni yuklangan hamma fayl
konteynerning o'z ichida yashagan. Yangi image bilan konteyner qayta yaratilganda **o'sha fayllar
butunlay yo'qoladi**: e'lon rasmlari, biznes logolari — hammasi.

Yangi `docker-compose.yml` da volume qo'shildi, lekin u **faqat bundan keyingi** fayllarni saqlaydi.
Mavjudlarini qo'lda ko'chirish kerak:

```bash
cd /opt/studentclub

# 1. Eski konteynerdan fayllarni chiqarib oling (u hali ishlab turgan paytda!)
docker compose cp backend:/app/uploads ./uploads-backup
ls -la uploads-backup            # nima borligini ko'ring
du -sh uploads-backup            # hajmi
```

Agar bu buyruq bo'sh papka qaytarsa — yaxshi, yo'qotadigan narsa yo'q.

## Deploy

```bash
cd /opt/studentclub

# 2. Yangi kodni oling
git pull origin main

# 3. Image'ni qayta quring — ffmpeg SHU YERDA qo'shiladi
docker compose build backend

# 4. Migratsiyalar (alohida xizmat, bir marta ishlaydi va to'xtaydi)
docker compose run --rm migrate

# 5. Ko'taring
docker compose up -d

# 6. Zaxiradagi fayllarni yangi volume'ga qaytaring
docker compose cp ./uploads-backup/. backend:/app/uploads
```

## Tekshirish

```bash
docker compose ps                              # backend `running` bo'lsinmi
docker compose logs --tail=50 backend          # boot xatolari
docker compose exec backend ffmpeg -version    # ffmpeg bormi
docker compose exec backend ls -la /app/uploads
curl -s https://api.studentclub.uz/v1/health   # tirikmi
```

## Boot'dan keyin loglarni tekshiring

`PUSH_PROVIDER` qo'yilmagan bo'lsa, ilova **ko'tariladi**, lekin har boot'da shu qatorni yozadi:

```
ERROR [PushProvider] PUSH_PROVIDER=dev in production — NO push notification will reach any device.
```

Bu kutilgan holat: hozircha push o'chiq. `FCM_*` kredensiallari tayyor bo'lgach §C1 ni bajaring va
bu qator yo'qoladi. **Qator turgan ekan — offline talabalar yangi xabar haqida bilmaydi.**

Loglarni har doim avval o'qing:

```bash
docker compose logs --tail=100 backend | grep -i "error\|Invalid environment"
```

Konfiguratsiya xatosi bo'lsa, ilova qaysi o'zgaruvchi noto'g'ri ekanini **aniq nomi bilan** yozadi.

## Orqaga qaytarish

```bash
git log --oneline -5             # oldingi commit'ni toping
git checkout <oldingi-commit>
docker compose build backend && docker compose up -d
```

⚠️ **Migratsiyalar orqaga qaytmaydi.** Lekin bu safar hammasi qo'shuvchi (yangi ustun/jadval),
ya'ni eski kod ularni shunchaki e'tiborsiz qoldiradi — orqaga qaytish xavfsiz.

---

# C. Kredensiallar — parallel, shoshilinch emas

Bularsiz ham ilova ishlaydi, faqat tegishli imkoniyatlar o'chiq turadi.

## C1. Firebase — push bildirishnomalari

Hozir push **hech qanday qurilmaga bormaydi** (`PUSH_PROVIDER=dev` faqat log yozadi).

1. <https://console.firebase.google.com> → loyiha yarating (yoki mavjudini oling)
2. **Project settings → Service accounts → Generate new private key** → JSON yuklab olinadi
3. JSON dan uchta qiymatni `.env` ga ko'chiring:

```dotenv
PUSH_PROVIDER=fcm
FCM_PROJECT_ID=<json.project_id>
FCM_CLIENT_EMAIL=<json.client_email>
FCM_PRIVATE_KEY=<json.private_key>
```

⚠️ `private_key` ichidagi `\n` belgilarini **o'zgartirmang** — ilova ularni o'zi haqiqiy qatorga
aylantiradi.

**iOS uchun:** Apple Developer → Keys → APNs kaliti (`.p8`). U bizning `.env` ga **emas**,
**Firebase konsoliga** yuklanadi: Project settings → Cloud Messaging → APNs Authentication Key.
Shundan keyin FCM iOS ga ham yetkazadi — alohida integratsiya kerak emas.

> ⚠️ `PUSH_PROVIDER=dev` bilan `NODE_ENV=production` qilsangiz **ilova boot bo'lmaydi**. Bu ataylab:
> jimgina tashlab yuborilgan bildirishnoma foydalanuvchilar shikoyat qilmaguncha ko'rinmaydi.

## C2. KLIPY — GIF qidiruvi production kaliti

Hozir test kaliti: **soatiga 100 ta so'rov** — prod uchun yetarli emas.

Bu **uch tomonlama** ish, batafsil `PENDING_ACTIONS.md` §5 da:
siz atribut assetlarini olasiz → mobil jamoa panelni quradi va video yozadi → siz formani
topshirasiz.

## C3. Stiker tasvirlari

2 paket × 24 ta WebP (512×512, shaffof fon). Manba: **Microsoft Fluent Emoji (MIT litsenziya)**.
Tayyor bo'lgach:

```bash
# prisma/seed-data/stickers.json dagi url larni yangilang, keyin:
npm run prisma:seed-stickers
```

---

# Tez-tez uchraydigan xatolar

| Xato | Sabab | Yechim |
|---|---|---|
| `Can't reach database server at db:5432` | `.env` da Docker ichidagi nom | A2 — `localhost` qiling |
| `Cannot connect to the Docker daemon` | Docker Desktop yopiq | A1 |
| `ffmpeg: not found` | Eski image | B1 — qayta quring |
| `transport=websocket` → 400 | Nginx sozlanmagan | B3 |
| Push kelmaydi | `PUSH_PROVIDER=dev` | C1 |
| `503` GIF qidiruvida | `KLIPY_API_KEY` yo'q | `.env` ga qo'ying |
| `429 GIF_PROVIDER_RATE_LIMITED` | Test kaliti kvotasi tugadi | Kuting yoki C2 |
| Migratsiyadan keyin tiplar eski | Klient qayta generatsiya qilinmagan | `npx prisma generate` |

# Foydali buyruqlar

```bash
npm test                 # unit testlar (baza kerak emas)
npm run test:e2e         # e2e (baza kerak)
npm run openapi:dump     # OpenAPI JSON ni yangilash
npm run gifs:probe       # KLIPY integratsiyasini tekshirish
npm run lint             # kod uslubi
npx tsc --noEmit         # tiplar
```
