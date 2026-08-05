# Ovozli va video qo'ng'iroq — **qolgan ishlar**

Bu hujjat 2026-08-05 da **qisqartirildi**: bajarilgan qismlar (namespace qarori,
signalizatsiya protokoli, ruxsat tekshiruvlari, holat mashinasi, `CALL` xabari, xato
kodlari, limitlar, klient holati) olib tashlandi. Qoldi — backend hali qilmagan ishlar.

- To'liq asl nusxa: git tarixida (`CALLS_BACKEND.md`, 2026-08-03).
- Signalizatsiya protokoli endi `handoff/09-CALLS-PROTOCOL.md` da — **yagona manba**.
- Bo'lim raqamlari **ataylab o'zgartirilmadi** (§5.6, §6, §7): boshqa hujjatlardagi
  havolalar shu raqamlarga qaraydi.

---

## Bajarilgan — qayta muhokama qilinmaydi

Spec'dan tekshirildi (`student-club.json`, 2026-08-04):

| Narsa | Holat |
|---|---|
| `MessageTypeDto` da `CALL` | ✅ |
| `MessageDto.call` → `MessageCallDto` (`durationMs` — `int32`) | ✅ |
| `CallStatusDto`, `CallEndReasonDto`, `CallMediaDto`, `CallDto`, `IceServersDto` | ✅ |
| `GET /v1/calls/ice-servers` (endpointning o'zi) | ✅ |
| `GET /v1/calls` — tarix | ✅ |
| `POST /v1/calls/{callId}/stats` | ✅ |
| `call:*` signalizatsiyasi `/chat` da | ✅ |
| Klient: signalizatsiya, holat mashinasi, taymerlar, REST, UI, Android media | ✅ |

Klientda yetishmayotgani faqat **iOS media qatlami** (`WebRTC.framework`) — bu bizning
ishimiz, sizdan hech narsa talab qilmaydi.

---

## Qolgani — shu hujjatdagi to'rt band

| # | Ish | Bo'lim |
|---|---|---|
| 1 | **coturn (TURN/STUN)** — server, DNS, 443/TLS, kredensiallar | §6 |
| 2 | **VoIP push adapteri** (APNs to'g'ridan-to'g'ri) + `RegisterDeviceDto.tokenType` | §7 |
| 3 | `GET /v1/calls/active` + `ActiveCallDto` | §5.6 |
| 4 | Deploy tartibi va bayroqlar | §16 |

⚠️ Ustuvorlik: **1-band hammasidan oldin**. `ice-servers` bugun `503` qaytaradi, ya'ni
qo'ng'iroqning media qismini na siz, na biz haqiqiy sinay olmaymiz — qolgan uchtasi
tayyor bo'lsa ham qo'ng'iroq ishlamaydi.

---

### 5.6 `GET /v1/calls/active` — sovuq startdan keyin

Ilova **butunlay yopiq** bo'lganda VoIP push kelsa, iOS ilovani uyg'otadi va u **darhol**
CallKit'ga qo'ng'iroqni ko'rsatishi shart (§7.4) — WebSocket ulanishini kutishga vaqt yo'q.

Ilova jiringlashni ko'rsatgach, socket ulangunicha qo'ng'iroq allaqachon tugagan bo'lishi
mumkin. Shuning uchun tez REST tekshiruvi kerak:

```
GET /v1/calls/active
→ { "result": { "call": { "callId", "state", "media", "peer": {…}, "expiresAt" } } }
→ result.call = null — faol qo'ng'iroq yo'q
```

Klient `null` olsa CallKit sessiyasini darhol yopadi. Busiz telefon **bo'sh joyga jiringlab
turadi** va bu foydalanuvchi eng ko'p shikoyat qiladigan nuqson.

---

## 6. coturn — TURN / STUN

Asosiy konfiguratsiya `CHAT_MEDIA_AND_CALLS_BACKEND.md` §11.1 da. Bu yerda — **o'sha
konfiguratsiya bilan ham qo'ng'iroqni ishlamay qoldiradigan** narsalar.

### 6.1 ⚠️ 443/TLS — bu "yaxshi bo'lardi" emas, **majburiy**

Bizning foydalanuvchilarimiz — **talabalar**, ya'ni kunning yarmini universitet Wi-Fi sida
o'tkazadi. Bunday tarmoqlarda odatda:

- UDP butunlay yopiq (yoki faqat DNS uchun ochiq);
- 3478 (TURN'ning standart porti) yopiq — u "biznesga aloqasiz" ro'yxatda;
- 443/TCP esa **doim** ochiq, chunki usiz internet umuman ishlamaydi;
- ko'pincha oldinda "transparent proxy" turadi, ya'ni 443 dan chiqayotgan trafik **TLS'ga
  o'xshashi** kerak.

`turns:` (TLS ustidagi TURN) 443-portda aynan shu talabni qondiradi: tashqaridan bu oddiy
HTTPS ulanishiga o'xshaydi.

**Busiz nima bo'ladi:** qo'ng'iroqlarning bir qismi — aynan universitetdan qilinganlari —
"Ulanmoqda…" da qotib, 30 soniyadan keyin `FAILED` bilan tugaydi. Uy Wi-Fi sida esa hammasi
ideal ishlaydi. Ya'ni nuqson **testda ko'rinmaydi**, faqat foydalanuvchida ko'rinadi va
sababini topish haftalar oladi.

### 6.2 ⚠️ 443 porti nginx bilan to'qnashadi

`api.studentclub.uz` da nginx allaqachon 443 ni band qilgan. Bitta IP'da ikkalasi turolmaydi.

**Talab: coturn alohida IP manzilda bo'lsin** — alohida server yoki o'sha serverga qo'shilgan
ikkinchi IP. DNS: `turn.studentclub.uz` → **o'sha IP**.

⛔ **Cloudflare yoki boshqa proksi orqasiga qo'yilmasin.** TURN — bu HTTP emas; CDN uni
uzata olmaydi va relay nomzodlari umuman ishlamaydi.

### 6.3 `GET /v1/calls/ice-servers` — vaqtinchalik kredensiallar

Doimiy TURN paroli ilovaga solinmasin: APK dekompilyatsiya qilinadi va TURN serveringiz
begonalarning bepul proksisiga aylanadi (bu real va tez-tez uchraydigan hodisa).

coturn'ning `use-auth-secret` mexanizmi:

```
username   = "<unixTimestamp + ttl>:<studentId>"
credential = base64( HMAC_SHA1( static-auth-secret, username ) )
```

Server hech qanday parol saqlamaydi — coturn o'sha sirdan HMAC'ni qayta hisoblab tekshiradi.

```jsonc
// GET /v1/calls/ice-servers  →  200
{
  "result": {
    "iceServers": [
      { "urls": ["stun:turn.studentclub.uz:3478"] },
      {
        "urls": [
          "turn:turn.studentclub.uz:3478?transport=udp",
          "turn:turn.studentclub.uz:3478?transport=tcp",
          "turns:turn.studentclub.uz:443?transport=tcp"
        ],
        "username": "1785315600:std_01H…",
        "credential": "b0Xk9…"
      }
    ],
    "ttlSeconds": 3600
  }
}
```

**Tartib muhim:** `stun` → `turn/udp` → `turn/tcp` → `turns/443`. WebRTC nomzodlarni shu
tartibda yig'adi va eng arzon ishlaydiganini tanlaydi. `turns:443` birinchi tursa, ochiq
tarmoqdagi barcha qo'ng'iroqlar keraksiz ravishda relay orqali ketadi — bu ham sifat, ham
trafik xarajati.

**TTL va uzoq qo'ng'iroq.** Kredensial faqat **ICE yig'ish paytida** kerak; 1 soatdan uzun
davom etgan qo'ng'iroqning allaqachon ochilgan relay sessiyasi kredensial eskirgani uchun
uzilmaydi. Lekin **ICE restart** (tarmoq almashdi) yangi kredensial talab qiladi, shuning
uchun klient TTL tugashiga 5 daqiqa qolganda endpointni qayta chaqiradi.

### 6.4 Jimgina ishdan chiqadigan uch narsa

| Nuqson | Nima bo'ladi | Chora |
|---|---|---|
| `external-ip` noto'g'ri (server NAT orqasida) | coturn relay nomzodini **ichki IP** bilan e'lon qiladi. Log toza, xato yo'q, qo'ng'iroq esa hech qachon ulanmaydi | `external-ip=<PUBLIC>/<PRIVATE>` shaklida yozilsin va `turnutils_uclient` bilan tekshirilsin |
| Let's Encrypt sertifikati yangilandi, coturn qayta yuklanmadi | 90 kundan keyin **faqat `turns:443`** ishdan chiqadi — ya'ni faqat universitetdagi foydalanuvchilar. Qolganlar uchun hammasi joyida | `certbot` ga `--deploy-hook "systemctl reload coturn"` qo'shilsin |
| UDP relay portlari firewall'da yopiq | Relay olinadi, lekin ovoz ketmaydi — "ulandi, jim" | `49152–65535/udp` ochilsin (yoki `min-port`/`max-port` bilan toraytirilib, o'sha oraliq ochilsin) |

### 6.5 Sig'im — oldindan hisoblab qo'yilsin

Relay qilingan qo'ng'iroqda trafik **ikki marta** o'tadi (kiradi va chiqadi):

| Qo'ng'iroq turi | Bitta relay qilingan qo'ng'iroq |
|---|---|
| Audio (Opus ~40 kbps) | ≈ **0.2 Mbps** |
| Video (720p, ~2 Mbps) | ≈ **8 Mbps** |

Amalda qo'ng'iroqlarning **20–30%** i relay talab qiladi (qolganlari P2P ketadi). Ya'ni
bir vaqtda 100 ta video qo'ng'iroq bo'lsa: 100 × 0.25 × 8 ≈ **200 Mbps**.

Shuning uchun coturn serveri **hisoblangan trafikli** tarifda bo'lmasin, va
`user-quota` / `total-quota` chegaralari qoldirilsin — bitta buzuq klient butun kanalni
yeb qo'ymasin.

`ulimit -n` kamida **65535** ga ko'tarilsin: har relay sessiyasi bir nechta fayl deskriptorini
oladi va standart 1024 chegarasiga bir necha o'nlab qo'ng'iroqdayoq urilinadi.

---

## 7. Push — yopiq ilovada jiringlash

Bu qo'ng'iroqning **eng ko'p e'tibordan chetda qoladigan va eng muhim** qismi. Ilova yopiq
bo'lsa WebSocket ham yopiq, ya'ni `call:incoming` yetib bormaydi. Telefon jiringlamasa esa
qo'ng'iroq imkoniyati **umuman yo'q** demakdir.

### 7.1 ⚠️ FCM VoIP push yubora olmaydi — to'g'ridan-to'g'ri APNs kerak

`handoff/05-PUSH-SETUP.md` da yozilganidek, oddiy bildirishnomalar uchun FCM iOS'ga ham
yetkazadi va **bitta integratsiya yetadi**. Qo'ng'iroqda bu ishlamaydi:

- VoIP push `apns-push-type: voip` sarlavhasi bilan ketishi shart;
- FCM bu sarlavhani qo'ymaydi va qo'yish imkonini ham bermaydi;
- `apns-topic` ham boshqacha: `<bundleId>` emas, **`<bundleId>.voip`**.

**Talab: backendda APNs bilan to'g'ridan-to'g'ri gaplashadigan alohida adapter bo'lsin**
(HTTP/2, `api.push.apple.com`). Bu FCM adapterini almashtirmaydi — **yonida** turadi:

| Nima | Kanal |
|---|---|
| Yangi xabar, javobsiz qo'ng'iroq | FCM (hozirgidek) |
| Kiruvchi qo'ng'iroq (iOS) | **APNs to'g'ridan-to'g'ri**, `apns-push-type: voip` |
| Kiruvchi qo'ng'iroq (Android) | FCM, `priority: high`, faqat `data` |

### 7.2 Autentifikatsiya — ikkita yo'l

| Yo'l | Nima kerak | Izoh |
|---|---|---|
| **Token-based (`.p8`)** — **tavsiya** | Firebase'ga yuklangan **o'sha** APNs Auth Key, `apns-topic` esa `<bundleId>.voip` | Bitta kalit ikkala kanalga; muddati tugamaydi; JWT server tomonda 1 soatda bir marta yangilanadi |
| Sertifikat (`.p12`) | Apple Developer → **VoIP Services Certificate** (alohida sertifikat) | Klassik yo'l; **yiliga bir marta muddati tugaydi** va tugaganda qo'ng'iroq jimgina to'xtaydi |

> ⚠️ `.p8` faylini **bir marta** yuklab olish mumkin (`05-PUSH-SETUP.md` §2.2). Agar u
> Firebase'ga yuklanib, fayl o'chirilgan bo'lsa — Firebase uni qaytarib bermaydi va Apple
> Developer'da **yangi kalit** yasashga to'g'ri keladi (eskisini bekor qilib, Firebase'ga
> yangisini qayta yuklab). Shuning uchun: **hozir tekshiring, fayl saqlanganmi.**

