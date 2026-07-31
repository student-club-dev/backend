# Push bildirishnomalar — mobil tomon sozlamasi

**Holat: backend tayyor va production'da ishlayapti.** Qolgani — mobil tomon.

`02-API-CHANGES.md` §1 dagi «push provayderi faqat log yozadigan stub» degan qator **eskirgan**.
Real FCM provayderi yozildi, testlandi va 2026-07-31 da production'ga chiqarildi.

---

## 1. Firebase loyihasi — majburiy qiymat

| | |
|---|---|
| **Project ID** | **`studentclub-191b0`** |
| Konsol | <https://console.firebase.google.com> |
| Tarif | Spark (bepul) — FCM uchun cheklov yo'q |

⛔ **Bu aynan shu loyiha bo'lishi shart.** `google-services.json` yoki `GoogleService-Info.plist`
ichidagi `project_id` boshqa qiymat bo'lsa, ilova olgan token boshqa loyihaga tegishli bo'ladi va
backend uni yuborganda FCM `SENDER_ID_MISMATCH` qaytaradi. Backend bunday tokenni **o'lik deb
hisoblab bazadan o'chirib yuboradi** — ya'ni xato jimgina yo'qoladi va foydalanuvchi hech qachon
push olmaydi, hech qayerda xato ko'rinmaydi. Bu eng qimmat turdagi nosozlik.

Tekshirish: yuklab olgan fayldagi `project_id` ni ko'zingiz bilan solishtiring.

## 2. Nima qilish kerak — qat'iy ro'yxat

Hozir Firebase loyihasida **bitta ham ilova ro'yxatdan o'tmagan**. Uchala qadam ham majburiy.

### 2.1 Android

1. Firebase Console → **⚙️ Project settings → General → Add app → Android**
2. **Package name** — Android `applicationId` bilan **belgi-ma-belgi** bir xil bo'lishi shart
   (`build.gradle.kts` dagi qiymat). Xato yozilsa token umuman berilmaydi
3. `google-services.json` ni yuklab olib `app/` papkasiga qo'ying
4. `com.google.gms.google-services` plagini va Firebase Messaging bog'liqligini ulang
5. Android 13+ da **`POST_NOTIFICATIONS` ruxsati ish vaqtida so'raladi** — busiz bildirishnoma
   ko'rsatilmaydi, garchi token olinsa ham

### 2.2 iOS

1. Firebase Console → **Add app → iOS**
2. **Bundle ID** — Xcode'dagi bundle identifikatori bilan aynan bir xil
3. `GoogleService-Info.plist` ni yuklab olib Xcode loyihasiga qo'shing
4. **APNs Auth Key** (`.p8`) — Apple Developer → *Certificates, Identifiers & Profiles → Keys* →
   yangi kalit, **Apple Push Notifications service (APNs)** belgilangan holda
5. O'sha `.p8` ni **Firebase'ga** yuklang: *Project settings → Cloud Messaging → APNs Authentication
   Key* (Key ID va Team ID bilan birga)
6. Xcode → *Signing & Capabilities* → **Push Notifications** va **Background Modes → Remote
   notifications** yoqilsin

⛔ **4–5-qadamlarsiz iOS'ga push umuman yetib bormaydi.** FCM iPhone'ga to'g'ridan-to'g'ri yubora
olmaydi — u Apple'ning APNs xizmati orqali o'tadi, buning uchun esa Firebase'da sizning APNs
kalitingiz bo'lishi kerak. Android ishlab, iOS jim qolsa — sabab deyarli har doim shu.

`.p8` faylini **bir marta** yuklab olish mumkin. Yo'qotsangiz yangisini yasaysiz.

### 2.3 Tokenni backendga ro'yxatdan o'tkazish

FCM token olingach uni backendga yuborasiz. Batafsil — quyida §3.

---

## 3. Endpointlar

### `POST /v1/devices` — tokenni ro'yxatdan o'tkazish

Faqat **talaba** hisobi (`StudentGuard`). `Authorization: Bearer <access_token>` majburiy.

```jsonc
// So'rov
{
  "token": "fcm-token-string",
  "platform": "ANDROID"        // "IOS" | "ANDROID" | "WEB"
}
```

```jsonc
// Javob — 200
{ "success": true, "status": 200, "code": null, "message": "OK", "result": null, "error": null }
```

| Kod | Sabab |
|---|---|
| `401 UNAUTHORIZED` / `TOKEN_EXPIRED` | Token yo'q yoki eskirgan |
| `403 FORBIDDEN` | Talaba hisobi emas |
| `422 VALIDATION_ERROR` | `token` bo'sh, yoki `platform` uchlikdan tashqarida |

**Qachon chaqirish kerak — uchala holat ham majburiy:**

1. **Har kirishdan (login) keyin** — token foydalanuvchiga bog'lanadi
2. **`onNewToken` chaqirilganda** — FCM tokenni istalgan vaqtda qayta berishi mumkin (ilova
   qayta o'rnatildi, ma'lumot tozalandi, qurilma tiklandi). Bu hodisani tinglamasangiz token
   eskiradi va push to'xtaydi
