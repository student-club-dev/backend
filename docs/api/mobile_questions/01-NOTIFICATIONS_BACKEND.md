# Bildirishnomalar ro'yxati — Backend spetsifikatsiyasi

Bu hujjat **Student Club** ilovasidagi «Bildirishnomalar» ekranini backendga ulash uchun
nima kerakligini tavsiflaydi.

Yakuniy API kontrakti — `dev/api-client-generator/student-club.json` (OpenAPI v1).
**U yagona manba**: Kotlin klienti o'sha yerdan generatsiya qilinadi.

> **Push bilan ADASHTIRMANG.** `POST /v1/devices` (qurilma tokenini ro'yxatdan o'tkazish)
> allaqachon bor va ishlaydi — u telefon **ekrani yopiq** bo'lganda keladigan push uchun.
> Bu hujjat esa **ilova ichidagi ro'yxat** haqida: foydalanuvchi bosh ekrandagi qo'ng'iroq
> tugmasini bosganda ochiladigan sahifa. Ular bir-birini almashtirmaydi: push — bir
> martalik signal, ro'yxat — tarix.

---

## 0. Hozirgi holat

| Kerak | Backend holati |
|---|---|
| Qurilma push tokeni (`POST /v1/devices`) | ✅ bor |
| Bildirishnomalar ro'yxati | ❌ **yo'q** |
| O'qilmaganlar soni | ❌ yo'q |
| O'qildi deb belgilash | ❌ yo'q |

Klient tomoni **to'liq tayyor va joylangan**: ekran, local kesh (SQLDelight), o'qildi
belgisi, «hammasini o'qildi» tugmasi va bildirishnoma ustiga bosilganda kerakli ekranga
o'tish — hammasi yozilgan. Ular bitta bayroq ostida turibdi:

```kotlin
// dev/core/di/src/commonMain/kotlin/dev/core/di/CoreModules.kt
const val NOTIFICATIONS_REMOTE_ENABLED = false   // ← endpoint joylangan kuni `true`
```

Ya'ni backend §2–§4 ni bajarsa, ilovada **bitta qatorni** o'zgartirish kifoya.

Hozircha bayroq `false`: yoqilsa ekran har ochilganda `404` oladi va «Ro'yxat yuklanmadi»
holatida turardi. Bugungi holat — ekran bo'sh (sarlavha ostida «Yangiliklar shu yerda
to'planadi» yozuvi), chunki namuna (seed) ma'lumot ataylab olib tashlandi: soxta «Dilnoza
Rahimova sizga xabar yozdi» yozuvi haqiqiy ro'yxat bilan aralashib ketardi.

---

## 1. Ma'lumot modeli

```
Notification
  id           uuid/cuid, PK
  userId       kimga tegishli (FK → students), indeks
  type         enum: JOB | DISCOUNT | LISTING | CHAT | CONNECTION | SYSTEM
  title        qisqa sarlavha (≤ 120 belgi)
  body         matn (≤ 300 belgi)
  targetType   null | CHAT | LISTING | CONNECTION_REQUESTS | MY_LISTINGS | PROFILE
  targetId     null | tegishli obyekt id'si
  readAt       null | timestamp
  createdAt    timestamp, indeks (userId, createdAt DESC)
```

### 1.1 `type` — faqat ko'rinish uchun

`type` **ikonka va rangni** belgilaydi, boshqa hech nimani emas:

| `type` | Ekranda |
|---|---|
| `JOB` | ko'k, portfel ikonasi |
| `DISCOUNT` | to'q sariq, yorliq ikonasi |
| `LISTING` | yashil, hujjat ikonasi |
| `CHAT` | binafsha, xabar ikonasi |
| `CONNECTION` | sariq, odamlar ikonasi |
| `SYSTEM` | pushti, qo'ng'iroq ikonasi |

