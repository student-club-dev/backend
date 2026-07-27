# Connections — mobil handoff

> Swagger tag: **`Connections`** · Ilova: **Student (StudentClub)**
> Holat: **✅ o'nta endpoint ham ishlaydi**, unit + e2e testlar bilan qoplangan.

LinkedIn uslubidagi **bog'lanish** qatlami: talabani topish → so'rov yuborish → qabul/rad →
bog'langanlar ro'yxati, ustiga **blok** va **shikoyat**.

> **Bu — chat'ning eshigi.** Ikki talaba **bog'lanmagan** bo'lsa, `Chat` sectionidagi
> endpointlar **`403 NOT_CONNECTED`** qaytaradi. Chat'ni ochishdan oldin shu section
> ishlashi kerak.

| # | Endpoint | Nima uchun |
|---|---|---|
| 1 | `GET /v1/students/search` | Talaba qidirish |
| 2 | `POST /v1/connections/requests` | So'rov yuborish |
| 3 | `GET /v1/connections/requests` | Kutilayotgan so'rovlar (kiruvchi/chiquvchi) |
| 4 | `POST /v1/connections/requests/{id}/accept` | Qabul qilish |
| 5 | `POST /v1/connections/requests/{id}/decline` | Rad etish |
| 6 | `GET /v1/connections` | Bog'langanlar ro'yxati |
| 7 | `DELETE /v1/connections/{studentId}` | Bog'lanishni uzish |
| 8 | `POST /v1/blocks` | Bloklash |
| 9 | `DELETE /v1/blocks/{studentId}` | Blokni yechish |
| 10 | `POST /v1/reports` | Shikoyat (talaba yoki xabar ustidan) |

**Hammasi 🔴 student tokeni bilan.** Tokensiz → `401`, biznes egasi tokeni bilan → `403`.

---

## 1. Umumiy qoidalar

| Qoida | Qiymat |
|---|---|
| Base URL | `{HOST}/v1` |
| Header | `Authorization: Bearer <accessToken>` — **majburiy**, hamma endpointda |
| Sana | ISO-8601 |
| Envelope | Boshqa sectionlardagidek: `{ success, status, code, message, result, error }` |

### ⚠️ Bu section boshqacha ishlaydi — diqqat

Feed (`discounts`) POST-only va id'lar tanada edi. **Bu yerda odatiy REST:**

| | `discounts` | `connections` |
|---|---|---|
| Method | faqat `POST` | `GET` · `POST` · `DELETE` |
| Id qayerda | tanada | **yo'lda** (`/requests/{id}/accept`) |
| Sahifa raqami | **`0` dan** boshlanadi | **`1` dan** boshlanadi |
| Sahifa parametri | tanada (`page.number`, `page.size`) | **query** (`?page=1&size=20`) |

**Sahifalash 1-asosli** — bu eng ko'p yanglishtiradigan joy. Birinchi sahifa `page=1`.

### Sahifalash

Har bir ro'yxat bir xil konvertni qaytaradi:

```jsonc
{ "items": [ ... ], "page": 1, "size": 20, "total": 137, "hasNext": true }
```

| Query | Tur | Default | Chegara |
|---|---|---|---|
| `page` | int | **`1`** | ≥ 1 |
| `size` | int | **`20`** | `1 … 100` |

`hasNext` = `page * size < total`.

### `StudentSummary` — odam ko'rsatiladigan hamma joyda bir xil

```jsonc
{
  "id": "std_01H8X",
  "username": "alisher",
  "fullName": "Alisher Valiyev",
  "avatarUrl": "https://.../a.jpg",
  "online": false,
  "lastSeenAt": null
}
```

| Maydon | Tur | Null | Izoh |
|---|---|---|---|
| `id` | string | ❌ | |
| `username` | string | ✅ | `Profiles` sectionida o'rnatiladi. O'rnatmagan talabada `null` |
| `fullName` | string | ✅ | `firstName + " " + lastName`. Ikkalasi ham bo'sh bo'lsa `null` |
| `avatarUrl` | string | ✅ | |
| `online` | bool | ❌ | **v1 da doim `false`** — hali ulanmagan |
| `lastSeenAt` | ISO-8601 | ✅ | **v1 da doim `null`** |

