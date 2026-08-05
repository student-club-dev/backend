# Push katalogi — Backend spetsifikatsiyasi

Bu hujjat ilovadagi **barcha push bildirishnomalarining yagona ro'yxati**: qaysi hodisada
push ketadi, uning matni qanday tuziladi, `data` da nima keladi va u ilova ichidagi
ro'yxatga yoziladimi.

Bugungacha bu ma'lumot ikkiga bo'lingan edi va hech qayerda to'liq emas edi:

| Hujjat | Nimani qamraydi |
|---|---|
| `handoff/05-PUSH-SETUP.md` | Transport: FCM/APNs sozlamasi, `POST /v1/devices`, **faqat xabar push'i** payloadi |
| `NOTIFICATIONS_BACKEND.md` | **Ilova ichidagi ro'yxat**: `GET /v1/notifications`, `type`/`target` modeli |
| `CALLS_BACKEND.md` §7 | Qo'ng'iroq kanali: VoIP push (iOS) va `data`-push (Android) |
| **shu hujjat** | Hodisalar katalogi — har bir push uchun matn, `data`, kanal, chastota |

Yakuniy API kontrakti baribir `dev/api-client-generator/student-club.json` (OpenAPI v1) —
u yagona manba. Bu hujjat push'ning **mazmuni** haqida, sxema haqida emas.

---

## 0. Hozirgi holat

| Hodisa | Push bugun | Ro'yxatga yozuv |
|---|---|---|
| Yangi xabar (chat) | ✅ ishlaydi | ❌ ro'yxatning o'zi yo'q |
| Javobsiz qo'ng'iroq | ✅ ishlaydi (FCM, ismli) | ❌ |
| Kiruvchi qo'ng'iroq (jiringlash) | ❌ VoIP hali yozilmagan (`CALLS_BACKEND.md` §7) | — yozilmaydi |
| Bog'lanish so'rovi | ❌ | ❌ |
| E'lon moderatsiyasi / muddati | ❌ | ❌ |
| Mos ish e'loni / chegirma tugashi | ❌ | ❌ |
| Tizim xabari | ❌ | ❌ |

Ya'ni bugun **faqat chat kanali** tirik. Qolgan hamma qatorlar shu hujjat bilan
so'ralmoqda. Ro'yxat tomoni (`GET /v1/notifications`) — `NOTIFICATIONS_BACKEND.md`.

---

## 1. Umumiy qoidalar

1. **Push va ro'yxat qatori bitta manbadan chiqadi.** Telefon ekranida ko'ringan xabar
   ilovadagi ro'yxatdan topilmasa — bu nosozlik. Istisno faqat kiruvchi qo'ng'iroq (§3.2).
2. **Ochiq WebSocket bo'lsa push yuborilmaydi** (`05-PUSH-SETUP.md` §5). Bu qoida butun
   katalogga tegishli, faqat chatga emas.
3. **`data` qiymatlari doim `string`** — FCM boshqa turni qabul qilmaydi. Sonni ham
   `"3"` deb yuboring.
4. **Payload 4 KB dan oshmasin.** Oshsa FCM `INVALID_ARGUMENT` qaytaradi va backend buni
   «token o'ldi» deb talqin qilib tokenni o'chirib yuborishi mumkin — eng qimmat nosozlik
   turi. Ism 64 belgiga, `body` 120 belgiga kesiladi.
5. **Tayyor deeplink yubormang.** Ro'yxatdagidek `targetType` + `targetId` juftligi
   (`NOTIFICATIONS_BACKEND.md` §1.2): mobil navigatsiya o'zgarsa backend qo'zg'almaydi.
