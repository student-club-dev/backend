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

## B3. Nginx — WebSocket ✅ (qo'llandi 2026-07-31)

`/etc/nginx/sites-available/api.studentclub.uz` ichiga `location /socket.io/` bloki qo'shildi
(namuna: `deploy/nginx/socket-io.conf`), so'ng:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` avval — test yiqilsa hech narsa qayta yuklanmaydi va sayt eskisicha ishlayveradi.
`reload`, `restart` emas: mavjud ulanishlar uzilmaydi.

Tekshirish:

```bash
curl -s -o /dev/null -m 5 -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  'https://<sizning-domeningiz>/socket.io/?EIO=4&transport=websocket'
```

**`101`** — tuzatildi. **`400`** — hali qo'llanmagan.

> `-m 5` ni olib tashlamang: muvaffaqiyatda ulanish tunnelga aylanadi va `curl` (u WebSocket
> protokolini bilmaydi) osilib qoladi. **Osilib qolishi — muvaffaqiyat belgisi, nosozlik emas.**

Polling zaxira yo'li ham buzilmaganini tasdiqlang — WebSocket bloklangan tarmoqlardagi klientlar
unga tayanadi:

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'https://<domen>/socket.io/?EIO=4&transport=polling'
```

### Shu bilan birga: `client_max_body_size`

Bu alohida, mustaqil nuqson edi — WebSocket bilan bog'liq emas, lekin bir vaqtda topildi.

nginx'dagi qiymat `10m` edi, eng katta yuklama esa **64 MB video**. Ya'ni nginx 10 MB dan
kattasini **413** bilan rad etardi, so'rov Node'ga umuman yetib bormasdi va ilovaning o'z
tekshiruvi (uzbekcha xato xabari bilan) hech qachon ishlamasdi.

```nginx
client_max_body_size 70m;    # server { } darajasida
```

`src/modules/media/domain/media-limits.ts` dagi `maxBytes` oshsa, buni ham oshiring.

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

# 3. IKKALA image'ni ham qayta quring — `migrate` ni unutmang
docker compose build backend migrate

# 4. Migratsiyalar (alohida xizmat, bir marta ishlaydi va to'xtaydi)
docker compose run --rm migrate

# 5. Ko'taring
docker compose up -d

# 6. Zaxiradagi fayllarni yangi volume'ga qaytaring
docker compose cp ./uploads-backup/. backend:/app/uploads
```

> ⚠️ **3-qadamdagi `migrate` — haqiqiy tuzoq, bir marta yeb qo'ydik (2026-07-31).**
> `migrate` xizmati o'z image'idan ishlaydi (`target: build`). Uni qayta qurmasangiz **eski kod**
> bilan ishga tushadi va `No pending migrations to apply` deb **yolg'on** xabar beradi — hech qanday
> xato ko'rinmaydi. Backend esa yangi kod bilan ko'tariladi va bazada yo'q ustunlarni so'raydi.
>
> Nazorat: `migrate` chiqishidagi `N migrations found` soni `ls prisma/migrations` dagi papkalar
> soniga teng bo'lishi kerak (`migration_lock.toml` fayl — papka emas, sanoqqa kirmaydi).
>
> `.env` o'zgargan bo'lsa 5-qadam `docker compose up -d --force-recreate backend` bo'lsin —
> oddiy `up -d` (va ayniqsa `restart`) muhit o'zgaruvchilarini qayta o'qimasligi mumkin.

## Tekshirish

```bash
docker compose ps                              # backend `running` bo'lsinmi
docker compose logs --tail=50 backend          # boot xatolari
docker compose exec backend ffmpeg -version    # ffmpeg bormi
docker compose exec backend ls -la /app/uploads
curl -i https://api.studentclub.uz/v1/health   # tirikmi
```

> `curl -s` emas, **`curl -i`**. `-s` curl'ning o'z xato xabarlarini ham yashiradi, shuning uchun
> bo'sh chiqish «ishladi» degani emas — u ulanish umuman bo'lmaganini ham anglatishi mumkin.

Migratsiyalar haqiqatan bazaga tushganini alohida tasdiqlang — bu yagona ishonchli dalil:

