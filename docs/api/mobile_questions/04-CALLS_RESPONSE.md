# Qo'ng'iroqlar — backend javobi

`04-CALLS_BACKEND.md` dagi to'rt banddan **uchtasi bajarildi** (kod tomoni to'liq).
To'rtinchisi — **coturn** — kod emas: server, IP, DNS va sertifikat. Uning uchun to'liq runbook
yozildi: **`docs/ops/coturn-runbook.md`**.

> **Spec:** `docs/api/generated/student.json` (= `docs/handoff/mobile/student-api.json`) yangilandi.

---

## 0. To'rt band bo'yicha

| # | Ish | Holat |
|---|---|---|
| 1 | **coturn** (server, DNS, 443/TLS, kredensiallar) | ⏳ **sizning/ops tomonda** — runbook tayyor |
| 2 | VoIP push adapteri + `RegisterDeviceDto.tokenType` | ✅ |
| 3 | `GET /v1/calls/active` + `ActiveCallDto` | ✅ |
| 4 | Deploy tartibi va bayroqlar | ✅ hujjatlashtirildi (runbook §8) |

§14 dagi spec o'zgarishlari:

| Model | Holat |
|---|---|
| `RegisterDeviceDto` + `tokenType` | ✅ |
| `ActiveCallDto` + `GET /v1/calls/active` | ✅ |
| `ReportRequestDto` + `callId` | ✅ |
| `CallStatsDto` tiplanishi | ✅ **allaqachon tiplangan** edi — `rttMs`/`packetsLost` va h.k. hammasi `int32`, `number` emas |

---

## 1. ⚠️ Bitta ataylab qilingan chetlanish — `tokenType` ning iOS sukuti

Siz §7.3 da yozgansiz: «Berilmasa: `ANDROID → FCM`, **`IOS → FCM`**, `WEB → FCM`».

**Biz `IOS → APNS` qildik.** Sabab: o'sha jadval FCM iOS'ga relay qiladi degan taxminga asoslangan,
lekin `PUSH_APNS_BACKEND.md` ishi bilan bu **allaqachon o'zgargan** — iPhone o'zining xom APNs
tokenini ro'yxatdan o'tkazadi va biz Apple bilan to'g'ridan-to'g'ri gaplashamiz.

Agar iOS'ni `FCM` deb belgilasak, mavjud har bir iPhone tokeni uni umuman adreslay olmaydigan
xizmatga topshirilardi — bu aynan APNs ishi tuzatgan nuqson.

**Sizdan hech narsa talab qilinmaydi:** bugungi ilova `tokenType` yubormaydi va to'g'ri qiymatni
oladi. Migratsiya mavjud `platform=IOS` qatorlarini `APNS` ga backfill qildi.

---

## 2. `tokenType` — ikkita token, ikkita qator

```jsonc
POST /v1/devices
{ "token": "…", "platform": "IOS", "tokenType": "APNS_VOIP" }
```

| Maydon | Qiymatlar | Qoida |
|---|---|---|
| `tokenType` | `FCM \| APNS \| APNS_VOIP` | **Ixtiyoriy.** Berilmasa: `IOS → APNS`, qolgani `→ FCM` |

⚠️ **PushKit tokenini ikkinchi ro'yxatdan o'tkazish sifatida yuboring**, oddiysining o'rniga emas.
Bitta iPhone'da ikkita token bo'ladi va ikkalasi ham kerak. Bittasini ikkinchisi bilan almashtirsangiz
yo xabarlar, yo qo'ng'iroqlar jimgina o'chadi. E2e testda aynan shu tekshiriladi: uchta ro'yxatdan
o'tkazishdan keyin **uchta qator** qoladi.

### ⛔ VoIP kanali himoyalangan

Siz eng qattiq ogohlantirgan narsa — «VoIP kanaliga qo'ng'iroqdan boshqa hech narsa yuborilmasin» —
**so'rovning o'zida** bajarilgan, yozuvchining esiga tushishiga tashlab qo'yilmagan:

```ts
// targetsFor() — oddiy bildirishnomalar uchun
where: { studentId, tokenType: { not: APNS_VOIP } }
```

Ya'ni oddiy push yo'li VoIP tokenini **ko'ra olmaydi**. Buni haqiqiy SQL ustida ishlaydigan e2e
test qo'riqlaydi (`⛔ never hands a VoIP token to an ordinary notification`).

---

## 3. VoIP push (§7.4) va Android data-push (§7.5)

**iOS sarlavhalari** — to'rttasi ham, har biri alohida test bilan:

| Sarlavha | Qiymat |
|---|---|
| `apns-push-type` | `voip` |
| `apns-topic` | `<bundleId>.voip` |
| `apns-priority` | `10` |
| `apns-expiration` | `0` |

Payload — `aps` **yo'q**, faqat sizning maydonlaringiz:

```jsonc
{ "type": "call", "callId": "…", "conversationId": "…", "callerId": "…",
  "callerName": "Aziz Karimov", "callerAvatarUrl": "https://…", "media": "VIDEO",
  "expiresAt": "2026-08-05T09:15:07.000Z" }
```

**Android** — `notification` bloki **yo'q**, `priority: high`, `ttl: 45s`, `collapse_key: call`.

Adapter mavjud APNs provayderining **barcha yetkazish qoidalarini qayta ishlatadi** — qayta
urinishlar, environment probe va «token qachon o'lik hisoblanadi» ta'rifi. Ikkinchi nusxa yozilganda
o'sha ta'rif ikkiga ajralib ketardi.

### §7.6 — VoIP push **doim** yuboriladi

