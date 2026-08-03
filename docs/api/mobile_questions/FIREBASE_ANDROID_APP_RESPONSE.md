# Android push — `google-services.json` · Backend javobi

**Tashxisingiz to'g'ri.** Tekshirdik: backend `studentclub-191b0` dan yuboradi, ilovadagi fayl esa
`studentclubs-d2905` niki — token boshqa loyihaga tegishli bo'lgani uchun FCM
`SENDER_ID_MISMATCH` qaytaradi. Kodda muammo yo'q.

**A yo'li tanlandi va bajarildi:** `studentclub-191b0` ga `uz.studentclub.app` Android ilovasi
qo'shildi, `google-services.json` shu xabar bilan birga. Backend'da FCM kredensiallari
**o'zgarmadi**.

⚠️ **iOS esa to'siqqa uchradi** — `.p8` uchun Apple Developer Program a'zoligi kerak, bizdagi
hisobda u yo'q. §3 da batafsil, u yerda sizga savolimiz bor.

---

## 1. Tasdiq — bizning tomondan

`docs/handoff/PENDING_ACTIONS.md` §5 va `RUNBOOK.md` dagi tekshiruv:

```
FCM auth: OK — project studentclub-191b0
```

Ya'ni backend'ning service account'i ishlayapti va aynan `studentclub-191b0` ga ulangan. Siz
aytgan zanjir to'liq to'g'ri:

`studentclubs-d2905` tokeni → `POST /v1/devices` **200** → push → `SENDER_ID_MISMATCH` →
backend tokenni o'chiradi → foydalanuvchi hech qachon push olmaydi.

## 2. Bir narsani tuzatdik — endi bu jimgina bo'lmaydi

Siz «hech qayerda xato ko'rinmaydi» dedingiz. Tekshirib ko'rdik — **haqiqatan ham shunday edi, va
bu kutilganidan ham yomonroq**: `SENDER_ID_MISMATCH` `UNREGISTERED` (ilova o'chirilgan) bilan
**bir xil** ko'rib chiqilardi va **bitta ham log qatori yozilmasdan** token o'chirilardi.

Endi ikkalasi ajratildi:

| Kod | Ma'nosi | Xatti-harakat |
|---|---|---|
| `UNREGISTERED` / `INVALID_ARGUMENT` | Ilova o'chirilgan, token yangilangan | Odatiy — token o'chiriladi, oddiy trace log |
| **`SENDER_ID_MISMATCH`** | **Token boshqa Firebase loyihasiniki — sozlama xatosi** | Token o'chiriladi, lekin **ERROR** log: |

```
FCM: this device's token belongs to a different Firebase project than studentclub-191b0.
The Android app's google-services.json must come from that same project — until it does,
NO Android device will receive a notification and the registration will keep looking
successful. The device row was removed.
```

Bundan tashqari FCM ham endi har yuborishda iOS'dagidek trace yozadi (§6 monitoring pariteti):

```
fcm deviceId=clx… platform=ANDROID status=200 code=- durationMs=88
```

Token hech qachon log'ga tushmaydi — faqat `deviceId`. Buning testi bor.

Ya'ni: fayl to'g'rilangach ham, kelajakda kimdir noto'g'ri `google-services.json` bilan build
qilsa — **darhol ko'rinadi**, oradan hafta o'tib «nega push kelmayapti» degan savol bo'lmaydi.

## 3. Sizdagi ro'yxatga javob

| # | So'ralgan | Javob |
|---|---|---|
| 1 | `google-services.json` (`studentclub-191b0` + `uz.studentclub.app`) | ✅ **Tayyor** — ilova ro'yxatdan o'tkazildi, fayl shu xabar bilan birga |
| 2 | `APNS_*` env'lari qo'yildimi? | ❌ **Yo'q — va to'siqqa uchradik. Sizning yordamingiz kerak (quyida)** |

Faylni tekshirdik, ikkala qiymat joyida:

```
project_info.project_id                              = studentclub-191b0
client[].client_info.android_client_info.package_name = uz.studentclub.app
```

Ya'ni §6 dagi 1-mezon bajarildi. Qolgan uchtasi sizda — yangi build bilan.

### ⚠️ iOS bloklandi: Apple Developer Program a'zoligi

`.p8` kalitini yaratmoqchi bo'ldik, Apple ruxsat bermadi:

> **Access Unavailable** — This resource is only for developers enrolled in a developer program or
> members of an organization's team in a developer program.

Ya'ni bizdagi Apple ID **pullik Apple Developer Program'da a'zo emas**, shuning uchun
*Certificates, Identifiers & Profiles → Keys* umuman ochilmaydi. Push notification uchun bu a'zolik
majburiy — aylanib o'tish yo'li yo'q.

**Savolimiz: `uz.studentclub.ios` ilovasi kimning Apple Developer hisobida?** Siz iOS build'ini
imzolayotgan bo'lsangiz, o'sha hisob a'zolikka ega bo'lishi kerak.

Kim bo'lsa, ikki yo'ldan bittasi yetadi:

1. **Kalitni o'zi yaratib bersin** (osonroq — bizni hisobga qo'shish shart emas):
   *Certificates, Identifiers & Profiles → Keys → ＋ → Key Name: `StudentClub APNs` →
   «Apple Push Notifications service (APNs)» belgilansin → Continue → Register → Download*
   Bizga kerak: **`.p8` fayl** + **Key ID** (fayl nomida) + **Team ID** (Membership details da)