```bash
docker compose exec -T db sh -c \
 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select migration_name, finished_at from _prisma_migrations order by finished_at desc limit 5;"'
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

## C1. Firebase — push bildirishnomalari ✅ (backend yoqildi 2026-07-31)

Loyiha: **`studentclub-191b0`**. Tasdiq: `FCM auth: OK — project studentclub-191b0`.

Qayta sozlash kerak bo'lsa (kalit almashtirildi, yangi server):

1. <https://console.firebase.google.com> → **Project settings → Service accounts →
   Generate new private key** → JSON yuklab olinadi
2. Faylni serverga yuboring (o'z kompyuteringizda bajaring):
   ```bash
   scp ~/Downloads/<fayl>.json deploy@api.studentclub.uz:/opt/studentclub/service-account.json
   ```
3. Uchta qatorni **qo'lda ko'chirmasdan** yasang — PEM kalitini qo'lda yopishtirish deyarli har
   doim buziladi:
   ```bash
   cd /opt/studentclub
   python3 - <<'EOF' > /tmp/fcm.env
   import json
   d = json.load(open('service-account.json'))
   print('FCM_PROJECT_ID=' + d['project_id'])
   print('FCM_CLIENT_EMAIL=' + d['client_email'])
   print('FCM_PRIVATE_KEY=' + d['private_key'].replace('\n', '\\n'))
   EOF
   ```
4. `.env` dagi eski `FCM_*` qatorlarini o'chirib, `/tmp/fcm.env` dagilarini qo'ying
   (`grep -c "^FCM_" .env` → **3**), so'ng izlarni yo'q qiling:
   ```bash
   shred -u /tmp/fcm.env service-account.json
   docker compose up -d --force-recreate backend
   ```

`PUSH_PROVIDER=fcm` bo'lishi ham shart.

### Tekshirish — sirni chiqarmaydi

```bash
docker compose exec -T backend node -e '
const {JWT} = require("google-auth-library");
new JWT({ email: process.env.FCM_CLIENT_EMAIL,
          key: (process.env.FCM_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
          scopes: ["https://www.googleapis.com/auth/firebase.messaging"] }).authorize()
 .then(() => console.log("FCM auth: OK — project " + process.env.FCM_PROJECT_ID))
 .catch(e => console.log("FCM auth: XATO — " + e.message));'
```

`DECODER routines::unsupported` → kalit `.env` ga noto'g'ri **yozilgan**, kalitning o'zi buzuq
emas. Nima yetib borganini ko'rish (bu ham sirni chiqarmaydi):

```bash
docker compose exec -T backend node -e '
const k = process.env.FCM_PRIVATE_KEY || "";
console.log("uzunlik:", k.length, "| matnli bekslesh-n:", (k.match(/\\n/g)||[]).length);'
```

Sog'lom: uzunlik ~1700, matnli `\n` ~28 ta. Uzunlik 1 bo'lsa — `.env` da haqiqiy kalit emas,
`…` kabi to'ldirgich turibdi. Uzunlik ~27 — qiymat birinchi qator uzilishida qirqilgan.

> ⚠️ **`docker compose restart` `.env` ni qayta o'qimaydi.** `.env` o'zgargach har doim
> **`up -d --force-recreate backend`**.

**iOS uchun:** Apple Developer → Keys → APNs kaliti (`.p8`). U bizning `.env` ga **emas**,
**Firebase konsoliga** yuklanadi: Project settings → Cloud Messaging → APNs Authentication Key.
Shundan keyin FCM iOS ga ham yetkazadi — alohida integratsiya kerak emas.

> `PUSH_PROVIDER=dev` bilan `NODE_ENV=production` qilsangiz ilova **baribir ko'tariladi**, lekin
> har boot'da `ERROR` darajasida ogohlantirish yozadi. Ataylab yumshatilgan: push xizmat ishga
> tushgandan keyin qo'shildi, shuning uchun tayyor bo'lmagan kredensiallar deploy'ni bloklamasligi
> kerak edi. Qattiqroq qilish — `push-provider.factory.ts` da ikki qatorlik o'zgarish.

> ⛔ **Mobil tomon hali qilinmagan.** Firebase loyihasida bitta ham ilova ro'yxatdan o'tmagan, ya'ni
> ilova FCM token ololmaydi va backend kimga yuborishni bilmaydi. Mobil jamoa uchun qadamlar:
> `docs/handoff/mobile/05-PUSH-SETUP.md`.

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
