# Kutayotgan amallar — kod bilan bajarib bo'lmaydiganlar

Chat Bosqich 0 / 2 / 3 ishlari davomida to'plangan, **odam qo'li bilan** bajarilishi kerak bo'lgan
ishlar. Har biri kimga tegishli va nima bloklanayotgani bilan.

Holat: 2026-07-29.

---

## 1. ✅ Migratsiyalar — qo'llandi (lokal)

To'rtta migratsiya lokal bazaga muvaffaqiyatli qo'llandi, jumladan qo'lda yozilgan uchtasi:
`message_soft_delete`, `chat_media_and_stickers`, `media_provider_klipy`.

Hammasi qo'shuvchi (additive) — hech narsa o'chirilmaydi, jadval qayta yozilmaydi, uzoq qulf yo'q.
Eski kod yangi ustunlarni e'tiborsiz qoldiradi, ya'ni rolling deploy xavfsiz.

**Serverda hali qo'llanmagan** — deploy paytida `npx prisma migrate deploy` (prod'da **hech qachon**
`migrate dev` emas).

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

## 7. 🟠 FCM push — kod tayyor, kredensiallar kerak

`FcmPushProvider` yozildi va testlangan. **Hali `dev` rejimida ishlayapti** — ya'ni push haqiqiy
qurilmaga bormaydi, faqat log yoziladi.

`PUSH_PROVIDER=dev` production'da ilovani **to'xtatmaydi**, lekin har boot'da `ERROR` darajasida
ogohlantirish yozadi:

```
PUSH_PROVIDER=dev in production — NO push notification will reach any device.
```

Bu ataylab yumshatilgan: push xizmat ishga tushgandan keyin qo'shilyapti, shuning uchun hali tayyor
bo'lmagan kredensiallar deploy'ni bloklamasligi kerak edi. **Bu qator loglarda turgan ekan — offline
talabalar yangi xabar haqida bilmaydi.** Kredensiallar qo'yilgach yo'qoladi.

### Yoqish

Firebase Console → Project settings → **Service accounts** → *Generate new private key* → JSON:

```dotenv
PUSH_PROVIDER=fcm
FCM_PROJECT_ID=<json.project_id>
FCM_CLIENT_EMAIL=<json.client_email>
FCM_PRIVATE_KEY=<json.private_key>     # \n belgilarini o'zgartirmang
```

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

## Qisqacha ustuvorlik

| # | Ish | Kim | Nimani bloklaydi |
|---|---|---|---|
| 1 | Migratsiyalarni qo'llash | backend/devops | hamma narsa |
| 2 | E2E testlarni ishga tushirish | backend | ishonch |
| 3 | Docker image + ffmpeg + volume | devops | rasmdan boshqa hamma media |
| 4 | Nginx WS upgrade | devops | chat sifati, keyin qo'ng'iroq |
| 5 | KLIPY **production access** (test kaliti 100/soat) | siz | GIF qidiruvi prod'da |
| 6 | Stiker tasvirlari | dizayn/kontent | faqat stikerlar |
| 7 | FCM kredensiallari (kod ✅) | siz: Firebase + Apple APNs kaliti | push; qo'ng'iroq uchun keyin VoIP |
| 8 | coturn | devops | qo'ng'iroq (keyinroq) |