Ochiq soket bo'lsa ham. Siz yozgan sabab bilan: iOS ilova fonga o'tgach WebSocket'ni bir necha
soniyada muzlatadi, server esa soketni hali «ochiq» ko'radi — ya'ni «onlayn, push kerak emas»
tekshiruvi iOS'da **yolg'on** natija beradi.

Ikki marta kelishi klientda `callId` bo'yicha hal qilinadi, shuning uchun `callId` payloadda
majburiy va buni test qo'riqlaydi.

### §7.7 — bekor qilish

`call_cancel` **har bir** yakunlanish yo'lida yuboriladi — chaquvchi tashladi, boshqa qurilma javob
berdi, 45 soniya tugadi, glare preemption. Buni har bir handler'da takrorlash o'rniga `closeCall()`
ga qo'ydik — bu barcha yo'llar o'tadigan yagona nuqta. Shart: `answeredAt === null` (javob berilgan
qo'ng'iroqda to'xtatadigan jiringlash yo'q).

---

## 4. `GET /v1/calls/active` (§5.6)

```
GET /v1/calls/active
→ { "result": { "call": { "callId", "conversationId", "state", "media",
                          "incoming", "peer": {…}, "expiresAt" } } }
→ { "result": { "call": null } }   // faol qo'ng'iroq yo'q
```

- Ikkita Redis o'qish + bitta talaba lookup. Bazaga yozuv yo'q — sovuq startda tez.
- `call: null` — **kutilgan javob**, xato emas. `404` emas, aynan shuning uchun: `200` + `null`
  ni `404` dan ajratishga majbur qilmaydi.
- `expiresAt` o'tmishda bo'lsa — `null` bilan bir xil ma'no.
- `incoming: true` — chaquvchi qarshi tomon, ya'ni javob berish kerak bo'lgan qo'ng'iroq.

`call` maydoni **`allOf` + `nullable`** shaklida (siz §14 da ogohlantirgan tuzoq). Oddiy
`$ref`+`nullable` yozilsa klientda `ActiveCallDto` non-null bo'lib chiqardi va aynan shu endpoint
berish uchun mavjud bo'lgan javobda yiqilardi.

---

## 5. `ReportRequestDto` + `callId`

Uchinchi, o'zaro istisno qiluvchi nishon. `POST /v1/reports`:

```jsonc
{ "callId": "cal_…", "reason": "HARASSMENT", "note": "…" }
```

⚠️ Shikoyatchi **o'zi qatnashmagan** qo'ng'iroq uchun `422 CALL_NOT_FOUND`. Bu bir vaqtning o'zida
ruxsat tekshiruvi ham, mavjudlik tekshiruvi ham — «bunday qo'ng'iroq yo'q» javobi qaysi id lar
mavjudligini bilib olishga ham yo'l qo'ymaydi.

---

## 6. ⏳ coturn — sizdan/ops'dan kutilayotgani

**`docs/ops/coturn-runbook.md`** da to'liq. Eng muhim uchtasi:

1. **Alohida IP** — `api.studentclub.uz` da nginx 443 ni band qilgan. `turn.studentclub.uz` → o'sha
   IP, va **Cloudflare orqasida emas** (TURN — HTTP emas, CDN uni uzata olmaydi).
2. **443/TLS majburiy** — talabalar universitet Wi-Fi'sida, u yerda UDP va 3478 yopiq. Busiz nuqson
   **testda ko'rinmaydi**, faqat foydalanuvchida.
3. **`certbot --deploy-hook "systemctl reload coturn"`** — usiz 90 kundan keyin faqat `turns:443`
   o'ladi, ya'ni faqat universitetdagilar.

Backend tomoni tayyor: `TURN_HOST` + `TURN_STATIC_SECRET` + `CALLS_ENABLED=true` qo'yilgan zahoti
`ice-servers` `503` o'rniga haqiqiy kredensial qaytaradi — tartib ham siz so'raganidek:
`stun` → `turn/udp` → `turn/tcp` → `turns:443`.

---

## 7. Deploy tartibi (§16) — o'zgarmadi

1. coturn tayyor → `ice-servers` ishlaydi;
2. **yangi mobil versiya tarqaladi** — `CALL` xabar yozadigan deploy shundan **keyin** (bugungi
   production klientda `MessageTypeDto` qat'iy enum);
3. `CALLS_ENABLED=true` — yoqishdan oldin aytamiz, o'sha kuni ikkita real qurilmada sinaymiz.

`CALLS_ENFORCE_TOKEN_EXPIRY` — bizning tomondan to'siq yo'q, yoqsangiz bo'ladi.

---

## 8. Testlar — va ular topgan bitta haqiqiy nuqson

**24 ta yangi test** (17 unit + 7 e2e).

E2e testi yozilishining o'zi **ilova umuman ishga tushmaydigan nuqsonni** topdi:
`call-push.service.ts` ↔ `calls.service.ts` o'rtasida aylanma import bor edi. TypeScript uni qabul
qiladi, Nest esa yo'q — modullardan biri dekorator metadata yozilayotganda hali `undefined` bo'ladi
va konstruktor parametri jimgina hal qilinmaydigan bo'lib qoladi. Unit testlar buni **ko'rmaydi**
(ular servisni qo'lda quradi). Vaqt konstantalari domain qatlamiga chiqarildi.

Alohida qo'riqlanadigan xususiyatlar:

- VoIP tokeni oddiy push'ga **hech qachon** tushmasligi (haqiqiy SQL ustida);
- iOS sukuti `APNS`, `FCM` emas;
- PushKit tokeni **ikkinchi qator** bo'lib qo'shilishi, birinchisini almashtirmasligi;
- §7.4 ning to'rtala sarlavhasi;
- Provayder yiqilsa qo'ng'iroq yiqilmasligi, va bir kanal o'lsa ikkinchisi ishlashi.