> `online` / `lastSeenAt` — maydonlar bor, lekin **hali to'ldirilmaydi**. UI'da «onlayn»
> indikatorini shularga bog'lamang.

---

## 2. `GET /v1/students/search` — talaba qidirish

```
GET /v1/students/search?q=ali&page=1&size=20
```

| Query | Majburiy | Default |
|---|---|---|
| `q` | ✅ | — |
| `page` | ❌ | `1` |
| `size` | ❌ | `20` |

### Javob

```jsonc
{
  "result": {
    "items": [
      {
        "id": "std_01H8X", "username": "alisher", "fullName": "Alisher Valiyev",
        "avatarUrl": null, "online": false, "lastSeenAt": null,
        "connectionStatus": "PENDING_OUT"
      }
    ],
    "page": 1, "size": 20, "total": 3, "hasNext": false
  }
}
```

`StudentSummary` + bitta qo'shimcha maydon:

| `connectionStatus` | Ma'nosi | Klient tugmasi |
|---|---|---|
| `NONE` | Bog'lanish yo'q (yoki avval rad etilgan) | **«Bog'lanish»** |
| `PENDING_OUT` | **Siz** so'rov yubordingiz, javob kutilyapti | «Yuborildi» (o'chirilgan) |
| `PENDING_IN` | **U** sizga so'rov yubordi | **«Javob berish»** |
| `CONNECTED` | Bog'langansiz | **«Xabar yozish»** |

### Qidiruv qanday ishlaydi

| Maydon | Moslik |
|---|---|
| `username` | **boshidan** (`startsWith`), registrga befarq |
| `firstName` | **ichida** (`contains`), registrga befarq |
| `lastName` | **ichida** (`contains`), registrga befarq |

Tartib: `username` → `firstName` (alifbo).

> ⚠️ **To'liq ism bo'yicha qidirish ishlamaydi.** `"Alisher Valiyev"` deb yozilsa hech nima
> topilmaydi — moslik `firstName` va `lastName` da **alohida-alohida** tekshiriladi.
> Klientda foydalanuvchini bitta so'z yozishga yo'naltiring.

### Kim chiqmaydi

- **O'zingiz**
- **Bloklaganlaringiz** va **sizni bloklaganlar** (ikki tomonlama)

---

## 3. `POST /v1/connections/requests` — so'rov yuborish

**Rate limit: daqiqasiga 20 ta.**

### So'rov

```jsonc
{ "addresseeId": "std_01H8X" }
```

### Javob — **`201 Created`**

```jsonc
{
  "result": {
    "id": "con_01H8X",
    "requesterId": "std_MEN",
    "addresseeId": "std_01H8X",
    "status": "PENDING",
    "createdAt": "2026-07-27T10:00:00.000Z",
    "respondedAt": null
  }
}
```

### 🔑 Avtomatik qabul (C1)

**Agar u odam sizga allaqachon so'rov yuborgan bo'lsa** (`PENDING_IN`), sizning so'rovingiz
o'sha so'rovni **darhol qabul qiladi**:

```jsonc
{ "result": { "status": "ACCEPTED", "respondedAt": "2026-07-27T10:00:00.000Z", ... } }
```

Ya'ni javobdagi **`status` ni tekshiring** — `PENDING` bo'lsa «Yuborildi», `ACCEPTED` bo'lsa
darhol «Bog'landingiz» deb ko'rsating.

### Xatolar

| HTTP | Kod | Qachon |
|---|---|---|
| `422` | `CANNOT_CONNECT_SELF` | `addresseeId` — o'zingiz |
| `404` | `STUDENT_NOT_FOUND` | Bunday talaba yo'q |
| `403` | `USER_BLOCKED` | Biror tomon ikkinchisini bloklagan |
| `409` | `ALREADY_CONNECTED` | Allaqachon bog'langansiz |
| `409` | `CONNECTION_REQUEST_EXISTS` | So'rovni allaqachon yuborgansiz (`PENDING_OUT`) |
| `429` | `RATE_LIMITED` | **C10 sovish muddati** (pastda) yoki daqiqalik limit |

### C10 — rad etilgandan keyin **24 soat** sovish muddati

So'rovingiz rad etilgan bo'lsa, o'sha odamga **24 soat davomida** qayta yubora olmaysiz:

```jsonc
{
  "success": false, "status": 429, "result": null,
  "message": "Rad etilgan so'rovni birozdan so'ng qayta yuborishingiz mumkin",
  "error": { "code": "RATE_LIMITED", "message": "Rad etilgan so'rovni birozdan so'ng qayta yuborishingiz mumkin", "fields": {} }
}
```

24 soat o'tgach so'rov normal yuboriladi.

> **Server qancha vaqt qolganini aytmaydi.** Klientda «keyinroq urinib ko'ring» deb
> ko'rsating, taymer chizmang.

---

## 4. `GET /v1/connections/requests` — kutilayotgan so'rovlar

```
GET /v1/connections/requests?direction=incoming&page=1&size=20
```

| Query | Majburiy | Qiymat |
|---|---|---|
| `direction` | ✅ | **`incoming`** (menga kelganlar) yoki **`outgoing`** (men yuborganlarim) |
| `page` / `size` | ❌ | `1` / `20` |

> `direction` — **majburiy**, kichik harflar bilan. Yuborilmasa yoki boshqa qiymat bo'lsa `422`.

### Javob

```jsonc
{
  "result": {
    "items": [
      {
        "connectionId": "con_01H8X",
        "student": { "id": "std_01H8X", "username": "alisher", "fullName": "Alisher Valiyev",
                     "avatarUrl": null, "online": false, "lastSeenAt": null },
        "createdAt": "2026-07-27T10:00:00.000Z"
      }
    ],
    "page": 1, "size": 20, "total": 1, "hasNext": false
  }
}
```

| Maydon | Izoh |
|---|---|
| `connectionId` | **`accept` / `decline` ga shu id ketadi** — talabaning id'si emas! |
| `student` | `direction=incoming` da — **yuboruvchi**; `outgoing` da — **qabul qiluvchi** |
| `createdAt` | So'rov yuborilgan vaqt |

> Faqat **`PENDING`** so'rovlar. Qabul qilingani `GET /v1/connections` ga, rad etilgani hech
> qayerga o'tmaydi.

---

## 5. `POST /v1/connections/requests/{id}/accept`

`{id}` — yuqoridagi **`connectionId`**. Tana yo'q.

### Javob — `200`

```jsonc
{
  "result": {
    "id": "con_01H8X", "requesterId": "std_ALI", "addresseeId": "std_MEN",
    "status": "ACCEPTED",
    "createdAt": "2026-07-27T10:00:00.000Z",
    "respondedAt": "2026-07-27T10:05:00.000Z"
  }
}
```

Shundan keyin `Chat` ochiladi.

### Xato

| HTTP | Kod | Qachon |
|---|---|---|
| `404` | `CONNECTION_REQUEST_NOT_FOUND` | Bunday so'rov yo'q · **yoki** sizga qaratilmagan · **yoki** allaqachon javob berilgan |

> Uchala holat **bir xil `404`** beradi — qaysi biri ekanini oshkor qilmaydi.
> **Chiquvchi so'rovni o'zingiz qabul qila olmaysiz.**

---

## 6. `POST /v1/connections/requests/{id}/decline`

Tana yo'q. Javob — `200`, **`result: null`**:

```jsonc
{ "success": true, "status": 200, "message": "OK", "result": null, "error": null }
```

Xato — `accept` bilan bir xil: `404 CONNECTION_REQUEST_NOT_FOUND`.

> Rad etilgandan keyin yuboruvchi uchun **24 soatlik sovish muddati** boshlanadi (§3).
> Rad etilgan so'rov `GET /connections/requests` ro'yxatiga **qaytmaydi**, va qidiruvda
> `connectionStatus: "NONE"` bo'lib ko'rinadi — ya'ni yuboruvchi rad etilganini bilmaydi.

---

## 7. `GET /v1/connections` — bog'langanlar

```
GET /v1/connections?page=1&size=20
```

### Javob

```jsonc
{
  "result": {
    "items": [
      {
        "student": { "id": "std_ALI", "username": "alisher", "fullName": "Alisher Valiyev",
                     "avatarUrl": null, "online": false, "lastSeenAt": null },
        "connectedAt": "2026-07-27T10:05:00.000Z"
      }
    ],
    "page": 1, "size": 20, "total": 12, "hasNext": false
  }
}
```