6. **Noma'lum tur xavfsiz.** Klient tanimagan `type` ni `SYSTEM` deb chizadi, tanimagan
   `targetType` ni `null` deb hisoblaydi (hech qayerga o'tmaydi). Ya'ni katalogga yangi
   qator qo'shish eski ilovani buzmaydi.

---

## 2. `data` konverti — hamma push uchun bir xil

```jsonc
{
  "notification": { "title": "…", "body": "…" },
  "data": {
    "kind":           "CHAT",            // katalogdagi hodisa turi (= ro'yxatdagi `type`)
    "targetType":     "CHAT",            // CHAT | LISTING | CONNECTION_REQUESTS | MY_LISTINGS | PROFILE
    "targetId":       "cnv_01H…",        // targetType talab qilmasa — maydon umuman yo'q
    "notificationId": "ntf_01HX…",       // ro'yxatdagi qator id'si (§4.1)
    "conversationId": "cnv_01H…"         // ⚠️ faqat chat/qo'ng'iroqda — eski klient uchun
  },
  "android": { "priority": "high", "collapse_key": "…", "notification": { "sound": "default" } }
}
```

iOS'da (`05-PUSH-SETUP.md` §4) o'sha maydonlar **ildizda**, `aps` yonida turadi;
`aps.thread-id` — guruhlash kaliti (§4.2).

⚠️ **`conversationId` ni olib tashlamang.** Bugungi ilova push bosilganda faqat shu
maydonni o'qiydi (Android: `MainActivity` → `PushRoute`; iOS: `iOSApp.swift` →
`IosPushBridge`). `targetType`/`targetId` ni ilova hozircha **push'da** ishlatmaydi —
u ro'yxatda ishlaydi. Ikkalasini birga yuboring: chat push'i bugun ham ishlayveradi,
qolgan turlar esa klient yangilanishi bilan o'zi joyiga tushadi.

### 2.1 `notificationId` nega kerak

Push bosilib ilova ochilganda o'sha bildirishnoma ro'yxatda **o'qilgan** bo'lib turishi
kerak. `notificationId` bo'lsa klient `POST /v1/notifications/read` ga aynan o'shani
yuboradi. Bo'lmasa foydalanuvchi push'ni ko'rgan bo'lsa ham ro'yxatda o'qilmagan qolib
ketadi va hisob (`unreadCount`) yolg'on ko'rsatadi.

---

## 3. Katalog

`type` — ro'yxatdagi tur (ikonka va rang, `NOTIFICATIONS_BACKEND.md` §1.1).
«Ro'yxat» ustuni — `Notification` qatori yoziladimi.

### 3.1 Suhbat va odamlar

| # | Hodisa | `type` | `targetType` + `targetId` | Push | Ro'yxat |
|---|---|---|---|---|---|
| 1 | Yangi xabar | `CHAT` | `CHAT` + `conversationId` | ✅ FCM/APNs | ✅ |
| 2 | Albom (10 rasm) | `CHAT` | `CHAT` + `conversationId` | ✅ **1 ta** push | ✅ 1 ta qator |
| 3 | Javobsiz qo'ng'iroq | `CHAT` | `CHAT` + `conversationId` | ✅ FCM/APNs | ✅ |
| 4 | Bog'lanish so'rovi keldi | `CONNECTION` | `CONNECTION_REQUESTS` | ✅ | ✅ |
| 5 | So'rov qabul qilindi | `CONNECTION` | `CHAT` + `conversationId` | ✅ | ✅ |

**Matnlar:**