Sertifikat yo'li tanlansa — muddati tugashiga **kalendarga eslatma** qo'yilsin. Bu shunday
nuqsonki, u tugagan kuni hech qayerda xato ko'rinmaydi: iOS foydalanuvchilariga qo'ng'iroq
kelmay qo'yadi, Android esa ishlab turaveradi.

### 7.3 `RegisterDeviceDto` kengayadi

Hozir (tekshirildi): `{ token, platform }`, `platform ∈ IOS | ANDROID | WEB`.

```jsonc
{ "token": "…", "platform": "IOS", "tokenType": "APNS_VOIP" }
```

| Maydon | Qiymatlar | Qoida |
|---|---|---|
| `tokenType` | `FCM \| APNS \| APNS_VOIP` | **Ixtiyoriy.** Berilmasa: `ANDROID → FCM`, `IOS → FCM`, `WEB → FCM` |

Odatiy qiymat **eski klientlarni buzmaslik uchun** kerak: bugungi ilova `tokenType` yubormaydi
va yubormasligi ham kerak.

⚠️ Bitta iPhone'da **ikkita token** ro'yxatdan o'tadi — oddiy FCM tokeni (xabarlar uchun) va
VoIP tokeni (qo'ng'iroq uchun). Ular **alohida qatorlar** bo'lsin: bir xil qurilma, bir xil
foydalanuvchi, turli `tokenType`. Bittasini ikkinchisi bilan almashtirib yubormang — bu
xabarlarni yoki qo'ng'iroqlarni jimgina o'chiradi.

