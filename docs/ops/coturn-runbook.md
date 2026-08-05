# coturn — o'rnatish va ishga tushirish runbook'i

Bu **kod emas** — server, DNS va sertifikat ishi. `04-CALLS_BACKEND.md` §6 ning bajarilishi.

> ## ⚡ Avval o'qing: coturn **shart emas**
>
> Backend ikkita TURN provayderini qo'llab-quvvatlaydi va tanlov bitta env o'zgaruvchisi:
>
> | | `ICE_PROVIDER=metered` | `ICE_PROVIDER=static` (coturn) |
> |---|---|---|
> | Kerak bo'lgani | **faqat kalit** | server + alohida IP + DNS + sertifikat |
> | Vaqt | **5 daqiqa** | 1–2 soat |
> | Kredensial | uzoq umrli, hamma uchun bitta | har talabaga alohida, 1 soatda eskiradi |
> | Kvota nazorati | yo'q | `user-quota` ishlaydi |
>
> **Metered kalitingiz bo'lsa — qo'ng'iroqlar bugunoq ishlaydi**, bu hujjatdagi hech narsani
> qilmasdan. `turn.studentclub.uz` domeni ham, alohida IP ham, sertifikat ham kerak emas: Metered
> o'z hostlarini ishlatadi (`global.relay.metered.ca`).
>
> ```dotenv
> CALLS_ENABLED=true
> ICE_PROVIDER=metered
> METERED_TURN_USERNAME=<kalit>
> METERED_TURN_CREDENTIAL=<parol>
> ```
>
> Keyin `docker compose up -d --force-recreate backend` (`.env` o'zgargani uchun `--force-recreate`).
>
> **Bu hujjatning qolgan qismi — coturn'ga o'tmoqchi bo'lganingizda.** Sabab: Metered kredensiali
> bitta va uzoq umrli, ya'ni chiqib ketsa siz qo'lda almashtirmaguningizcha yashaydi va relay
> trafigini kim yeyayotganini cheklab bo'lmaydi. coturn har talabaga o'zi eskiradigan kredensial
> beradi. Bu **sifat yaxshilanishi, shoshilinch ish emas** — Metered bilan qo'ng'iroq to'liq
> ishlaydi.

Backend tomoni tayyor: `GET /v1/calls/ice-servers` coturn'ning `use-auth-secret` sxemasi bo'yicha
vaqtinchalik kredensial chiqaradi. Faqat quyidagilar bajarilgach u `503` o'rniga haqiqiy javob
qaytara boshlaydi.

**Qancha vaqt oladi:** serverga va DNS'ga kirish huquqingiz bo'lsa — **1–2 soat**. IP va A yozuvi
daqiqalar, coturn o'rnatish ~15 daqiqa, sertifikat ~30 soniya. Cho'zilishi mumkin bo'lgan yagona
joy — IP'ni provayderdan qo'lda so'rash kerak bo'lsa yoki DNS boshqa odamning qo'lida bo'lsa.

---

## 0. Nima kerak — qisqa ro'yxat

| # | Narsa | Nega |
|---|---|---|
| 1 | **Alohida IP manzil** | `api.studentclub.uz` da nginx 443 ni band qilgan (§1) |
| 2 | `turn.studentclub.uz` → o'sha IP (A yozuvi) | Kredensial va sertifikat shu nomga bog'lanadi |
| 3 | Let's Encrypt sertifikati | `turns:443` uchun (§2) |
| 4 | Hisoblanmagan trafikli tarif | Relay trafigi ikki barobar (§5) |
| 5 | `.env` da `TURN_HOST`, `TURN_STATIC_SECRET`, `CALLS_ENABLED=true` | Backendni yoqish |

---

## 1. ⚠️ Alohida IP — muzokara qilinmaydi

`api.studentclub.uz` da nginx allaqachon 443 ni egallagan. Bitta IP'da ikkalasi turolmaydi.

**Yechim:** coturn alohida serverda yoki o'sha serverga qo'shilgan **ikkinchi IP** da bo'lsin.

```
turn.studentclub.uz.   A   <COTURN_IP>
```

⛔ **Cloudflare yoki boshqa proksi orqasiga qo'ymang.** TURN — HTTP emas; CDN uni uzata olmaydi va
relay nomzodlari umuman ishlamaydi. Cloudflare'da bu yozuv **"DNS only"** (kulrang bulut) bo'lsin.

---

## 2. ⚠️ 443/TLS — "yaxshi bo'lardi" emas, majburiy

Foydalanuvchilarimiz talabalar, ya'ni kunning yarmini universitet Wi-Fi'sida. Bunday tarmoqlarda:

- UDP butunlay yopiq;
- 3478 (TURN'ning standart porti) yopiq;
- 443/TCP **doim** ochiq — usiz internet ishlamaydi;
- ko'pincha oldinda transparent proksi turadi, ya'ni 443 dan chiqayotgan trafik TLS'ga o'xshashi kerak.

`turns:` (TLS ustidagi TURN) 443-portda aynan shuni beradi.

**Busiz nima bo'ladi:** universitetdan qilingan qo'ng'iroqlar "Ulanmoqda…" da qotib, 30 soniyadan
keyin `FAILED` bilan tugaydi. Uy Wi-Fi'sida esa hammasi ideal. Ya'ni nuqson **testda ko'rinmaydi** —
faqat foydalanuvchida, va sababini topish haftalar oladi.

---

## 3. Sertifikat va uni yangilash

```bash
certbot certonly --standalone -d turn.studentclub.uz \
  --deploy-hook "systemctl reload coturn"
```

⚠️ **`--deploy-hook` ni tushirib qoldirmang.** Usiz 90 kundan keyin sertifikat yangilanadi, coturn
esa eskisini ushlab turaveradi va **faqat `turns:443`** ishdan chiqadi — ya'ni faqat universitetdagi
foydalanuvchilar. Qolganlar uchun hammasi joyida ko'rinadi, shuning uchun buni hech kim sezmaydi.

Tekshirish:

```bash
certbot renew --dry-run
systemctl status coturn        # reload'dan keyin ham ishlab turibdimi
```

---

## 4. `turnserver.conf` — muhim qatorlar

```conf
listening-port=3478
tls-listening-port=443

# ⚠️ NAT orqasidagi serverda ikkalasi ham kerak. Faqat bittasi yozilsa coturn relay nomzodini
# ICHKI ip bilan e'lon qiladi: log toza, xato yo'q, qo'ng'iroq esa hech qachon ulanmaydi.
external-ip=<PUBLIC_IP>/<PRIVATE_IP>

realm=turn.studentclub.uz
server-name=turn.studentclub.uz

# Vaqtinchalik kredensiallar. Backend shu sirdan HMAC hisoblaydi; coturn uni qayta hisoblab
# tekshiradi va hech qanday parol saqlamaydi.
use-auth-secret
static-auth-secret=<TURN_STATIC_SECRET>

cert=/etc/letsencrypt/live/turn.studentclub.uz/fullchain.pem
pkey=/etc/letsencrypt/live/turn.studentclub.uz/privkey.pem

# Relay portlari. Firewall'da ham OCHIQ bo'lishi shart (§5).
min-port=49152
max-port=65535

# Bitta buzuq klient butun kanalni yeb qo'ymasin.
user-quota=12
total-quota=1200

# Kerak bo'lmagan narsalarni yoping.
no-cli
no-multicast-peers
no-loopback-peers
```

`TURN_STATIC_SECRET` backendning `.env` idagi qiymat bilan **bir xil** bo'lishi shart.

---

## 5. Jimgina ishdan chiqadigan uch narsa

| Nuqson | Nima bo'ladi | Chora |
|---|---|---|
| `external-ip` noto'g'ri | coturn relay nomzodini ichki IP bilan e'lon qiladi. Log toza, qo'ng'iroq ulanmaydi | `external-ip=<PUBLIC>/<PRIVATE>` va `turnutils_uclient` bilan tekshirish |
| Sertifikat yangilandi, coturn qayta yuklanmadi | 90 kundan keyin faqat `turns:443` o'ladi — ya'ni faqat universitetdagilar | `certbot` ga `--deploy-hook "systemctl reload coturn"` |
| UDP relay portlari firewall'da yopiq | Relay olinadi, ovoz ketmaydi — "ulandi, jim" | `49152–65535/udp` ochilsin |

Tekshiruv:

```bash
turnutils_uclient -v -t -T -u <username> -w <credential> turn.studentclub.uz
```

`username`/`credential` ni `GET /v1/calls/ice-servers` dan oling — u aynan coturn kutayotgan
formatda chiqaradi.

---

## 6. Sig'im

Relay qilingan qo'ng'iroqda trafik **ikki marta** o'tadi (kiradi va chiqadi):

| Tur | Bitta relay qilingan qo'ng'iroq |
|---|---|
| Audio (Opus ~40 kbps) | ≈ **0.2 Mbps** |
| Video (720p ~2 Mbps) | ≈ **8 Mbps** |

Amalda qo'ng'iroqlarning **20–30%** i relay talab qiladi. Bir vaqtda 100 ta video qo'ng'iroq:
`100 × 0.25 × 8 ≈ 200 Mbps`.

- Tarif **hisoblanmagan trafikli** bo'lsin.
- `ulimit -n` kamida **65535** — har relay sessiyasi bir nechta fayl deskriptorini oladi va
  standart 1024 chegarasiga bir necha o'nlab qo'ng'iroqdayoq urilinadi:

```conf
# /etc/systemd/system/coturn.service.d/limits.conf
[Service]
LimitNOFILE=65535
```

---

## 7. Backend tomonida yoqish

```dotenv
CALLS_ENABLED=true
ICE_PROVIDER=static
TURN_HOST=turn.studentclub.uz
TURN_STATIC_SECRET=<coturn dagi bilan bir xil>
TURN_TTL_SECONDS=3600
```

⚠️ Env sxemasi `CALLS_ENABLED=true` bo'lganda `TURN_HOST` va `TURN_STATIC_SECRET` ni **majburiy**
qiladi — production'da ular yo'q bo'lsa ilova umuman ishga tushmaydi. Bu ataylab: sozlanmagan TURN
bilan yoqilgan qo'ng'iroq xizmati sukut bilan ishlamaydi.

Yoqilganini tekshirish:

```bash
curl -H "Authorization: Bearer <access>" https://api.studentclub.uz/v1/calls/ice-servers
```

`iceServers` ro'yxati **shu tartibda** kelishi kerak: `stun` → `turn/udp` → `turn/tcp` →
`turns:443`. Tartib muhim — `turns:443` birinchi tursa, ochiq tarmoqdagi barcha qo'ng'iroqlar
keraksiz ravishda relay orqali ketadi.

---

## 8. Deploy tartibi (§16)

1. **coturn tayyor** → `ice-servers` haqiqiy javob qaytaradi.
2. **Yangi mobil versiya tarqaladi.** ⚠️ `CALL` xabar yozadigan deploy shundan **keyin**: bugungi
   production klientda `MessageTypeDto` qat'iy enum, va `CALL` qatorini olsa `SerializationException`
   tashlab, suhbat tarixi va suhbatlar ro'yxatini yiqitadi.
3. **`CALLS_ENABLED=true`** — yoqishdan oldin mobil jamoaga ayting: o'sha kuni ikkita real qurilmada
   uchidan-uchiga sinaladi.

`CALLS_ENFORCE_TOKEN_EXPIRY` ni ham yoqsangiz bo'ladi — bizning tomondan to'siq yo'q.
