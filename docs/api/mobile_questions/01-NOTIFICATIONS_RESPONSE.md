# Bildirishnomalar ro'yxati — backend javobi

`01-NOTIFICATIONS_BACKEND.md` **bajarildi** — §5 dagi qabul mezonlaridan **6 tasi**.
Yettinchisi (`student-club.json` yangilandi) sizning tomoningizda: spec fayli tayyor, quyida yo'li.

> **Spec:** `docs/api/generated/student.json` (= `docs/handoff/mobile/student-api.json`) yangilandi.
> Kotlin klientini shu fayldan qayta generatsiya qiling.

**Ilovada qilinadigan yagona ish — o'sha bitta qator:**

```kotlin
const val NOTIFICATIONS_REMOTE_ENABLED = true
```

---

## 0. Bir qarashda

| | Avval | Endi |
|---|---|---|
| `GET /v1/notifications` | ❌ yo'q (`404`) | ✅ ro'yxat + `unreadCount` |
| `POST /v1/notifications/read` | ❌ yo'q | ✅ `{ids}` va `{all:true}`, idempotent |
| O'qilmaganlar soni | ❌ yo'q | ✅ **butun tarix** bo'yicha |
| Saqlash muddati | — | ✅ 90 kun, har kuni 04:00 da tozalanadi |
| `POST /v1/devices` | ✅ bor edi | ✅ **o'zgarmadi** |

⚠️ **Muhim:** hozircha ro'yxatga hech kim **yozmaydi**. Yozish — `02-PUSH_CATALOG_BACKEND.md`
ishi (push va qator bitta manbadan chiqishi kerak, §1.3). Ya'ni bayroqni yoqsangiz ekran
**bo'sh** ko'rinadi, lekin `404` bermaydi va yiqilmaydi. Qatorlar 02 chiqqach paydo bo'ladi.

---

## 1. `GET /v1/notifications`

```
GET /v1/notifications?limit=30
Authorization: Bearer <access>
```

| Parametr | Turi | Sukut | Chegara |
|---|---|---|---|
| `limit` | int32 | `30` | 1..100 (101 → `422`) |

Sahifalash **yo'q** — so'raganingizdek. Javob konvert ichida:

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK",
  "result": {
    "items": [
      {
        "id": "clx7f2...",
        "type": "CHAT",
        "title": "Yangi xabar",
        "body": "Dilnoza sizga xabar yozdi.",
        "target": { "type": "CHAT", "id": "clx9a1..." },
        "readAt": null,
        "createdAt": "2026-08-04T09:12:33.000Z"
      }
    ],
    "unreadCount": 1
  },
  "error": null
}
```

### So'ralgan 5 ta talab — hammasi bajarildi

| # | Talab | Holat |
|---|---|---|
| 1 | Tartib `createdAt DESC`, ikkinchi mezon `id DESC` | ✅ index'ning o'zi shu tartibda: `(student_id, created_at DESC, id DESC)` |
| 2 | `unreadCount` — **butun** hisob, `items` soni emas | ✅ alohida `COUNT`, `limit` ga bog'liq emas |
| 3 | `createdAt` — ISO-8601 UTC, tayyor matn emas | ✅ `2026-08-04T09:12:33.000Z` |
| 4 | `readAt` — `null` yoki vaqt | ✅ `readAt` tanlandi (`read: bool` emas) |
| 5 | `body` ixtiyoriy | ✅ `nullable`, bo'sh bo'lsa `null` |

**Talab 1 haqida bir og'iz:** `id DESK` tiebreak'i shunchaki qo'shimcha emas — `id` cuid,
ya'ni vaqt prefiksli va leksikografik o'suvchi. Shuning uchun bir millisekundda tug'ilgan
ikkita qator ham har safar bir xil tartibda keladi. e2e testda aynan shu tekshiriladi
(bir xil `createdAt` bilan 3 ta qator, ikki marta so'raladi, tartib bir xil chiqadi).

### `type` va `target.type` — **`string`, `enum` emas** ✅

So'raganingizdek (§1.1). Generatsiya qilingan spec'da aynan shunday:

```jsonc
"type": {
  "type": "string",
  "example": "CHAT",
  "description": "One of `JOB | DISCOUNT | LISTING | CHAT | CONNECTION | SYSTEM` — a string, not an enum"
}
```

Bazada esa **PostgreSQL enum** — ya'ni bizning tomonda noto'g'ri qiymat yozilishi mumkin emas,
simda esa sizda `parseEnum(raw, default)` ishlayveradi. Katalogga yangi tur qo'shsak
`student-club.json` o'zgarmaydi va eski ilova yiqilmaydi.

### `target` — `nullable`, va **kodgeneratorga xavfsiz shaklda**

Siz `04-CALLS_BACKEND.md` §14 da ogohlantirgan tuzoq — `"$ref": …, "nullable": true` OpenAPI 3.0
da ishlamaydi. Shuni hisobga oldik:

```jsonc
"target": {
  "allOf": [ { "$ref": "#/components/schemas/NotificationTargetDto" } ],
  "nullable": true
}
```

Ya'ni `NotificationDto.target` sizda **`NotificationTargetDto?`** bo'lib chiqadi, `kotlin.Any?` emas.

| `target` | Ma'nosi |
|---|---|
| `{ "type": "CHAT", "id": "clx…" }` | suhbatni oching |
| `{ "type": "MY_LISTINGS", "id": null }` | ekranni oching, id kerak emas |
| `null` | hech qayerga — faqat o'qilgan bo'ladi |

`CHAT` da `id` — **`conversationId`**, `LISTING` da — e'lon id'si. Kelishuv o'zgarmadi.

---

## 2. `POST /v1/notifications/read`

```jsonc
{ "ids": ["clx7f2…", "clx7f1…"] }   // yoki
{ "all": true }
```

`200`, `result: null`.

### So'ralgan 5 ta talab

| # | Talab | Holat |
|---|---|---|
| 1 | `ids` va `all` birga kelmaydi; ikkalasi ham bo'lmasa `422` | ✅ |
| 2 | Idempotent — qayta belgilansa `readAt` o'zgarmaydi | ✅ `WHERE read_at IS NULL` |
| 3 | Begona id jimgina tashlanadi (`404` emas) | ✅ |
| 4 | Javob tanasi kerak emas | ✅ `result: null` |
| 5 | `ids` da ko'pi bilan 200 ta | ✅ 201 → `422` |

**Talab 3 haqida:** begona id nafaqat "tashlanadi" — u **boshqa talabaning** id'si bo'lsa ham
xuddi shunday jimgina o'tadi. Ya'ni javobdan "bu id bor ekan-u, meniki emas" degan xulosa
chiqarib bo'lmaydi. Bu ham sizning talabingiz, ham enumeratsiyaga qarshi himoya — bir o'q,
ikki quyon.

`422` javobi odatdagi konvertda, `error.fields` bilan:

```jsonc
{ "success": false, "status": 422, "message": "…",
  "error": { "code": "VALIDATION_ERROR",
             "message": "…",
             "fields": { "all": "Yo' `ids`, yo' `all: true` yuboring — ikkalasi birga ham, ikkalasisiz ham bo'lmaydi" } } }
