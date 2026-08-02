# iOS push — to'g'ridan-to'g'ri APNs · Backend javobi

`PUSH_APNS_BACKEND.md` bo'yicha **hammasi bajarildi**. iPhone endi Apple'ning APNs xizmatidan
to'g'ridan-to'g'ri push oladi — Firebase oralig'i olib tashlandi. Android FCM yo'lida qoldi va unga
**tegilmadi**.

> **Ilova tomonida o'zgarish yo'q.** `iOSApp.swift` allaqachon to'g'ri narsani yuboryapti (xom APNs
> tokeni, 64 hex). Sizga faqat `.p8` kalitini yaratib bizga uzatish qoldi (§7) va haqiqiy qurilmada
> tekshirish.

> **Spec:** `docs/api/generated/student.json` (= `docs/handoff/mobile/student-api.json`) yangilandi.
> O'zgargan yagona joy — `POST /v1/devices` hujjati (yangi 422 kodi). DTO shakli **o'zgarmadi**,
> ya'ni Kotlin klientini qayta generatsiya qilish **shart emas**.

---

## 0. Nima buzilgan edi va nima qilindi

| | Ilgari | Endi |
|---|---|---|
| Android tokeni | FCM'ga | FCM'ga (**o'zgarmadi**) |
| iOS tokeni | **FCM'ga** ❌ | **APNs'ga to'g'ridan-to'g'ri** ✅ |
| Xato ko'rinishi | FCM «muvaffaqiyat» deydi, push yo'qoladi | Apple aniq sabab qaytaradi (`410`, `400 BadDeviceToken`, `400 BadTopic`) |

Yangi `PlatformRoutingPushProvider` har qurilmani uni haqiqatan yeta oladigan xizmatga yuboradi:
`platform = IOS` → APNs, `ANDROID` / `WEB` → FCM. Ikkalasi **parallel va mustaqil** ishlaydi — APNs
yiqilsa Android push'i to'xtamaydi, va aksincha.

---

## 1. Ulanish — §2 bo'yicha

- **HTTP/2**, Node'ning ichki `node:http2` moduli orqali. `fetch`/`axios` ishlatilmadi — ular
  HTTP/1.1 da ishlaydi va APNs ulanishni rad etadi. **Yangi paket qo'shilmadi**
  (`@parse/node-apn` kerak bo'lmadi).
- Ulanish **uzoq yashaydi** va qayta ishlatiladi, har push uchun yangisi ochilmaydi. Uzilib qolsa
  keyingi so'rovda o'zi qayta ulanadi; server o'chganda toza yopiladi.
- **JWT (ES256)** `jose` bilan imzolanadi (loyihada allaqachon bor edi — Apple sign-in uni
  ishlatadi) va **keshlanadi**:
  - ~50 daqiqada bir marta o'zi qayta imzolanadi (Apple'ning 1 soatlik chegarasi);
  - `403 ExpiredProviderToken` kelganda ham **20 daqiqalik pol** hurmat qilinadi — aks holda bitta
    qurilmaning 403'i hammani bloklaydigan `429 TooManyProviderTokenUpdates` ga aylanadi.

  Buning testi bor (`apns-transport.spec.ts`): ketma-ket so'rovlar **bir xil** tokenni oladi.
  Siz aytgan «har so'rovga yangi token imzolash» xatosi shu test bilan qulflab qo'yildi.

## 2. So'rov formati — §3 bo'yicha

```
POST /3/device/<apns-token>
authorization: bearer <jwt>
apns-topic: <APNS_TOPIC>
apns-push-type: alert
apns-priority: 10
apns-expiration: <hozir + 24 soat>
```

```jsonc
{
  "aps": {
    "alert": { "title": "Yangi xabar", "body": "Salom" },
    "sound": "default",
    "badge": 3,
    "thread-id": "clx_conversation_id",
    "mutable-content": 1
  },
  "conversationId": "clx…",
  "messageType": "TEXT",
  "albumId": "clx…"
}
```

- Maxsus maydonlar **ildizda**, `aps` ichida emas — `userInfo["conversationId"]` ishlaydi. Testda
  qamralgan.
- `thread-id` = `conversationId` → bitta suhbatning bildirishnomalari guruhlanadi.
- **`apns-collapse-id` qo'yilmadi** — siz tavsiya qilganingizdek. Har xabar alohida ko'rinadi
  (Telegramdagi kabi). Bu ham testda qulflangan, tasodifan qo'shib yuborilmasligi uchun.
- `title` hozircha **«Yangi xabar»** — bu FCM'dagi mavjud xatti-harakat, uni o'zgartirmadik
  (§0: «payload qoidalari o'zgarmaydi»). Yuboruvchining ismi kerak bo'lsa — alohida ish, ayting.

### `badge` — bajarildi (§3.1)

`aps.badge` ga foydalanuvchining **umumiy** o'qilmagan xabarlari soni ketadi —
`GET /v1/conversations/unread-count` bergan aynan o'sha son. Hammasi o'qilganda keyingi push `0`
yuboradi va belgi o'chadi.

Ixtiyoriy deb belgilangan **jimgina push (`badge: 0`) qilinmadi** — o'qilganda darhol emas, keyingi
push'da yangilanadi. Kerak bo'lsa alohida so'rang.

## 3. `Device` jadvali — §4 bo'yicha

```sql
ALTER TABLE device_tokens ADD COLUMN apns_env "ApnsEnvironment";   -- PRODUCTION | SANDBOX | NULL
ALTER TABLE device_tokens ADD COLUMN last_success_at TIMESTAMP(3);
```

Migratsiya **faqat qo'shadi** — hech qanday qator o'chirilmadi.

**Siz taklif qilgan ikki yo'ldan ikkinchisi tanlandi:** mavjud `platform = IOS` qatorlari
**o'chirilmadi**, `apns_env = NULL` bilan qoldirildi. Birinchi yuborishda backend sozlangan xostga
uradi, `400 BadDeviceToken` kelsa **ikkinchi xostni bir marta sinaydi** va qaysi biri ishlaganini
qatorga yozib qo'yadi. Keyingi yuborishlar to'g'ri xostga boradi — sinov bir marta bo'ladi.

Sababi: bu urinish mantig'i muhitlar chalkashganda **baribir kerak** (debug build'dan olingan token
production xostda ishlamaydi), shuning uchun qatorlarni o'chirishning hojati qolmadi. Ilovani
ochmagan foydalanuvchi ham push'siz qolmaydi.

`last_success_at` — diagnostika: hech qachon muvaffaqiyat ko'rmagan qator sozlama xatosining
belgisi.

### Token validatsiyasi

`POST /v1/devices`, `platform = IOS` → token `^[0-9a-f]{64}$` ga mos kelishi shart. Aks holda:

```jsonc
{ "success": false, "status": 422, "code": null, "message": "Qurilma tokeni noto‘g‘ri",
  "error": { "code": "INVALID_DEVICE_TOKEN", "message": "Qurilma tokeni noto‘g‘ri",
             "fields": { "token": "iOS uchun APNs tokeni kerak — 64 ta hex belgi" } } }
```

Android/web tokenlariga bu shart **qo'llanmaydi**.

Bundan tashqari: bazadagi eski `platform = IOS` qatori APNs formatiga mos bo'lmasa (masalan eski
build FCM tokenini yozib qo'ygan bo'lsa), u Apple'ga **umuman yuborilmaydi** — bunday token hech
qachon ishlamaydi, shuning uchun birinchi push'da o'chiriladi. Ya'ni baza o'zini o'zi tozalaydi.

