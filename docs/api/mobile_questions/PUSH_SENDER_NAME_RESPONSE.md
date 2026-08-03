# Push'da yuboruvchining ismi · Backend javobi

`PUSH_SENDER_NAME_BACKEND.md` bo'yicha **hammasi bajarildi**. Bildirishnoma sarlavhasi endi
yuboruvchining ismi, `data` esa `senderId` / `senderName` / `senderAvatarUrl` ni olib yuradi.

> **Ilova tomonida o'zgarish yo'q va yangi versiya ham kerak emas** — siz §5 da yozganingizdek,
> Android `title` nima kelsa shuni chizadi, iOS esa `aps.alert.title` ni. Deploy bo'lgan zahoti
> hozirgi ilovada ko'rinadi.

> **API kontrakti o'zgarmadi** — hech qanday endpoint, DTO yoki OpenAPI sxemasi tegilmadi. Kotlin
> klientini qayta generatsiya qilish **shart emas**.

---

## 1. Nima o'zgardi

| | Ilgari | Endi |
|---|---|---|
| `title` | `Yangi xabar` (doim) | `Aziz Karimov` — yuboruvchining ismi |
| `body` | xabar matni | **o'zgarmadi** (§4 dagi jadval o'z holicha) |
| `data.senderId` | — | yangi, **doim** yuboriladi |
| `data.senderName` | — | yangi, ism bo'lganda |
| `data.senderAvatarUrl` | — | yangi, avatar bo'lganda |

O'zgarish bitta joyda — offline push yasaladigan nuqtada (`chat.gateway.ts`). FCM va APNs
providerlari `title` va `data` ni allaqachon shaffof o'tkazardi, shuning uchun ularga tegilmadi:
ya'ni Android va iOS **bir manbadan**, farqsiz to'ldiriladi.

## 2. Aniq shakl — §2 bilan bir xil

### FCM (Android)

```jsonc
{
  "notification": { "title": "Aziz Karimov", "body": "Salom" },
  "data": {
    "conversationId": "clx…",
    "messageType": "TEXT",
    "albumId": "clx…",          // faqat albom bo'lsa (avvalgidek)
    "senderId": "clx…",
    "senderName": "Aziz Karimov",
    "senderAvatarUrl": "https://api.studentclub.uz/uploads/…"
  },
  "android": { "priority": "high", "notification": { "sound": "default" } }
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
  "senderAvatarUrl": "https://api.studentclub.uz/uploads/…"
}
```

**`null` hech qachon yuborilmaydi.** Ism yoki avatar yo'q bo'lsa, maydon `data` ga **umuman
qo'shilmaydi** — `"null"` satri ham, bo'sh satr ham emas. Siz so'raganidek.

**Ism 64 belgiga kesiladi** (`title` va `data.senderName` — ikkalasi ham). Haqiqiy ism uchun bu
juda yetarli, lekin bu kosmetik chegara emas: profildagi ism maydonlarida uzunlik cheklovi yo'q, va
4 KB dan oshgan payload'ni FCM `INVALID_ARGUMENT` bilan rad etadi — bu esa bizning kodimizda «token
o'lgan» degani, ya'ni **qabul qiluvchining qurilma tokeni o'chib ketardi** va u hammadan keladigan
push'ni yo'qotardi. Ilova tomonida bu hech narsani talab qilmaydi; shunchaki 64 belgidan uzun
sarlavha kelmasligini bilib qo'ying.

`senderAvatarUrl` **absolut** URL (`PUBLIC_MEDIA_BASE_URL` bilan saqlanadi), qo'shimcha prefiks
kerak emas. U profildagi joriy avatar bilan bir xil — profil rasmlari to'plamining birinchisi.

## 3. Ism qayerdan olinadi — §3 bo'yicha