Ro'yxatga **yangi qiymat qo'shish xavfsiz**: klient noma'lum turni `SYSTEM` deb chizadi
va ro'yxat yiqilmaydi (`lenientEnums` bilan bir xil sabab — qarang
`dev/api-client-generator/build.gradle.kts` qadam 11). Shu sababdan `type` spec'da
**`enum` emas, `string`** bo'lib qolishi kerak.

### 1.2 `targetType` / `targetId` — bosilganda qayerga

Bildirishnoma bosilganda ilova mos ekranni ochadi. **Tayyor deeplink yubormang** —
`targetType` + `targetId` juftligini yuboring: mobil navigatsiya o'zgarsa backend
qo'zg'almaydi.

| `targetType` | `targetId` | Ochiladigan ekran |
|---|---|---|
| `CHAT` | `conversationId` | suhbat |
| `LISTING` | `listingId` | e'lon/chegirma tafsiloti |
| `CONNECTION_REQUESTS` | — | «Do'stlar» → so'rovlar bo'limi |
| `MY_LISTINGS` | — | «Mening e'lonlarim» |
| `PROFILE` | — | profil |
| `null` yoki noma'lum | — | hech qayerga: faqat o'qilgan bo'ladi |

⚠️ `CHAT` da `targetId` **suhbat id'si** (`conversationId`), talaba id'si emas.
`LISTING` da — e'lon id'si. Id kutilgan joyda `null` kelsa klient hech qayerga
o'tmaydi (bo'sh ekran ochilishidan ko'ra shu yaxshi).

### 1.3 Qachon yoziladi

Bildirishnoma **push yuborilgan har bir hodisada** yozilsin — ikkalasi bitta manbadan
chiqishi kerak, aks holda telefon ekranida ko'ringan xabar ro'yxatda topilmaydi:

| Hodisa | `type` | `targetType` |
|---|---|---|
| Yangi xabar (suhbat yopiq) | `CHAT` | `CHAT` + `conversationId` |
| Bog'lanish so'rovi keldi | `CONNECTION` | `CONNECTION_REQUESTS` |
| So'rov qabul qilindi | `CONNECTION` | `CHAT` + `conversationId` |
| E'lon moderatsiyadan o'tdi / rad etildi | `LISTING` | `MY_LISTINGS` |
| E'lon muddati tugayapti | `LISTING` | `MY_LISTINGS` |
| Yangi mos ish e'loni | `JOB` | `LISTING` + `listingId` |
| Chegirma tugayapti | `DISCOUNT` | `LISTING` + `listingId` |
| Tizim xabari (xush kelibsiz, yangilanish) | `SYSTEM` | `null` |

**Saqlash muddati:** 90 kun, keyin o'chirilsin. Ro'yxat — qisqa umrli, arxiv emas.

---

## 2. `GET /v1/notifications` — ro'yxat

**Auth:** `bearer` (majburiy).

**Query:**

| Nom | Tur | Odatiy | Izoh |
|---|---|---|---|
| `limit` | integer | 30 | maksimal 100 |

Sahifalash **shart emas** va klient uni so'ramaydi: bildirishnoma qisqa umrli ro'yxat,
foydalanuvchi uni oxirigacha aylantirmaydi.

**Javob** (odatdagi `BaseResponse` konvertida, `result` ichida):

```json
{
  "items": [
    {
      "id": "ntf_01HX...",
      "type": "CHAT",
      "title": "Yangi xabar",
      "body": "Dilnoza sizga xabar yozdi.",
      "target": { "type": "CHAT", "id": "cnv_01HX..." },
      "readAt": null,
      "createdAt": "2026-08-04T09:12:33.000Z"
    },
    {
      "id": "ntf_01HW...",
      "type": "LISTING",
      "title": "E'loningiz tasdiqlandi",
      "body": "\"Chilonzorda room-mate\" e'loni endi hammaga ko'rinadi.",
      "target": { "type": "MY_LISTINGS", "id": null },
      "readAt": "2026-08-04T08:00:00.000Z",
      "createdAt": "2026-08-03T18:40:00.000Z"
    }
  ],
  "unreadCount": 1
}
```

**Talablar:**