### 7.4 iOS — VoIP push

Sarlavhalar:

| Sarlavha | Qiymat | Nega |
|---|---|---|
| `apns-push-type` | `voip` | Busiz iOS 13+ push'ni **rad etadi** |
| `apns-topic` | `<bundleId>.voip` | Oddiy `<bundleId>` bilan yuborilsa yetib bormaydi |
| `apns-priority` | `10` | Darhol |
| `apns-expiration` | `0` | §7.7 |

Payload:

```jsonc
{
  "callId": "cal_01J…",
  "type": "call",
  "conversationId": "cnv_01H…",
  "callerId": "std_01H…",
  "callerName": "Aziz Karimov",
  "callerAvatarUrl": "https://cdn…/a.webp",
  "media": "VIDEO",
  "expiresAt": "2026-07-31T09:15:07.000Z"
}
```

> ⚠️ **iOS ning qattiq qoidasi:** VoIP push kelgan zahoti ilova **majburan**
> `CXProvider.reportNewIncomingCall` ni chaqirishi shart. Chaqirmasa iOS ilovani o'ldiradi va
> bir necha marta takrorlansa qurilmaga **keyingi VoIP push'larni umuman yubormay qo'yadi**.
>
> Shundan kelib chiqadigan backend qoidasi: **VoIP kanaliga qo'ng'iroqdan boshqa hech narsa
> yuborilmasin.** Xabar, e'lon, marketing — hech biri. Bitta "sinov uchun" yuborilgan VoIP
> push foydalanuvchining qo'ng'iroqlarini butunlay o'chirib qo'yishi mumkin.