```

> ⚠️ `{ "all": false }` ham `422` beradi — u hech narsani tanlamaydi va deyarli har doim
> klient xatosi. `all` yubormasangiz — umuman yubormang.

---

## 3. §4 — real vaqtda `unreadCount`

**Qilinmadi**, chunki siz uni "MAJBURIY EMAS" deb belgilagansiz va §2–§3 siz ham ekran to'liq
ishlaydi. `notification:new` WebSocket hodisasi kerak bo'lsa ayting — `/chat` namespace'ida
qo'shish bir necha qatorlik ish.

---

## 4. Saqlash muddati

90 kun, `NOTIFICATION_RETENTION_DAYS` env bilan sozlanadi. Har kuni **04:00** da sweep ishlaydi
(03:00 dagi story sweep bilan to'qnashmasin uchun).

⚠️ O'qishda **yosh bo'yicha filtr yo'q** — 89 kunlik bildirishnoma ham to'liq haqiqiy
bildirishnoma. Ya'ni cron to'xtab qolsa ro'yxat va'da qilinganidan ko'proq tarix ko'rsatadi,
lekin hech qachon noto'g'ri narsa ko'rsatmaydi.

---

## 5. Sizdan kutilayotgani

| # | Ish |
|---|---|
| 1 | `student-club.json` ni `docs/handoff/mobile/student-api.json` dan yangilash |
| 2 | `NOTIFICATIONS_REMOTE_ENABLED = true` |
| 3 | 02 chiqqach — push'da `notificationId` ni o'qib `POST /read` ga yuborish (§2.1) |

3-band 02 bilan birga keladi; hozir shoshilish shart emas.

---

## 6. Testlar

| Qatlam | Nima tekshiriladi |
|---|---|
| e2e (18 ta) | §5 mezonlarining **hammasi**, haqiqiy SQL ustida: tartib, tiebreak, `unreadCount` limit'dan katta, idempotentlik, begona id, **boshqa talabaning qatorini belgilay olmaslik** |
| Unit (14 ta) | tana validatsiyasi (`{}`, `{ids,all}`, `{all:false}`, 201 ta id) va servis mantiqi |

Alohida bitta test bor: `markRead(ids: undefined)` **hech qachon** "hammasini belgila" deb
talqin qilinmaydi. Bitta belgini yo'qotish tuzatsa bo'ladi, butun `unreadCount` ni yo'q qilish —
yo'q.