1. **Tartib — `createdAt DESC`** (yangisi tepada). Bir xil soniyada tug'ilgan ikkitasi
   uchun ikkinchi mezon `id DESC` bo'lsin, aks holda ro'yxat so'rovdan so'rovga
   sakraydi.
2. **`unreadCount` — BUTUN hisob bo'yicha**, `items` ichidagilar soni emas. Ekrandagi
   «N ta o'qilmagan» va bosh ekrandagi qo'ng'iroq nuqtasi shundan.
3. **`createdAt` — ISO-8601, UTC.** Klient «2 soat oldin» yorlig'ini o'zi hisoblaydi,
   shuning uchun **tayyor matn yubormang**: u yozilgan paytda muzlab qoladi va ertasiga
   ham «2 soat oldin» deb turadi.
4. **`readAt`** — `null` yoki vaqt. `read: true/false` shakli ham qabul qilinadi
   (klient ikkalasini ham tushunadi), lekin `readAt` afzal: qachon o'qilgani ham
   ma'lum bo'ladi.
5. **`body` ixtiyoriy** — bo'sh bo'lsa karta faqat sarlavha bilan chiziladi.

---

## 3. `POST /v1/notifications/read` — o'qildi deb belgilash

**Auth:** `bearer`.

Bitta endpoint ikkala holat uchun — bitta/bir nechta va «hammasi»:

```json
{ "ids": ["ntf_01HX...", "ntf_01HW..."] }
```

```json
{ "all": true }
```

**Talablar:**

1. `ids` va `all` **birga kelmaydi**. Ikkalasi ham bo'lmasa — `422`.
2. **Idempotent**: allaqachon o'qilgan bildirishnoma qayta belgilansa `200`, `readAt`
   o'zgarmaydi.
3. **Begona id jimgina tashlanadi** (`404` emas): klient bir nechta id'ni bitta so'rovda
   yuboradi va bittasi eskirgan bo'lsa qolganlari belgilanishi kerak.
4. Javob tanasi kerak emas (`result: null`).
5. **Chegara:** `ids` da ko'pi bilan 200 element.

### 3.1 Nega server so'rovi klientni kutmaydi

Klient «o'qildi» ni **avval localda** yozadi va so'ngra serverga yuboradi — ekran darrov
javob beradi. So'rov yiqilsa qaytarib olinmaydi: keyingi `GET /v1/notifications`
serverning haqiqiy holatini yozadi va belgi o'zi tiklanadi. Ya'ni **`GET` javobi doim
haqiqat manbai** — `readAt` ni to'g'ri qaytaring.

---

## 4. Ixtiyoriy: `unreadCount` ni real vaqtda yangilash

Bugungi klient hisobni ikkita joyda so'raydi: bosh ekran ochilganda va bildirishnomalar
ekrani ochilganda. Bu yetarli.

Agar WebSocket'ga (`03-WEBSOCKET.md`) qo'shimcha hodisa qo'shilsa, qo'ng'iroq nuqtasi
so'rovsiz yonardi:

```
notification:new  →  { unreadCount: 3 }
```

**Bu MAJBURIY EMAS.** §2–§3 siz ham ekran to'liq ishlaydi.

---

## 5. Qabul mezonlari

- [ ] `GET /v1/notifications` — ro'yxat + `unreadCount`, `createdAt DESC`
- [ ] `POST /v1/notifications/read` — `{ids}` va `{all: true}`, idempotent
- [ ] Push yuborilgan **har** hodisa uchun `Notification` qatori yoziladi (§1.3)
- [ ] `type` spec'da `string` (enum emas) — §1.1
- [ ] `target` — `{type, id}`, tayyor deeplink emas — §1.2
- [ ] `createdAt` — ISO-8601 UTC, tayyor matn emas — §2.3
- [ ] `student-club.json` yangilandi va ilovaga berildi

Spec kelgach ilovada qilinadigan yagona ish:
`NOTIFICATIONS_REMOTE_ENABLED = true`.