| Maydon | Izoh |
|---|---|
| `student` | **Ikkinchi tomon** — kim so'rov yuborganidan qat'i nazar |
| `connectedAt` | Qabul qilingan vaqt (`respondedAt`) |

> Bu yerda **`connectionId` yo'q** — bog'lanishni uzish uchun **`student.id`** ishlatiladi
> (§8). `accept`/`decline` esa `connectionId` ni oladi. **Ikkovini adashtirmang.**

---

## 8. `DELETE /v1/connections/{studentId}` — bog'lanishni uzish

`{studentId}` — **ikkinchi talabaning id'si** (bog'lanish id'si emas).

Javob — `200`, `result: null`.

| HTTP | Kod | Qachon |
|---|---|---|
| `404` | `CONNECTION_NOT_FOUND` | Bu talaba bilan bog'lanmagansiz |

> **Har ikkala tomon** ham uza oladi. Uzilgandan keyin bog'lanish **butunlay o'chiriladi** —
> ya'ni qayta so'rov yuborish mumkin, sovish muddati **yo'q** (u faqat *rad etish* dan keyin).

---

## 9. `POST /v1/blocks` — bloklash

### So'rov

```jsonc
{ "studentId": "std_01H8X" }
```

Javob — `200`, `result: null`.

### Nima bo'ladi

1. Blok yoziladi (**idempotent** — takror bloklash xato bermaydi).
2. **Ikki o'rtadagi bog'lanish / so'rov butunlay o'chiriladi.**
3. Bundan keyin **ikkala tomon** ham bir-biriga so'rov yubora olmaydi → `403 USER_BLOCKED`.
4. Ikkalasi ham bir-birining qidiruv natijasidan yo'qoladi.

| HTTP | Kod | Qachon |
|---|---|---|
| `422` | `CANNOT_CONNECT_SELF` | O'zingizni bloklashga urinish |
| `404` | `STUDENT_NOT_FOUND` | Bunday talaba yo'q |

## `DELETE /v1/blocks/{studentId}` — blokni yechish

Javob — `200`, `result: null`. **Idempotent** — bloklanmagan odamni «yechish» ham `200`.

> ⚠️ **Blok yechilganda avvalgi bog'lanish tiklanmaydi.** Qaytadan so'rov yuborish kerak.

