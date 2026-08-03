# Push'da yuboruvchining ismi ko'rinsin

**Holat:** Android push **ishladi** — haqiqiy qurilmada (Samsung, Android 15) tasdiqlandi,
`google-services.json` to'g'rilangandan keyin bildirishnoma keladi. Rahmat.

**Qolgan bitta kamchilik:** bildirishnomada **kimdan kelgani ko'rinmaydi**. Sarlavha doim
«Yangi xabar». `PUSH_APNS_RESPONSE.md` §2 da siz buni ataylab o'zgartirmaganingizni va kerak
bo'lsa aytishimizni yozgan edingiz — **kerak**.

---

## 1. Nima kerak

Telegram/WhatsApp naqshi: **sarlavha — yuboruvchining ismi**, matn — xabarning o'zi.

| | Hozir | Kerak |
|---|---|---|
| `title` | `Yangi xabar` | `Aziz Karimov` |
| `body` | `Salom` | `Salom` (o'zgarmaydi) |

Sabab shunchaki qulaylik emas: bir nechta suhbatdan xabar kelganda foydalanuvchi
bildirishnomalar ro'yxatiga qarab **kimga javob berish kerakligini** ajrata olmaydi — hammasi
bir xil «Yangi xabar» bo'lib turadi.

## 2. Aniq shakl

### FCM (Android)

```jsonc
{
  "notification": {
    "title": "Aziz Karimov",          // ⬅️ yuboruvchining ko'rinadigan ismi
    "body":  "Salom"                  // o'zgarmaydi — §4 dagi matnlar jadvali o'z holicha
  },
  "data": {
    "conversationId": "clx…",
    "messageType": "TEXT",
    "albumId": "clx…",
    "senderId": "clx…",               // ⬅️ yangi
    "senderName": "Aziz Karimov",     // ⬅️ yangi (title bilan bir xil, lekin data'da ham kerak)
    "senderAvatarUrl": "https://…"    // ⬅️ yangi, ixtiyoriy (null bo'lsa maydon yuborilmasin)
  }
}
```

### APNs (iOS)

```jsonc
{
  "aps": {
    "alert": { "title": "Aziz Karimov", "body": "Salom" },
    "sound": "default",
    "badge": 3,
    "thread-id": "clx…",
    "mutable-content": 1
  },
  "conversationId": "clx…",
  "messageType": "TEXT",
  "senderId": "clx…",
  "senderName": "Aziz Karimov",
  "senderAvatarUrl": "https://…"
}
```

`data` qiymatlari FCM'da **doim string** bo'lishi shartini eslab qoling — `senderAvatarUrl`
bo'lmasa maydonni **umuman yubormang**, `null` yoki `"null"` emas.

## 3. Ism qayerdan olinadi

`GET /v1/students/{id}` va suhbat ro'yxati qaytaradigan **o'sha** ko'rinadigan ism —
foydalanuvchi profilida ko'rgan nomi bilan bir xil bo'lsin, aks holda bildirishnomadagi odam
bilan chatdagi odam boshqacha atalib chalkashtiradi.

Chegara holatlari:

| Holat | Kutilgan `title` |
|---|---|
| Ism bo'sh / hisob o'chirilgan | `Yangi xabar` (hozirgi xatti-harakat — zaxira sifatida qoladi) |
| `SYSTEM` turidagi xabar | `StudentClub` yoki hozirgidek `Yangi xabar` — o'zingiz tanlang |
| Albom (10 rasm → 1 push) | Baribir yuboruvchining ismi, `body` esa hozirgidek |

## 4. Nega klient tomonda qilinmaydi

Buni ilovada ham hal qilish mumkin edi (`conversationId` bo'yicha lokal bazadan ismni topish),
lekin uch sababdan qilmadik:

1. **Yangi suhbat lokal bazada bo'lmaydi** — birinchi xabar aynan noma'lum odamdan keladi va
   ism topilmaydi
2. **Fondagi push'ni tizim o'zi chizadi** (`notification` bloki bor bo'lsa `onMessageReceived`
   chaqirilmaydi) — ilova kodi umuman ishlamaydi, sarlavhani almashtirib bo'lmaydi
3. iOS'da ham aynan shu — `aps.alert.title` ni ilova o'zgartira olmaydi (faqat Notification
   Service Extension bilan, bu esa ortiqcha murakkablik)

Ya'ni serverdan kelgan `title` — yagona ishonchli joy.

## 5. Klient tomonda nima bo'ladi

**Hech narsa o'zgarmaydi** — Android `title` nima kelsa shuni ko'rsatadi
(`PushNotifications.kt`), iOS esa `aps.alert.title` ni. Ya'ni siz yuborishni boshlagan
zahoti ism ko'rinadi, ilovaning yangi versiyasi shart emas.

`senderId` / `senderAvatarUrl` ni hozir ishlatmaymiz — ular keyingi qadam uchun (bildirishnomada
avatar va Telegramdek `MessagingStyle`). Yuborilsa yaxshi, yuborilmasa ham bugungi ish bloklanmaydi.

## 6. Qabul mezoni

1. Ikki xil odamdan xabar → bildirishnomalar ro'yxatida **ikkita har xil ism** ko'rinadi
2. Bosilganda o'sha suhbat ochiladi (`conversationId` o'z joyida qoladi)
3. Ism bo'lmagan chegara holatida `Yangi xabar` — bildirishnoma **yo'qolmaydi** va `null`
   yoki bo'sh sarlavha bilan chiqmaydi
4. iOS'da ham xuddi shu (kalit kelgach tekshiramiz)

## 7. Aloqador ochiq ish

`.p8` kaliti hali yo'q — iOS push umuman sinalmagan (`PENDING_ACTIONS.md` §7.1: Apple Developer
Program a'zoligi masalasi). Bu ish undan **mustaqil**: Android'da darhol ko'rinadi, iOS'da esa
kalit kelganda o'zi ishlaydi, chunki payload bir xil manbadan yasaladi.