`expiresAt` payload ichida bo'lishi shart: push kechikib yetib kelsa, klient uni ochmasdan
tashlab yuboradi (§7.7).

### 7.5 Android — yuqori muhimlikdagi data-push

```jsonc
{
  "message": {
    "token": "…",
    "android": {
      "priority": "high",
      "ttl": "45s",
      "collapse_key": "call"
    },
    "data": {
      "type": "call",
      "callId": "cal_01J…",
      "conversationId": "cnv_01H…",
      "callerId": "std_01H…",
      "callerName": "Aziz Karimov",
      "callerAvatarUrl": "https://cdn…/a.webp",
      "media": "VIDEO",
      "expiresAt": "2026-07-31T09:15:07.000Z"
    }
  }
}
```

| Talab | Nega |
|---|---|
| **`notification` bloki bo'lmasin** | `notification` bo'lsa Android tizim o'zi bildirishnoma chizadi va ilova **uyg'onmaydi** — ya'ni jiringlash ekrani ko'rsatilmaydi. Faqat `data` bo'lsa `FirebaseMessagingService.onMessageReceived` Doze rejimida ham chaqiriladi |
| `priority: "high"` | Doze / App Standby ni buzib o'tishning yagona yo'li |
| `ttl: "45s"` | Jiringlash muddatidan uzun bo'lmasin (§7.7) |
| `data` qiymatlari **doim `string`** | FCM boshqa turni qabul qilmaydi (`05-PUSH-SETUP.md` §4) |