> ⚠️ **Bloklanganlar ro'yxatini olish endpointi yo'q.** Klient bloklaganlarini o'zi
> eslab qolishi kerak (yoki bu keyingi bosqichda qo'shiladi).

---

## 10. `POST /v1/reports` — shikoyat

**Rate limit: daqiqasiga 10 ta.**

### So'rov

**`targetStudentId` yoki `messageId` — aynan bittasi.**

```jsonc
// talaba ustidan
{ "targetStudentId": "std_01H8X", "reason": "HARASSMENT", "note": "Haqorat qilyapti" }

// xabar ustidan
{ "messageId": "msg_01H8X", "reason": "SPAM" }
```

| Maydon | Tur | Majburiy | Izoh |
|---|---|---|---|
| `targetStudentId` | string | 🟡 | `messageId` bilan **birga bo'lmaydi** |
| `messageId` | string | 🟡 | `targetStudentId` bilan **birga bo'lmaydi** |
| `reason` | enum | ✅ | `SPAM` · `SCAM` · `HARASSMENT` · `INAPPROPRIATE` · `OTHER` |
| `note` | string | ❌ | ≤ **1000** belgi |

### Javob — **`201 Created`**

```jsonc
{
  "result": {
    "id": "rep_01H8X",
    "reason": "HARASSMENT",
    "status": "OPEN",
    "createdAt": "2026-07-27T10:00:00.000Z"
  }
}
```

`status`: `OPEN` · `REVIEWED` · `ACTIONED` · `DISMISSED` — yangi shikoyat doim **`OPEN`**.

### Takroriy shikoyat birlashtiriladi

Bir xil odam bir xil nishonga qayta shikoyat qilsa va avvalgisi hali `OPEN` bo'lsa —
**yangi yozuv yaratilmaydi**, o'sha eski shikoyat qaytariladi (`id` va `createdAt` eskisi).
Javob baribir `201`.

> Klientda «Shikoyatingiz qabul qilindi» deb ko'rsatavering — foydalanuvchi uchun farqi yo'q.

### Xatolar

| HTTP | Kod | Qachon |
|---|---|---|
| `422` | `REPORT_TARGET_INVALID` | Ikkalasi ham berilgan **yoki** ikkalasi ham yo'q · yoki o'zini shikoyat qilish |
| `404` | `STUDENT_NOT_FOUND` | `targetStudentId` topilmadi |
| `422` | `VALIDATION_ERROR` | Noto'g'ri `reason`, `note` 1000 belgidan uzun |

> ⚠️ **`messageId` mavjudligi tekshirilmaydi** — yo'q xabar id'si ham qabul qilinadi.
> Klient faqat haqiqiy xabar id'sini yuborsin.

> Shikoyat **moderatsiyaga** ketadi. Foydalanuvchiga natija qaytarilmaydi va ro'yxatini
> ko'rish endpointi yo'q.

---

## 11. Holatlar diagrammasi

```
                      NONE
                        │
          so'rov yuborildi │
                        ▼
    PENDING_OUT ◄────────────────► PENDING_IN
     (yuboruvchi)                    (qabul qiluvchi)
        │                                 │
        │                    accept ──────┤────── decline
        │                          │             │
        ▼                          ▼             ▼
    (kutish)                  CONNECTED       NONE + 24s sovish
                                   │
                DELETE /connections/{id}  yoki  POST /blocks
                                   │
                                   ▼
                                 NONE
                          (blokda — qayta so'rov ham yo'q)
```

**Qisqacha qoidalar**

| Amal | Natija |
|---|---|
| U sizga so'rov yuborgan, siz ham yuborsangiz | **Avtomatik bog'lanish** |
| Rad etish | 24 soat qayta so'rov yo'q |
| Bog'lanishni uzish | Darhol qayta so'rov yuborish mumkin (sovish yo'q) |
| Bloklash | Bog'lanish o'chadi + ikki tomonlama to'siq |
| Blokni yechish | Bog'lanish **tiklanmaydi** |

---

## 12. Xatolar — to'liq jadval

| HTTP | Kod | Qayerda |
|---|---|---|
| `401` | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Hamma endpoint — tokensiz yoki muddati o'tgan |
| `403` | `FORBIDDEN` | Biznes egasi tokeni bilan |
| `403` | `USER_BLOCKED` | `POST /connections/requests` |
| `404` | `STUDENT_NOT_FOUND` | `requests` · `blocks` · `reports` |
| `404` | `CONNECTION_REQUEST_NOT_FOUND` | `accept` · `decline` |
| `404` | `CONNECTION_NOT_FOUND` | `DELETE /connections/{studentId}` |
| `409` | `ALREADY_CONNECTED` | `POST /connections/requests` |
| `409` | `CONNECTION_REQUEST_EXISTS` | `POST /connections/requests` |
| `422` | `CANNOT_CONNECT_SELF` | `requests` · `blocks` |
| `422` | `REPORT_TARGET_INVALID` | `reports` |
| `422` | `VALIDATION_ERROR` | DTO buzilgan, noma'lum maydon |
| `429` | `RATE_LIMITED` | C10 sovish muddati · `requests` 20/daq · `reports` 10/daq |
| `500` | `INTERNAL_ERROR` | Kutilmagan xato |

> `VALIDATION_ERROR` da `error.fields` qiymatlari **inglizcha** — foydalanuvchiga
> ko'rsatmang, faqat `message` ni ko'rsating.

---

## 13. Enumlar

```
ConnectionStatus  PENDING | ACCEPTED | DECLINED       ← server tomondagi holat
ConnectionView    NONE | PENDING_OUT | PENDING_IN | CONNECTED   ← qidiruvdagi ko'rinish
ReportReason      SPAM | SCAM | HARASSMENT | INAPPROPRIATE | OTHER
ReportStatus      OPEN | REVIEWED | ACTIONED | DISMISSED
direction         incoming | outgoing                 ← kichik harflar!
```

> `ConnectionStatus` va `ConnectionView` — **ikki xil enum**. Birinchisi bog'lanish yozuvining
> holati (`send`/`accept` javobida), ikkinchisi qidiruvdagi «men bilan munosabati».

---

## 14. Ekran oqimi

```
"Do'stlar" ekrani
   ├─ Qidiruv qutisi
   │    GET /students/search?q=...&page=1
   │    → connectionStatus ga qarab tugma chiziladi
   │       NONE        → "Bog'lanish"  → POST /connections/requests
   │       PENDING_OUT → "Yuborildi"   (o'chirilgan)
   │       PENDING_IN  → "Javob berish"→ so'rovlar tabiga o'tkazish
   │       CONNECTED   → "Xabar yozish"→ Chat
   │
   ├─ "So'rovlar" tabi
   │    GET /connections/requests?direction=incoming   (badge uchun total)
   │    GET /connections/requests?direction=outgoing
   │    Qabul  → POST /connections/requests/{connectionId}/accept
   │    Rad    → POST /connections/requests/{connectionId}/decline
   │
   ├─ "Bog'langanlar" tabi
   │    GET /connections?page=1
   │    Uzish → DELETE /connections/{student.id}
   │
   └─ Profil / chat ichidagi "⋮" menyu
        Bloklash  → POST /blocks { studentId }
        Shikoyat  → POST /reports { targetStudentId | messageId, reason, note }
```

**Maslahatlar**

- **Kiruvchi so'rovlar badge'i** uchun `GET /connections/requests?direction=incoming&size=1`
  yuborib `total` ni oling — hamma qatorni yuklash shart emas.
- So'rov yuborgandan keyin javobdagi **`status`** ni tekshiring: `ACCEPTED` bo'lsa
  avtomatik bog'lanish sodir bo'lgan, foydalanuvchiga darhol «Xabar yozish» ni ko'rsating.
- `429` kelganda tugmani vaqtincha o'chiring va **taymer chizmang** — server qolgan vaqtni
  aytmaydi.
- Qidiruvni **debounce** qiling (~300 ms).
- Bloklagandan keyin ro'yxatlarni (`connections`, `requests`) **qayta yuklang** — bog'lanish
  server tomonda o'chib ketgan bo'ladi.
- `connectionId` (so'rov) va `student.id` (bog'lanish) — **turli id'lar**. Qaysi endpoint
  qaysinisini olishini yuqoridagi jadvallardan tekshiring.

---

## 15. Nima qurilmagan

| Nima | Izoh |
|---|---|
| `online` / `lastSeenAt` | Maydonlar bor, lekin doim `false` / `null` |
| Bloklanganlar ro'yxati | `GET /blocks` yo'q |
| Shikoyatlar ro'yxati | Foydalanuvchi o'z shikoyatlarini ko'ra olmaydi |
| `messageId` tekshiruvi | Shikoyatda xabar mavjudligi tasdiqlanmaydi |
| Bog'lanish bo'yicha push | `Notifications` sectionida ko'rilishi kerak |
| To'liq ism bo'yicha qidiruv | `firstName`/`lastName` alohida qidiriladi (§2) |

---

## 16. Manba fayllar

**Mobil dev'ga beriladigan:**

| Fayl | Nima uchun |
|---|---|
| **shu fayl** | Section'ning to'liq tavsifi |
| `GET /docs/student/json` | OpenAPI JSON — codegen uchun |
| `docs/architecture/chat.md` | Kelishilgan spetsifikatsiya — C1 (bog'lanish), C10 (sovish), C11 (qidiruv), C12 (shikoyat) |

**Backend tomondagi kod (ma'lumot uchun):**

| Qatlam | Fayl |
|---|---|
| Controller | `src/modules/connections/presentation/` — `connections`, `student-search`, `blocks`, `reports` |
| DTO | `src/modules/connections/presentation/dto/` — `queries.dto.ts`, `requests.dto.ts`, `student-summary.dto.ts`, `connection.dto.ts`, `search-result.dto.ts` |
| Service | `src/modules/connections/application/connections.service.ts` (C1 + C10) · `reports.service.ts` (C12) |
| Enum | `src/modules/connections/domain/enums/` |
| Repository | `src/modules/connections/infrastructure/` — `connection.prisma.repository.ts`, `student-directory.prisma.repository.ts` |
| Unit testlar | `connections.service.spec.ts` · `reports.service.spec.ts` |
| E2E testlar | `test/chat.e2e-spec.ts` (bog'lanish oqimi, blok, shikoyat) · `test/chat-ws.e2e-spec.ts` |
