# Android push bloklangan — `google-services.json` kerak

**Qisqacha:** Android push hozir **umuman ishlamaydi** va bu jimgina nosozlik. Sabab konsolda —
kodda emas. Bizga `studentclub-191b0` loyihasidan Android ilovasining `google-services.json`
fayli kerak. Ikki yo'ldan **bittasi** yetadi (§3).

iOS tomoni bu hujjatga aloqasiz — `PUSH_APNS_RESPONSE.md` bo'yicha hammasi tayyor, u yerda faqat
`.p8` kaliti va serverdagi `APNS_*` qolgan (§5).

---

## 1. Nima noto'g'ri

Ilovadagi `androidApp/google-services.json` **boshqa Firebase loyihasiniki**:

| | Qiymat |
|---|---|
| Ilovadagi fayl | `project_id = studentclubs-d2905` |
| Backend yuboradigan loyiha | `project_id = studentclub-191b0` |

`05-PUSH-SETUP.md` §1 aynan shu holatni ogohlantirgan edi. Oqibati:

1. Ilova `studentclubs-d2905` ga tegishli FCM tokenini oladi
2. `POST /v1/devices` uni **200** bilan qabul qiladi — bu bosqichda hech qanday xato yo'q
3. Backend push yuborganda FCM **`SENDER_ID_MISMATCH`** qaytaradi
4. Backend tokenni o'lik deb hisoblab **bazadan o'chiradi**

Ya'ni: hech qayerda xato ko'rinmaydi, `/v1/devices` muvaffaqiyatli, log toza — lekin foydalanuvchi
hech qachon push olmaydi. Test paytida buni «ilova xato yozgan» deb o'ylash oson, sabab esa
konsolda.

## 2. Nega o'zimiz qila olmadik

Firebase Console'ga kirdik: **`quvonchbekgafurov07@gmail.com`** hisobida `studentclub-191b0`
loyihasi **ko'rinmaydi**.

```
The project does not exist or you do not have permission to list apps in the project
```

Bu hisobda faqat `studentclubs-d2905` va `elonuz-5dcca` bor. Loyiha sizniki, shuning uchun
Android ilovasini faqat siz ro'yxatdan o'tkaza olasiz.

## 3. Nima kerak

O'z hisobingiz bilan Firebase Console → `studentclub-191b0` → ⚙️ **Project settings → General →
Add app → Android**:

| Maydon | Qiymat |
|---|---|
| **Android package name** | **`uz.studentclub.app`** — belgi-ma-belgi, boshqa hech narsa |
| Nickname | `StudentClub Android` (ixtiyoriy) |
| Debug signing certificate SHA-1 | **bo'sh qoldiring** — FCM uchun kerak emas |

«Register app» → **`google-services.json`** ni yuklab olib bizga yuboring. Keyingi qadamlarni
(Gradle plagini, SDK) o'tkazib yuboring — ilovada allaqachon sozlangan.

Bizni loyihaga a'zo qilishning hojati yo'q — faylning o'zi yetadi. U sir emas: ichidagi kalit
ochiq klient kaliti, baribir ilova APK'sida bo'ladi. Bizda ham `.gitignore` da turadi.

### Zaxira yo'l (agar yuqoridagisi noqulay bo'lsa)

Backend bizning `studentclubs-d2905` loyihamizga o'tadi: Project settings → Service accounts →
*Generate new private key* → serverdagi `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY`
almashtiriladi (`PENDING_ACTIONS.md` §7 dagi skript bilan) va
`docker compose up -d --force-recreate backend`.

⚠️ Buni **tavsiya qilmaymiz**: sizda `FCM auth: OK — project studentclub-191b0` allaqachon
tekshirilgan, ishlab turgan konfiguratsiyani o'zgartirishning hojati yo'q.

### Bizga yuboriladigan narsalar — ro'yxat

| # | Nima | Izoh |
|---|---|---|
| 1 | **`google-services.json`** | `studentclub-191b0` + `uz.studentclub.app` uchun. Yagona majburiy narsa |
| 2 | Tasdiq: `APNS_*` env'lari qo'yildimi | §5 — iOS push shunga bog'liq, javob «ha/yo'q» yetadi |

Boshqa hech nima kerak emas: `GoogleService-Info.plist` ham, `.p8` ham, konsolga kirish ham
bizga berilmasin.

## 4. Nimani qilmang

- ⛔ **iOS ilovasini Firebase'ga qo'shmang.** iPhone push endi APNs'ga to'g'ridan-to'g'ri boradi;
  `GoogleService-Info.plist` bizga kerak emas va uni ilovadan olib tashlaymiz
- ⛔ **APNs `.p8` kalitini Firebase konsoliga yuklamang.** U serverdagi `.env` da turadi
  (`APNS_KEY_P8`) — `PUSH_APNS_RESPONSE.md` §7
- ⛔ Mavjud ilovalar, service account kalitlari yoki loyiha sozlamalariga tegmang — A yo'lida
  faqat **bitta yangi Android ilovasi qo'shiladi**

## 5. Shu bilan birga qoladigan ish (eslatma)

`PUSH_APNS_RESPONSE.md` §7 bo'yicha iOS uchun serverdagi `.env` ga hali qo'yilmagan:

```dotenv
PUSH_PROVIDER=fcm
APNS_KEY_P8=
APNS_KEY_ID=
APNS_TEAM_ID=
APNS_TOPIC=uz.studentclub.ios
APNS_ENV=production
```

Bundle id tasdiqlandi: iOS `uz.studentclub.ios`, Android `uz.studentclub.app` — ikkalasi
**boshqa-boshqa**, `APNS_TOPIC` ga iOS'niki ketadi.

## 6. Qabul mezoni

1. `google-services.json` ichida `project_info.project_id = studentclub-191b0` va
   `client[].client_info.android_client_info.package_name = uz.studentclub.app`
2. Haqiqiy Android qurilmada: ilovaga kirish → `POST /v1/devices` **200**
3. Ilovani butunlay yopish (WS uzilishi shart) → boshqa hisobdan xabar → **bildirishnoma keladi**
4. Backend logida `SENDER_ID_MISMATCH` yo'q va token bazadan o'chirilmaydi

## 7. Mobil tomonda holat

Kodda hech qanday ish qolmagan — faqat fayl kutilyapti:

| Narsa | Holat |
|---|---|
| `firebase-messaging` + `google-services` plagini | ✅ ulangan |
| `StudentClubMessagingService` (`onNewToken`, `onMessageReceived`) | ✅ |
| `POST /v1/devices` — har kirishda, har ishga tushishda, token yangilanganda | ✅ |
| `DELETE /v1/devices/{token}` — chiqishda | ✅ |
| `POST_NOTIFICATIONS` ruxsati (Android 13+) | ✅ |
| Bildirishnoma bosilganda `conversationId` bo'yicha suhbatni ochish | ✅ |
| To'g'ri `google-services.json` | ⛔ **shu hujjat** |