3. **Ilova har ishga tushganda** — arzon idempotent chaqiruv, tokenning tirikligini kafolatlaydi

### `DELETE /v1/devices/{token}` — tokenni o'chirish

**Chiqishda (logout) chaqirilishi shart.** Aks holda qurilma egasi almashsa yoki foydalanuvchi
chiqib ketsa ham unga push kelaveradi — bu maxfiylik nuqsoni, chunki xabar matni bildirishnomada
ko'rinadi.

```
DELETE /v1/devices/fcm-token-string
→ 200, result: null
```

### O'lik tokenlar — backend o'zi tozalaydi

FCM `UNREGISTERED`, `INVALID_ARGUMENT` yoki `SENDER_ID_MISMATCH` qaytarsa, backend tokenni
**avtomatik o'chiradi**. Vaqtinchalik nosozlikda (tarmoq, 500) token saqlanadi — aks holda bitta
uzilish tirik foydalanuvchilarni yo'qotardi.

Ya'ni siz eski tokenlarni qo'lda tozalashingiz shart emas.

---

## 4. Push payload — nima keladi

```jsonc
{
  "notification": {
    "title": "Yangi xabar",
    "body":  "<xabar turiga qarab matn>"
  },
  "data": {
    "conversationId": "clx…",
    "messageType": "TEXT",       // TEXT | IMAGE | GIF | VIDEO | VOICE | FILE | STICKER | SYSTEM
    "albumId": "clx…"            // faqat albom bo'lsa
  },
  "android": { "priority": "high", "notification": { "sound": "default" } },
  "apns": { "headers": { "apns-priority": "10" }, "payload": { "aps": { "sound": "default" } } }
}
```

`data` qiymatlari **doim `string`** — FCM boshqa turni qabul qilmaydi. `conversationId` ni deep
link uchun ishlating: bosilganda to'g'ridan-to'g'ri o'sha suhbat ochilsin.

### `body` matnlari — xabar turiga qarab

| Tur | Push matni |
|---|---|
| `TEXT` | xabar matni (120 belgigacha) |
| `IMAGE` | `📷 Rasm` + izoh bo'lsa qo'shiladi |
| `GIF` | `🎞 GIF` |
| `VIDEO` | `🎥 Video` + izoh |
| `VOICE` | `🎤 Ovozli xabar` |
| `FILE` | `📎 <fayl nomi>` |
| `STICKER` | `<emoji> Stiker` |

## 5. Push **qachon** yuboriladi — bu muhim

Backend push'ni **faqat quyidagi shartlar bajarilganda** yuboradi:

1. **Qabul qiluvchining ochiq WebSocket ulanishi yo'q.** Ilova ochiq bo'lsa xabar `message:new`
   hodisasi orqali keladi va push **yuborilmaydi** — ikki marta bildirishnoma chiqmasligi uchun
2. **Albom bo'lsa — faqat bittasi.** 10 ta rasm yuborilsa 10 ta emas, **1 ta** push ketadi

⚠️ Shundan kelib chiqadigan talab: **`message:new` hodisasini push'siz ham to'liq qayta ishlashingiz
kerak.** Ilova ochiq bo'lganda bildirishnomani (agar boshqa ekranda bo'lsa) **o'zingiz**
ko'rsatasiz — backend buni qilmaydi.

---

## 6. Tekshirish tartibi

1. Ilovaga kiring → `POST /v1/devices` **200** qaytarganini tasdiqlang
2. Ilovani **butunlay yoping** (fon emas — WebSocket uzilishi kerak)
3. Boshqa hisobdan xabar yuboring
4. Bildirishnoma kelishi kerak

Kelmasa, tartib bo'yicha tekshiring:

| Belgi | Sabab |
|---|---|
| `POST /v1/devices` 401 | Access token eskirgan — avval `refresh` |
| Android ishlaydi, iOS yo'q | APNs `.p8` Firebase'ga yuklanmagan (§2.2, 4–5-qadam) |
| Ikkalasi ham yo'q | `project_id` mos emas, yoki token ro'yxatdan o'tmagan |
| Ilova ochiq — push yo'q | **Bu to'g'ri xatti-harakat** (§5) |
| Bildirishnoma ko'rinmaydi, lekin token bor (Android 13+) | `POST_NOTIFICATIONS` ruxsati so'ralmagan |

## 7. Qo'ng'iroq push'i (B qism) — hali emas

Yopiq iPhone'da jiringlash uchun **VoIP push (PushKit)** kerak, uni FCM **yubora olmaydi** — u
APNs'ga to'g'ridan-to'g'ri, `apns-push-type: voip` sarlavhasi bilan ketishi shart. Bu alohida
adapter va qo'ng'iroq bosqichida yoziladi. Unda **VoIP Services sertifikati** kerak bo'ladi —
hozirgi `.p8` kaliti bunga yaramaydi.

Ya'ni: oddiy xabar push'i **bugun ishlaydi**, qo'ng'iroq push'i esa B qismi bilan birga keladi.