## 4. Xatolarni qayta ishlash — §5 bo'yicha

| Status | `reason` | Nima qilinadi |
|---|---|---|
| `200` | — | `last_success_at` yangilanadi, `apns_env` eslab qolinadi |
| `400` | `BadDeviceToken` | Ikkinchi xost bir marta sinaladi; u ham shu javobni bersa qator **o'chiriladi** |
| `400` | `BadTopic` va boshqa 400 | **ERROR** log, token **saqlanadi** (sozlama xatosi, qurilmaniki emas) |
| `403` | `ExpiredProviderToken` | JWT qayta imzolanadi (20 daq. polini hurmat qilib) va takrorlanadi |
| `403` | `InvalidProviderToken` | **ERROR** log, token saqlanadi |
| `410` | `Unregistered` | Qator **darhol o'chiriladi** |
| `429` / `5xx` | — | 3 martagacha eksponensial backoff, keyin token **saqlanadi** |
| tarmoq uzildi | — | Token **saqlanadi** |

⚠️ Siz ta'kidlagan qoida qattiq bajarildi: **`410` va ikkala xostdan ham `400 BadDeviceToken` —
o'chirishning yagona sabablari.** Qolgan hamma holatda token joyida qoladi. Har bir tarmoq
uchun alohida test bor, shu jumladan «ikkinchi xost `503` qaytardi → o'chirilmaydi».

## 5. Kuzatuv — §6 bo'yicha (qisman)

Har yuborishda bitta struktura log:

```
apns deviceId=clx… env=PRODUCTION status=200 reason=- durationMs=142
```

`200` → `log`, qolgani → `warn`, sozlama xatolari → `error`. **Token hech qachon log'ga
yozilmaydi** (u aniq bir odamning telefoniga murojaat) — buning testi bor, faqat `deviceId`.