**To'liq ism → bo'lmasa `username` → bo'lmasa `null`.** Bu aynan `GET /v1/students/{id}` va suhbat
ro'yxati ko'rsatadigan ism: kodda reply/quote snapshot'lari uchun ishlatib kelingan qoidaning
**o'zi**, alohida nusxa yasalmadi. Ya'ni bildirishnomadagi odam bilan chatdagi odam har doim bir xil
ataladi — siz aynan shundan xavotir olgan edingiz.

Chegara holatlari:

| Holat | `title` | `data.senderName` |
|---|---|---|
| Ism ham, username ham yo'q | `Yangi xabar` | yuborilmaydi |
| Faqat bo'sh joydan iborat ism (`"   "`) | `Yangi xabar` | yuborilmaydi |
| Hisob o'chirilgan (satr yo'q) | `Yangi xabar` | yuborilmaydi |
| `SYSTEM` xabar | **`StudentClub`** | yuborilmaydi (`senderAvatarUrl` ham) |
| Albom (10 rasm → 1 push) | yuboruvchining ismi | yuboriladi |

`SYSTEM` da `senderName` **ataylab yuborilmaydi**: sarlavha `StudentClub` bo'lgani uchun `data` da
odamning ismi turishi §2 dagi «`senderName` = `title`» qoidasini buzardi.

`senderId` bu holatlarning **hammasida** yuboriladi — u xabarning o'zidan olinadi, profil satriga
bog'liq emas.

**`SYSTEM` uchun `StudentClub` ni tanladik** (§3 da tanlovni bizga qoldirgan edingiz). Sabab: SYSTEM
satrlarini server yozadi, klientdan bu turdagi xabar umuman qabul qilinmaydi — shuning uchun uni
`senderId` da turgan odamga nisbat berish noto'g'ri bo'lardi. Amalda bu hozircha nazariy holat:
SYSTEM xabar hali hech qayerda yaratilmayapti.

## 4. Bonus — javobsiz qo'ng'iroq ham endi ismli

`CALL` turidagi xabar ham xuddi shu push yo'lidan o'tadi, shuning uchun tekinga yaxshilandi:

```
Ilgari:  «Yangi xabar»       / «📞 Javobsiz qo'ng'iroq»
Endi:    «Aziz Karimov»      / «📞 Javobsiz qo'ng'iroq»
```

Siz buni so'ramagan edingiz — agar qo'ng'iroq bildirishnomasi boshqacha bo'lishi kerak bo'lsa,
ayting.

## 5. Sizning qabul mezoningiz — §6

| # | Mezon | Holat |
|---|---|---|
| 1 | Ikki xil odamdan → ikkita har xil ism | ✅ `title` har push uchun yuboruvchidan olinadi |
| 2 | Bosilganda o'sha suhbat ochiladi | ✅ `conversationId` / `messageType` / `albumId` **o'zgarmadi**, test bilan qulflandi |
| 3 | Ism yo'q → `Yangi xabar`, bildirishnoma yo'qolmaydi | ✅ bo'sh yoki `null` sarlavha chiqmaydi |
| 4 | iOS'da ham xuddi shu | ✅ payload bir manbadan yasaladi; `.p8` kelganda alohida ish talab qilmaydi |

Har bir mezon uchun avtomatik test yozildi (`chat.gateway.spec.ts` — «who the offline push says it
is from»): ism sarlavhada va `data` da, avatar yo'qligida maydon **umuman** yo'qligi, ismsiz holatda
zaxira sarlavha, `SYSTEM` uchun `StudentClub`, va deep-link maydonlari buzilmagani.

## 6. Nima qolgan

- **Deploy** — o'zgarish hozircha `main` ga chiqmagan. Prod'ga chiqqandan keyin darhol ko'rinadi,
  ilovadan hech narsa talab qilmaydi.
- **`senderId` / `senderAvatarUrl`** siz aytganingizdek hozir ishlatilmaydi — ular
  `MessagingStyle` + avatar qadami uchun tayyor turadi. Backend tomondan qo'shimcha ish kerak emas.
- **iOS** — `.p8` kaliti masalasi o'z holicha (`PENDING_ACTIONS.md` §7.1). Bu ish undan mustaqil.