| # | `title` | `body` |
|---|---|---|
| 1 | yuboruvchining ismi | xabar turiga qarab (`05-PUSH-SETUP.md` §4 jadvali) |
| 2 | yuboruvchining ismi | `📷 N ta rasm` |
| 3 | yuboruvchining ismi | `📞 Javobsiz qo'ng'iroq` (video bo'lsa `📹`) |
| 4 | `Yangi so'rov` | `<Ism> siz bilan bog'lanmoqchi` |
| 5 | `<Ism>` | `So'rovingiz qabul qilindi — endi yozishingiz mumkin` |

Ism qoidasi hamma qatorda bir xil: to'liq ism → bo'lmasa `username` → ikkalasi ham
bo'lmasa `Yangi xabar` / `StudentClub` (`05-PUSH-SETUP.md` §4).

### 3.2 Kiruvchi qo'ng'iroq — alohida kanal

| Hodisa | Kanal | Ro'yxat |
|---|---|---|
| Jiringlash (iOS) | APNs to'g'ridan-to'g'ri, `apns-push-type: voip` | ❌ |
| Jiringlash (Android) | FCM, `priority: high`, **faqat `data`** | ❌ |

Payload va sarlavhalar — `CALLS_BACKEND.md` §7.4/§7.5. Bu yerda takrorlanmaydi.

⛔ **VoIP kanaliga qo'ng'iroqdan boshqa hech narsa yuborilmasin.** Bitta «sinov uchun»
yuborilgan VoIP push iOS'ni qurilmaga keyingi VoIP push'larni umuman bermay qo'yishga
majbur qilishi mumkin (`CALLS_BACKEND.md` §7.4).

Jiringlash ro'yxatga **yozilmaydi**: u bir zumlik holat. Ro'yxatga faqat natijasi
tushadi — javobsiz qo'ng'iroq (§3.1 №3).

### 3.3 E'lonlar

| # | Hodisa | `type` | `targetType` + `targetId` | Push | Ro'yxat |
|---|---|---|---|---|---|
| 6 | E'lon moderatsiyadan o'tdi | `LISTING` | `MY_LISTINGS` | ✅ | ✅ |
| 7 | E'lon rad etildi | `LISTING` | `MY_LISTINGS` | ✅ | ✅ |
| 8 | E'lon muddati tugayapti | `LISTING` | `MY_LISTINGS` | ✅ (§5.2) | ✅ |
| 9 | Yangi mos ish e'loni | `JOB` | `LISTING` + `listingId` | ⚠️ digest (§5.1) | ✅ har biri |
| 10 | Chegirma tugayapti | `DISCOUNT` | `LISTING` + `listingId` | ✅ (§5.2) | ✅ |

**Matnlar:**

| # | `title` | `body` |
|---|---|---|
| 6 | `E'loningiz tasdiqlandi` | `"<e'lon sarlavhasi>" endi hammaga ko'rinadi` |
| 7 | `E'lon rad etildi` | `"<sarlavha>" — <moderator sababi>` |
| 8 | `E'lon muddati tugayapti` | `"<sarlavha>" <N> kundan keyin yopiladi` |
| 9 | `Yangi ish e'loni` | `<sarlavha> — <maosh yoki kompaniya>` |
| 10 | `Chegirma tugayapti` | `<merchant>: <chegirma> — <N> kun qoldi` |

⚠️ №7 da moderator sababi majburiy: «rad etildi» deb qo'yib, nega ekanini aytmaslik —
foydalanuvchini qo'llab-quvvatlashga majburlaydi. Sabab bo'lmasa umumiy matn:
`Qoidalarga mos kelmadi — tahrirlab qayta yuboring`.

### 3.4 Tizim

| # | Hodisa | `type` | `targetType` | Push | Ro'yxat |
|---|---|---|---|---|---|
| 11 | Xush kelibsiz / yangilanish / e'lon | `SYSTEM` | `null` | ⚠️ faqat aniq belgilansa | ✅ |
| 12 | Profilga oid (tasdiq, universitet) | `SYSTEM` | `PROFILE` | ✅ | ✅ |

Tizim xabarlari **odatiy holda push emas**: ular ro'yxatga yoziladi va foydalanuvchi
o'zi ko'radi. Push kerak bo'lsa — admin panelida aniq belgilansin (`sendPush: true`).
Sabab: marketing xabarlari push bo'lib chiqsa foydalanuvchi bildirishnomalarni butunlay
o'chirib qo'yadi va shu bilan chat push'i ham yo'qoladi.

---

## 4. Guruhlash va almashtirish

### 4.1 Bitta hodisa — bitta qator

| Nima | Android `collapse_key` | iOS `aps.thread-id` |
|---|---|---|
| Chat | `chat:<conversationId>` | `<conversationId>` |
| Qo'ng'iroq | `call` | `call:<conversationId>` |
| Bog'lanish | `connection` | `connection` |
| E'lon (o'z e'lonim) | `my-listings` | `my-listings` |
| Tavsiya (ish, chegirma) | `feed` | `feed` |
| Tizim | `system` | `system` |

Bir suhbatdan ketma-ket 5 ta xabar kelsa — tray'da **1 ta** qator turishi kerak, 5 ta
emas. Android'da buni `collapse_key`, iOS'da `thread-id` hal qiladi.

### 4.2 `aps.badge`

Bugun `badge` = o'qilmagan **xabarlar** soni (`GET /v1/conversations/unread-count`).
Ro'yxat qo'shilgach u **o'qilmagan bildirishnomalar** soni bilan qo'shilishi kerak,
aks holda ikkita hisob ikki xil raqam ko'rsatadi. Formula:

```
badge = unreadConversations + unreadNotifications
```

---

## 5. Chastota — ilova nafratlanadigan holatga tushmasin

### 5.1 Tavsiyalar bir kunda bir marta

№9 (mos ish e'loni) har e'lon uchun alohida push bo'lsa, ertalab 12 ta bildirishnoma
keladi. Talab: **ro'yxatga har biri alohida yoziladi, push esa kuniga bittadan oshmaydi**:

| Yangi e'lonlar soni | Push matni |
|---|---|
| 1 | `Yangi ish e'loni` + sarlavha |
| 2+ | `<N> ta yangi ish e'loni` + `targetType: null` (ro'yxat ochiladi) |

### 5.2 Muddat eslatmalari — bir marta

№8 va №10 bir e'lon uchun **umrida bir marta** yuborilsin (masalan tugashiga 3 kun
qolganda), har kuni emas.

### 5.3 Tungi jimlik

Toshkent vaqti bilan **22:00–08:00** oralig'ida push yuborilmaydi va ertalab 08:00 ga
suriladi. **Istisno — chat, qo'ng'iroq va bog'lanish** (§3.1, §3.2): ular odamlar
o'rtasidagi jonli muloqot, kechiktirilsa ma'nosi yo'qoladi.

Ro'yxatga yozuv esa **darhol** yoziladi — jimlik faqat push'ga tegishli.

---

## 6. Klient bugun nimani qo'llab-quvvatlaydi

| Imkoniyat | Holat |
|---|---|
| Push'ni ko'rsatish (Android kanali, iOS banner) | ✅ |
| Bosilganda **suhbat**ni ochish (`conversationId`) | ✅ |
| Bosilganda boshqa ekranni ochish (`targetType`/`targetId`) | ❌ klientda yozilishi kerak |
| Push'ni o'qilgan deb belgilash (`notificationId`) | ❌ klientda yozilishi kerak |
| Bildirishnomalar ro'yxati | ✅ tayyor, bayroq ostida (`NOTIFICATIONS_REMOTE_ENABLED`) |

Ya'ni backend §3 ni bajarsa, **chat push'i bugungidek ishlayveradi**, qolganlari esa
tray'da to'g'ri ko'rinadi va bosilganda ilovani ochadi (ekranga o'tish klient
yangilanishida qo'shiladi). Hech narsa buzilmaydi.

---

## 7. Ochiq savollar — javob kerak

1. **Javobsiz qo'ng'iroq qaysi `type` bilan yozilsin?** Bu hujjat `CHAT` deb taklif
   qiladi (suhbatga tegishli). Alohida `CALL` turi ham mumkin — u holda ro'yxatga yangi
   ikonka kerak, klient esa uni hozircha `SYSTEM` deb chizadi (§1.6).
2. **№9 digest'i kimga yuboriladi?** «Mos» e'lon nima asosida aniqlanadi —
   universitet, kurs, saqlangan qidiruv? Mezon bo'lmasa bu push spam bo'lib chiqadi.
3. **Foydalanuvchi turlarni o'chira oladimi?** «Sozlamalar → bildirishnomalar» ekrani
   hozir yo'q. Kerak bo'lsa backendda `notificationPreferences` va uni hurmat qiladigan
   filtr kerak — buni oldindan bilish yaxshi.

---

## 8. Qabul mezonlari

- [ ] §3 dagi **har bir** qator uchun push yuboriladi va `Notification` qatori yoziladi
- [ ] `data` konverti §2 dagidek: `kind`, `targetType`, `targetId`, `notificationId`
- [ ] `conversationId` chat va qo'ng'iroq push'ida **saqlanib qoldi** (eski klient)
- [ ] `collapse_key` / `thread-id` §4.1 jadvalidagidek
- [ ] Tavsiyalar kuniga bittadan oshmaydi (§5.1), muddat eslatmasi bir marta (§5.2)
- [ ] 22:00–08:00 da faqat chat/qo'ng'iroq/bog'lanish push'i ketadi (§5.3)
- [ ] VoIP kanalida **faqat** qo'ng'iroq (§3.2)
- [ ] `student-club.json` yangilandi va ilovaga berildi