2. Yoki bizni jamoaga **Admin** roli bilan qo'shsin — o'zimiz yaratamiz

⚠️ `.p8` **bir marta** yuklab olinadi. Uni Firebase'ga **yuklamang** — u bizning serverdagi `.env`
da turadi (`PUSH_APNS_RESPONSE.md` §7).

Kalit kelishi bilan `APNS_*` qo'yiladi, deploy qilinadi va iOS'ni haqiqiy qurilmada birga
tekshiramiz. **Android bunga bog'liq emas** — yuqoridagi fayl bilan darhol ishlaydi.

## 4. §4 «Nimani qilmang» — tasdiqlaymiz

- iOS Firebase'ga **qo'shilmaydi**
- `.p8` Firebase konsoliga **yuklanmaydi** — u serverdagi `.env` da (`APNS_KEY_P8`)
- Mavjud ilovalar / service account kalitlariga tegilmaydi — faqat bitta yangi Android ilovasi
  qo'shiladi

`GoogleService-Info.plist` ni ilovadan olib tashlashingiz to'g'ri — backend uni ishlatmaydi.

## 5. Muhim: fayl kelgandan keyin

⚠️ **Bazadagi eski Android tokenlari allaqachon o'chirilgan** (har push'da `SENDER_ID_MISMATCH`
tufayli). Bu muammo emas — ilova keyingi ishga tushishida `POST /v1/devices` ni qayta chaqiradi
(§7 dagi ro'yxatingizda bor). Ya'ni:

1. Yangi `google-services.json` bilan build qiling
2. Ilovani oching → token qaytadan ro'yxatdan o'tadi
3. Butunlay yoping → boshqa hisobdan xabar → push kelishi kerak

Eski token qo'lda tozalanmaydi, hech narsa qilishingiz shart emas.

## 6. Qabul mezonlari — qanday tekshiramiz

| §6 mezoni | Kim tekshiradi |
|---|---|
| `project_id = studentclub-191b0`, `package_name = uz.studentclub.app` | Siz — faylni ochib ko'zdan kechiring |
| Haqiqiy qurilmada `POST /v1/devices` → 200 | Siz |
| Yopiq ilovaga bildirishnoma keladi | Siz |
| Log'da `SENDER_ID_MISMATCH` yo'q, token o'chirilmaydi | **Biz** — `docker compose logs backend \| grep -E "SENDER_ID_MISMATCH\|fcm deviceId"` |

Endi 4-mezonni tekshirish oson: `status=200` bo'lgan `fcm deviceId=…` qatorlari ko'rinishi kerak,
ERROR esa bo'lmasligi.

---

## 7. Kod o'zgarishi

| Fayl | Nima |
|---|---|
| `src/infrastructure/push/fcm-push.provider.ts` | `SENDER_ID_MISMATCH` ajratildi + ERROR log; har yuborishda trace log |
| `src/infrastructure/push/fcm-push.provider.spec.ts` | 3 ta yangi test |

FCM message payload'i, tokenlarni o'chirish qoidalari, `POST /v1/devices` kontrakti —
**o'zgarmadi**. Kotlin klientini qayta generatsiya qilish kerak emas.

Tekshirish: `npm run lint` ✅ · `npm run build` ✅ · push testlari **64 ta** ✅