Boot paytida ham baland ogohlantirish bor: `PUSH_PROVIDER=fcm` bo'lsa-yu `APNS_*` sozlanmagan
bo'lsa, ERROR yoziladi — bugungi nosozlik aynan shunday ko'rinardi (Android ishlaydi, iOS jim, hech
qayerda xato yo'q).

**Bajarilmagani:** kunlik hisobot va «bir soat ichida bitta ham `200` yo'q» ogohlantirishi. Bular
hisoblagich saqlash (Redis) va alert kanalini talab qiladi — alohida ish sifatida qoldirildi.
Kerak bo'lsa ayting, qo'shamiz.

## 6. Qabul mezonlari

| §7 mezoni | Holat |
|---|---|
| `POST /v1/devices` `IOS` + 64-hex → `200` | ✅ test bilan |
| Yopilgan iPhone'ga bildirishnoma keladi | ⏳ **`.p8` kaliti kerak** — haqiqiy qurilmada tekshiriladi |
| Bosilganda o'sha suhbat ochiladi (`conversationId` ildizda) | ✅ payload testi bilan |
| Bitta suhbat guruhlanadi (`thread-id`) | ✅ payload testi bilan |
| Ilova ochiq + WS ulangan → push **yo'q** | ✅ o'zgarmadi, test bilan |
| Ilova o'chirilgach `410` bilan tozalanadi | ✅ test bilan |
| Android avvalgidek ishlaydi | ✅ FCM yo'liga tegilmadi, eski testlar o'tadi |
| 10 rasmli albom → 1 ta bildirishnoma | ✅ o'zgarmadi, test bilan |

Ikkinchi qator — yagona ochiq nuqta va u **backendga bog'liq emas**: haqiqiy `.p8` kaliti va
haqiqiy iPhone kerak. Kalit kelgach bir zumda tekshiramiz.

## 7. Sizdan / DevOps'dan nima kerak

Apple Developer → *Certificates, Identifiers & Profiles → Keys* → **Apple Push Notifications
service (APNs)** belgilangan yangi kalit. `.p8` **bir marta** yuklab olinadi.

Keyin server muhitiga (`.env`, hech qachon git'ga emas):

| O'zgaruvchi | Qiymat |
|---|---|
| `PUSH_PROVIDER` | `fcm` — bu «haqiqiy provayderlar» degani: Android→FCM, iOS→APNs |
| `APNS_KEY_P8` | `.p8` faylining ichi, yangi qatorlar `\n` ko'rinishida (FCM kalitidagidek) |
| `APNS_KEY_ID` | Kalit nomidagi 10 belgili id |
| `APNS_TEAM_ID` | Team ID |
| `APNS_TOPIC` | **`uz.studentclub.ios`** — iOS bundle id (Android'nikidan farq qiladi!) |
| `APNS_ENV` | `production` (TestFlight/App Store) yoki `sandbox` (Xcode'dan o'rnatilgan build) |

To'liq izohlar `.env.example` ichida.

⚠️ To'rttasidan bittasi yetishmasa — iOS qurilmalari **o'tkazib yuboriladi** va boot'da hamda har
yuborishda ERROR yoziladi. Jimgina yo'qolmaydi.

## 8. Mobil tomon

- **Android:** o'zgarish yo'q.
- **iOS:** kod o'zgarishi yo'q. Xcode loyihasidan `FirebaseAuth` / `FirebaseFirestore` ni olib
  tashlash mumkin (endi ular hech nimaga kerak emas), *Signing & Capabilities* da **Push
  Notifications** va **Background Modes → Remote notifications** yoqilganini tekshiring.
- Test **haqiqiy qurilmada** — simulyator APNs tokeni bermaydi.
- ⚠️ Xcode'dan o'rnatgan build **sandbox** tokenini oladi, TestFlight **production**. Backend
  ikkalasini ham uddalaydi (o'zi topadi), lekin qaysi build bilan test qilayotganingizni bilib
  turing.

`docs/handoff/mobile/05-PUSH-SETUP.md` §2.2 yangilandi — u yerda ilgari `.p8` ni **Firebase'ga**
yuklash yozilgan edi, endi bu noto'g'ri.

---

## 9. Kod qayerda

| Fayl | Nima qiladi |
|---|---|
| `src/infrastructure/push/apns-transport.ts` | HTTP/2 ulanish + JWT keshi (Apple bilan gaplashadigan qism) |
| `src/infrastructure/push/apns-push.provider.ts` | Payload, sarlavhalar, xato qoidalari, muhit sinovi |
| `src/infrastructure/push/platform-routing-push.provider.ts` | iOS→APNs, Android/web→FCM |
| `src/infrastructure/push/push-provider.ts` | Umumiy port (`PushTarget`, `PushOutcome`) |
| `src/modules/notifications/…` | Qurilma qatorlari, token validatsiyasi, `apns_env` ni eslab qolish |
| `prisma/migrations/20260802061956_device_token_apns_env/` | Migratsiya |

Testlar: `apns-push.provider.spec.ts` (37 ta), `apns-transport.spec.ts` (6),
`platform-routing-push.provider.spec.ts` (4), shuningdek `notifications.service.spec.ts` va
`chat.gateway.spec.ts` (badge) kengaytirildi. Push infratuzilmasi jami **61 ta test**.

## 10. Tekshirish natijasi

```
npm run lint    ✅
npm run build   ✅
npx jest        ✅  106 suite, 1184 test (24 skip — oldindan skip qilinganlar)
```

Ogohlantirish: `apns-transport.ts` ning **soket qismi** (haqiqiy HTTP/2 ulanish, timeout, qayta
ulanish) unit test bilan qoplanmagan — uni Apple'ga ulanmasdan sinab bo'lmaydi. Shuning uchun
mantiq (xato qoidalari, JWT keshi, payload) undan **ajratib** yozildi va to'liq testlangan.