Qulflangan ekranda jiringlash uchun klient tomonda kerak bo'ladiganlar (backend ishi emas,
lekin rejaga kirsin):

- `USE_FULL_SCREEN_INTENT` ruxsati va `CATEGORY_CALL` li bildirishnoma;
- Android 14+ da to'liq ekranli intent **faqat qo'ng'iroq/budilnik ilovalariga** ruxsat
  etilgan — ilova o'zini shunday e'lon qilishi kerak, aks holda bildirishnoma pastdan
  chiqadi-yu, ekranni egallamaydi;
- barqarorroq yo'l — **`ConnectionService` (Telecom API)**: tizim qo'ng'iroq ekranini o'zi
  chizadi, Bluetooth naushnik tugmalari ishlaydi, oddiy telefon qo'ng'irog'i bilan
  to'qnashuv tizim tomonidan hal qilinadi.

iOS'da bunga mos narsa — **CallKit**, va u yerda tanlov yo'q: VoIP push CallKit'siz
ishlamaydi (§7.4).

### 7.6 Push **doim** yuboriladi — bu xabarlardan farq qiladi

`05-PUSH-SETUP.md` §5 dagi qoida: **ochiq WebSocket bo'lsa push yuborilmaydi** (ikki marta
bildirishnoma chiqmasligi uchun). 

> ⚠️ **Qo'ng'iroqda bu qoida qo'llanmasin.**

| Platforma | Qoida |
|---|---|
| **iOS** | VoIP push **har doim** yuborilsin — ochiq socket bo'lsa ham |
| **Android** | Ochiq socket bo'lsa push yuborilmasa ham bo'ladi; lekin yuborilsa ham zarar yo'q |

Nega iOS'da doim: iOS ilova fonga o'tgach WebSocket'ni **bir necha soniyada uzadi yoki
muzlatadi**, lekin server buni darhol bilmaydi — soket hali "ochiq" ko'rinib turadi. Ya'ni
"socket bor" degan tekshiruv iOS'da **yolg'on** natija beradi va qo'ng'iroq jimgina
yo'qoladi.

Ikki marta ko'rsatish muammosi klientda `callId` bo'yicha hal qilinadi: WS hodisasi ham,
push ham bir xil `callId` olib keladi, klient ikkinchisini e'tiborsiz qoldiradi. Shuning
uchun `callId` push payloadida **majburiy**.

### 7.7 Bekor qilish va eskirgan push

Chaquvchi tashladi, boshqa qurilma javob berdi yoki 45 soniya tugadi — server **darhol**
"bekor" push'ini yuborsin:

```jsonc
{ "type": "call_cancel", "callId": "cal_01J…" }
```

| Platforma | Kanal |
|---|---|
| iOS | **Yana VoIP push** (oddiy push emas) — ilova uxlagan bo'lishi mumkin, faqat VoIP uni uyg'otadi va u CallKit sessiyasini yopadi |
| Android | O'sha data-push |

Busiz telefon **bo'sh joyga jiringlab turadi** — foydalanuvchi javob beradi, u yerda hech kim
yo'q. Bu qo'ng'iroq tizimining eng ko'zga tashlanadigan nuqsoni.

