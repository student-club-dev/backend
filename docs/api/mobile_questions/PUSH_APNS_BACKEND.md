# iOS push — to'g'ridan-to'g'ri APNs · Backend spetsifikatsiyasi

Bugun push **Android'da ishlaydi, iPhone'da umuman kelmaydi**. Sabab bitta va u aniq:
ilova serverga **APNs qurilma tokenini** beradi, backend esa uni **FCM**ga uzatadi — FCM
bunday tokenni tanimaydi va xabar jimgina yo'qoladi.

Bu hujjat backendga iOS uchun **alohida yo'l** qo'shishni tavsiflaydi: Apple'ning o'z
xizmatiga (APNs) to'g'ridan-to'g'ri, Firebase'siz. Android o'z holicha FCM'da qoladi —
Google boshqa kanal bermaydi.

Aloqador: `handoff/05-PUSH-SETUP.md` (hozirgi FCM oqimi, payload va "qachon yuboriladi"
qoidalari — ular **o'zgarmaydi**).

---

## 0. Hozirgi holat va muammo

| | Android | iOS |
|---|---|---|
| Ilova nima yuboradi (`POST /v1/devices`) | FCM registration token | **xom APNs token** (64 belgi, hex) |
| Backend qayerga uzatadi | FCM | FCM ❌ |
| Natija | ✅ keladi | ❌ hech qachon kelmaydi |

Ilovadagi kod (`iosApp/iosApp/iOSApp.swift`):

```swift
let token = deviceToken.map { String(format: "%02x", $0) }.joined()
IosPushBridge.shared.setToken(token: token)   // → POST /v1/devices
```

⚠️ Bu **xato emas** — mahsulot qarori: iOS ilovasida Firebase SDK'si yo'q va bo'lmaydi ham
(auth allaqachon bizning backendda, Firestore ishlatilmaydi). Shuning uchun tokenni
o'zgartirish o'rniga **backend Apple bilan to'g'ridan-to'g'ri gaplashadi**.

**Nega shu variant tanlandi** (muqobili — iOS ilovasiga `FirebaseMessaging` qo'shish):

- APNs `.p8` kaliti **ikkala yo'lda ham** kerak — farqi faqat u Firebase konsoliga
  yuklanadimi yoki bizning serverimizda turadimi;
- Firebase FCM→APNs oralig'ida yana bitta ishlamay qolishi mumkin bo'lgan bo'g'in va
  **diagnostikasi yo'q** qatlam: token o'lganini FCM «muvaffaqiyat» deb qaytarishi mumkin,
  Apple esa aniq `410 Unregistered` beradi;
- ilovada bitta ham Firebase bog'liqligi qolmaydi (hozir iOS Xcode loyihasida
  `FirebaseAuth`/`FirebaseFirestore` — eski auth'dan qolgan keraksiz yuk).

---

## 1. Provayder platformaga qarab tanlanadi

```
Device.platform = ANDROID → FcmPushProvider   (hozirgidek, tegilmaydi)
Device.platform = IOS     → ApnsPushProvider  (yangi)
```

Yuborish **shartlari o'zgarmaydi** (`05-PUSH-SETUP.md` §5): push faqat qabul qiluvchining
ochiq WebSocket ulanishi **yo'q** bo'lganda ketadi; albomga bitta push.

Bitta foydalanuvchida ikkala platformadagi qurilmalar bo'lishi mumkin — har biriga o'z
provayderi bilan yuboriladi, biri yiqilsa ikkinchisi to'xtamaydi.

---

## 2. APNs ulanishi

**Sertifikat emas, kalit** (`.p8`) — u muddatsiz va ikkala muhitga ham yaraydi.

Apple Developer → *Certificates, Identifiers & Profiles → Keys* → **Apple Push
Notifications service (APNs)** belgilangan yangi kalit. Yuklab olingan `.p8` **bir marta**
beriladi — yo'qolsa yangisini yaratish kerak.

### 2.1 Muhit o'zgaruvchilari

| Kalit | Misol | Izoh |
|---|---|---|
| `APNS_KEY_P8` | `-----BEGIN PRIVATE KEY-----\n…` | Kalitning o'zi (bir qatorda, `\n` bilan) yoki `APNS_KEY_PATH` |
| `APNS_KEY_ID` | `ABC123DEFG` | Kalit nomidagi 10 belgili id |
| `APNS_TEAM_ID` | `A1B2C3D4E5` | Apple Developer hisobining Team ID'si |
| `APNS_TOPIC` | `uz.studentclub.ios` | **Bundle id** — ilovaniki, Android'nikidan farq qiladi |
| `APNS_ENV` | `production` \| `sandbox` | Qaysi xostga yuboriladi (§2.3) |

⚠️ `APNS_TOPIC` aynan `uz.studentclub.ios` (Android `uz.studentclub.app` — **ular boshqa**).
Noto'g'ri topic'da Apple `400 BadTopic` qaytaradi.

### 2.2 Avtorizatsiya — JWT (ES256)

Har so'rovda `authorization: bearer <jwt>`:

```jsonc
// header
{ "alg": "ES256", "kid": "<APNS_KEY_ID>" }
// payload
{ "iss": "<APNS_TEAM_ID>", "iat": <hozir, sekundda> }
```

⚠️ Ikkita qoida, ikkalasini ham Apple qattiq nazorat qiladi:

1. Token **1 soatdan uzun** ishlatilmasin — eskisi bilan `403 ExpiredProviderToken` keladi;
2. **20 daqiqada bir martadan tez-tez yangilanmasin** — aks holda `429 TooManyProviderTokenUpdates`.

Ya'ni JWT **keshlanadi** va ~50 daqiqada bir marta qayta imzolanadi. Har so'rovga yangi
token imzolash — eng ko'p uchraydigan xato.

### 2.3 Xost va protokol

| Muhit | Xost |
|---|---|
| Production (TestFlight va App Store) | `https://api.push.apple.com:443` |
| Sandbox (Xcode'dan o'rnatilgan debug build) | `https://api.sandbox.push.apple.com:443` |

⚠️ **HTTP/2 majburiy.** Node'dagi oddiy `fetch`/`axios` HTTP/1.1 da ishlaydi va APNs
ulanishni rad etadi — `node:http2` yoki `@parse/node-apn` kabi kutubxona kerak.

⚠️ Muhitlar **aralashmaydi**: debug qurilmadan olingan token production xostda
`400 BadDeviceToken` beradi va aksincha. Shuning uchun `Device` jadvaliga muhitni yozib
qo'yish tavsiya etiladi (§4).

Ulanish **qayta ishlatilsin**: APNs uzun yashaydigan HTTP/2 ulanishini kutadi, har push
uchun yangisini ochish sekin va Apple uni cheklaydi.

---

## 3. So'rov formati

```
POST /3/device/<apns-token>
authorization: bearer <jwt>
apns-topic: uz.studentclub.ios
apns-push-type: alert
apns-priority: 10
apns-expiration: <hozir + 24 soat, unix sekund>
apns-collapse-id: <conversationId>          // ixtiyoriy, §3.2
```

Tana:

```jsonc
{
  "aps": {
    "alert": { "title": "Kumush", "body": "Salom, bugun uchrashamizmi?" },
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

**Moslik jadvali** — hozirgi FCM payload'i (`05-PUSH-SETUP.md` §4) bilan bir xil ma'no:

| FCM | APNs | Izoh |
|---|---|---|
| `notification.title` | `aps.alert.title` | Yuboruvchining ismi |
| `notification.body` | `aps.alert.body` | O'sha matnlar jadvali (§4 dagi «📷 Rasm», «🎤 Ovozli xabar» …) |
| `data.conversationId` | ildizdagi `conversationId` | ⚠️ `aps` ning **ichida emas** |
| `data.messageType` | ildizdagi `messageType` | |
| `data.albumId` | ildizdagi `albumId` | Faqat albomda |

⚠️ APNs'da `data` degan bo'lim yo'q — maxsus maydonlar **ildizga**, `aps` yonига qo'yiladi.
Ilova ularni `userInfo["conversationId"]` bo'yicha o'qiydi (kod allaqachon shunday yozilgan).

### 3.1 `badge` — o'qilmagan xabarlar soni

`aps.badge` ga foydalanuvchining **umumiy** o'qilmagan xabarlari soni yuborilsin
(`GET /v1/conversations/unread-count` bilan bir xil son). iOS ilova belgisidagi raqamni
o'zi hisoblamaydi — uni faqat server aytadi.

`0` yuborilsa belgi o'chadi. Hammasi o'qilganda (`POST /v1/conversations/{id}/read`)
**jimgina push** (§3.3) bilan `badge: 0` yuborish mumkin — bu ixtiyoriy yaxshilanish.

### 3.2 `thread-id` va `apns-collapse-id`

- `thread-id: <conversationId>` — iOS bitta suhbatning bildirishnomalarini **guruhlaydi**
  (Telegramdagi kabi), aks holda ular alohida-alohida yig'ilib ketadi.
- `apns-collapse-id: <conversationId>` — **ixtiyoriy**: qo'yilsa bitta suhbatdan faqat
  **oxirgi** bildirishnoma ko'rinadi (eskisi almashadi). Telegram bunday qilmaydi (har
  xabar alohida ko'rinadi), shuning uchun **qo'yilmasin** deb tavsiya qilaman — bu qator
  faqat kelajakda kerak bo'lsa deb yozildi.

### 3.3 Jimgina push (kelajak uchun)

`apns-push-type: background`, `apns-priority: 5`, `aps: { "content-available": 1 }` —
ekranda hech nima ko'rinmaydi, ilova fonda uyg'onadi. Hozircha kerak emas; qo'ng'iroq
bosqichida (`CALLS_BACKEND.md`) bu **yetarli bo'lmaydi** — u yerda VoIP push (PushKit,
`apns-push-type: voip`) va **alohida sertifikat** kerak.

---

## 4. `Device` jadvali

Yangi ustun **kerak emas**, lekin ikkitasi ish sifatini sezilarli oshiradi:

```sql
ALTER TABLE device ADD COLUMN apns_env text;          -- 'production' | 'sandbox' | null
ALTER TABLE device ADD COLUMN last_success_at timestamptz;
```

**Migratsiya — muhim.** Bugungi `platform = IOS` qatorlaridagi tokenlar hech qachon
ishlamagan (ular FCM'ga yuborilgan). Ular **APNs formatida** (64 ta hex belgi), ya'ni
yaroqli, lekin qaysi muhitdan olingani noma'lum. Ikki yo'l:

- eng sodda: `platform = IOS` qatorlarini **o'chirib tashlash** — ilova keyingi ochilishda
  tokenni qaytadan yuboradi (`PushRegistrar` sessiya boshlanganda har safar chaqiradi);
- yoki `apns_env = null` qoldirib, birinchi yuborishda ikkala xostga urinib ko'rish va
  qaysi biri ishlaganini yozib qo'yish.

**Token validatsiyasi** (`POST /v1/devices`): `platform = IOS` bo'lsa token
`^[0-9a-f]{64}$` shartiga mos kelsin. Mos kelmasa `422 INVALID_DEVICE_TOKEN` — hozir
FCM tokeni yuborilayotgan bo'lsa buni darhol ko'rsatadi.

---

## 5. Xatolarni qayta ishlash

Apple javobi — HTTP status + `{"reason": "..."}`.

| Status | `reason` | Nima qilinadi |
|---|---|---|
| `200` | — | Yetdi. `last_success_at` yangilanadi |
| `400` | `BadDeviceToken` | Token yaroqsiz **yoki muhit noto'g'ri** — boshqa xostga bir marta urinib ko'ring, u ham yiqilsa qator **o'chiriladi** |
| `400` | `BadTopic` | `APNS_TOPIC` xato — konfiguratsiya xatosi, log'da **ko'rinarli** bo'lsin |
| `403` | `ExpiredProviderToken` | JWT eskirgan — qayta imzolang va **bir marta** takrorlang |
| `403` | `InvalidProviderToken` | `.p8` / `kid` / `teamId` mos emas — konfiguratsiya xatosi |
| `410` | `Unregistered` | Ilova o'chirilgan — qator **darhol o'chiriladi** |
| `429` | `TooManyRequests` | Shu qurilmaga juda tez-tez — orqaga chekinib (backoff) qayta urinish |
| `500`/`503` | — | Apple tomonda; 3 martagacha eksponensial backoff bilan qayta urinish |

⚠️ `410` va ikki marta `400 BadDeviceToken` — **yagona** o'chirish sabablari. Boshqa
xatoda tokenni o'chirmang: bir martalik tarmoq nosozligi tufayli foydalanuvchi push'siz
qolib ketadi va buni hech kim sezmaydi.

---

## 6. Kuzatuv

Bu bo'lim ixtiyoriy emas: push jimgina yo'qoladigan turdagi nosozlik — foydalanuvchi ham,
biz ham bilmay qolamiz. Kamida:

- har yuborishda log: `deviceId`, `platform`, status, `reason`, javob vaqti;
- kunlik hisob: yuborilgan / `410` / `400` soni platformalar kesimida;
- ogohlantirish: bir soat ichida `platform = IOS` uchun **bitta ham `200`** bo'lmasa (bugungi
  nosozlik aynan shunday ko'rinadi va uni hech qanday testsiz sezib bo'lmaydi).

---

## 7. Qabul mezonlari

- [ ] `POST /v1/devices` `platform = IOS`, 64-hex token bilan `200` qaytaradi.
- [ ] Ilova **butunlay yopilgan** iPhone'ga xabar yuborilganda bildirishnoma keladi.
- [ ] Bildirishnoma bosilganda ilova o'sha suhbatni ochadi (`conversationId` ildizda).
- [ ] Bitta suhbatning bildirishnomalari **guruhlanadi** (`thread-id`).
- [ ] Ilova ochiq va WebSocket ulangan bo'lsa push **kelmaydi** (§1 — hozirgi qoida).
- [ ] Ilova iPhone'dan o'chirilgach, keyingi yuborishda qator `410` bilan tozalanadi.
- [ ] Android push **avvalgidek** ishlaydi (FCM yo'liga tegilmagan).
- [ ] 10 ta rasmli albom — **1 ta** bildirishnoma.

---

## 8. Mobil tomon (backend tayyor bo'lgach)

- **Android:** o'zgarish yo'q. FCM allaqachon ishlaydi.
- **iOS:** ilova tomonida ham o'zgarish yo'q — APNs tokeni allaqachon to'g'ri formatda
  yuboriladi (`iOSApp.swift`). Faqat Xcode loyihasidan eski `FirebaseAuth` /
  `FirebaseFirestore` bog'liqliklari olib tashlanadi va *Signing & Capabilities* da **Push
  Notifications** hamda **Background Modes → Remote notifications** yoqilganini tekshiramiz.
- Test **haqiqiy qurilmada**: simulyatorda APNs tokeni umuman kelmaydi.