**Eskirgan push yetib kelmasin:** `apns-expiration: 0` (APNs uni darhol yetkazadi yoki
butunlay tashlaydi, navbatda ushlab turmaydi) va FCM'da `ttl: "45s"`. Aks holda tarmoqsiz
qolgan telefon 10 daqiqadan keyin internetga ulanib, allaqachon tugagan qo'ng'iroq uchun
jiringlay boshlaydi.

---

## 14. Spec (OpenAPI) o'zgarishlari — **qolgani**

Bajarilganlari yuqoridagi jadvalda. Hali yo'q:

| Model | O'zgarish | Nima uchun kerak |
|---|---|---|
| `RegisterDeviceDto` | `+tokenType` (`FCM \| APNS \| APNS_VOIP`, ixtiyoriy) | §7.3 — busiz VoIP token ro'yxatdan o'tolmaydi |
| `ActiveCallDto` | yangi model + `GET /v1/calls/active` | §5.6 |
| `ReportRequestDto` | `+callId` (nullable) | Qo'ng'iroq ustidan shikoyat; hozir faqat `targetStudentId` / `messageId` bor |
| `CallStatsDto` | `POST /v1/calls/{callId}/stats` tanasi | Telemetriya — **ixtiyoriy**; endpoint bor, sxema tiplanmagan |

> ⚠️ **Tiplash — codegen'ni buzadigan joy.** NestJS nullable satrni tipsiz `object` deb
> yozadi va generator undan `kotlin.Any?` chiqaradi — natijada klient umuman
> kompilyatsiya bo'lmaydi. Yangi maydonlar aniq tiplansin:
>
> - `ttlSeconds`, `rttMs`, `packetsLost` → `{"type":"integer","format":"int32"}`
>   (`number` **emas** — u `Double` chiqaradi)
> - nullable sana → `{"type":"string","format":"date-time","nullable":true}`
> - nullable obyekt → `{"allOf":[{"$ref":"…"}],"nullable":true}`
>   (OpenAPI 3.0 da `$ref` yonidagi kalitlar e'tiborsiz qoladi, ya'ni
>   `"$ref": …, "nullable": true` **ishlamaydi**)

---

## 16. Deploy tartibi va bayroqlar

Bu bo'lim `CALLS_PREREQUISITES_RESPONSE.md` dan ko'chirildi (o'sha hujjat yopildi —
undagi uchala shart ham bajarilgan).

### 16.1 ⚠️ `CALL` xabar yozadigan deploy — yangi klientdan **keyin**

Yangi klientda enum'lar Kotlin `enum` sifatida generatsiya qilinmaydi: `MessageTypeDto`,
`MediaKindDto`, `MediaStatusDto`, `ConversationTypeDto` va to'rtala qo'ng'iroq enum'i
**oddiy `string`** ga o'giriladi, domenga esa `parseEnum(raw, default)` orqali tushadi.
Ya'ni noma'lum qiymat faqat **o'sha bitta xabarni** «noma'lum tur» qiladi.

Lekin **allaqachon tarqatilgan versiyada `MessageTypeDto` qat'iy enum**. Bugungi
production klient `CALL` qatorini olsa `SerializationException` tashlaydi va suhbat
tarixi, suhbatlar ro'yxati hamda `message:new` handler'i yiqiladi.

**Shuning uchun: `CALL` xabar yozadigan deploy yangi mobil versiya tarqalgandan keyin
chiqarilsin.** Versiya chiqqach alohida xabar qilamiz.

### 16.2 `CALLS_ENFORCE_TOKEN_EXPIRY` — yoqsangiz bo'ladi

Klient access token o'zgarishini kuzatadi (30 soniyada bir marta solishtiradi) va ochiq
socket'ga `call:auth { token }` yuboradi. Bizning tomondan to'siq yo'q — faqat §16.1
tartibiga rioya qiling.

### 16.3 `CALLS_ENABLED` — yoqishdan **oldin** ayting

O'sha kuni Android'da uchidan-uchiga sinaymiz (coturn ustida, ikkita real qurilma bilan).
Hozir `503` kutilgan javob bo'lgani uchun media qismini haqiqiy tekshirib bo'lmayapti.
