# 11 — Connections (do'stlik/social graf: so'rovlar, bloklar, shikoyatlar, kashfiyot)

> Konvensiyalar (envelope, auth, guard'lar, scope belgilar, umumiy error, 1-based paginatsiya) — [`00-overview.md`](./00-overview.md)da. Bu fayl faqat shu modul mantiqini yozadi.

## 1. Maqsad

LinkedIn uslubidagi **student ↔ student** ijtimoiy grafi (chat'ning asosi, `docs/architecture/chat.md` C1/C7/C11/C12):

- **Connection requests** — bir student ikkinchisiga so'rov yuboradi; qabul qilinsa ular **connected** bo'ladi (chat shundan ochiladi).
- **Blocks** — studentni bloklash (juftlikdagi har qanday bog'lanishni **o'chiradi** va yangi so'rovlarni to'sadi).
- **Reports** — student yoki xabar ustidan **shikoyat** (moderatsiya navbatining manbasi — pastga qarang).
- **Student directory** — ulanish uchun studentlarni **qidirish/filtrlash** (`GET /v1/students`); har qatorda chaqiruvchining o'sha studentga bo'lgan **munosabati** (`connectionStatus`) ko'rsatiladi.

**Barcha endpointlar 👤 Student (`JwtAuthGuard` + `StudentGuard`) va 🔓 self-scoped.** Biznes token → **403**; har amal faqat **chaqiruvchining o'z** grafi ustidan (chaqiruvchi id = JWT `sub`). **Cross-user ko'rinish yo'q** — hech bir endpoint boshqa studentning so'rovlari/bog'lanishlari/bloklari/shikoyatlarini qaytarmaydi.

Presence maydonlari (`online`, `lastSeenAt`) har qatorda ko'rinadi, lekin **maskalanadi** — target studentning `lastSeenVisibility` (C7) ga qarab (pastga qarang).

---

## 2. Endpointlar

| METHOD + path | Scope | Maqsad |
|---|---|---|
| `POST /v1/connections/requests` | 👤 🔓 · ⏱️ 20/min | So'rov yuborish (teskari pending bo'lsa avto-qabul) |
| `GET /v1/connections/requests` | 👤 🔓 | Kutilayotgan so'rovlar (`direction=incoming\|outgoing`) |
| `POST /v1/connections/requests/:id/accept` | 👤 🔓 | Kelgan so'rovni qabul qilish (HTTP 200) |
| `POST /v1/connections/requests/:id/decline` | 👤 🔓 | Kelgan so'rovni rad etish (HTTP 200) |
| `GET /v1/connections` | 👤 🔓 | O'z bog'lanishlari (accepted) ro'yxati |
| `DELETE /v1/connections/:studentId` | 👤 🔓 | Bog'lanishni uzish (HTTP 200) |
| `POST /v1/blocks` | 👤 🔓 | Studentni bloklash (HTTP 200, idempotent) |
| `DELETE /v1/blocks/:studentId` | 👤 🔓 | Blokdan chiqarish (HTTP 200, idempotent) |
| `POST /v1/reports` | 👤 🔓 · ⏱️ 10/min | Student yoki xabar ustidan shikoyat |
| `GET /v1/students` | 👤 🔓 · ⏱️ 30/min | Student direktoriyasi (boy filtr) |
| `GET /v1/students/search` | 👤 🔓 · ⚠️ deprecated | Eski qidiruv aliasi (`q` ixtiyoriy) |

Scope: 👤 **Student** (faqat student token; biznes → 403) · 🔓 **Self-scoped** · ⏱️ = `ThrottlerGuard` (IP bo'yicha, `429 RATE_LIMITED`).

Uch controller: `connections` (`/v1/connections`, `/v1/blocks` uchun alohida `BlocksController`), `reports` (`/v1/reports`), `student-search` (`/v1/students`). Hammasi bir xil `Connections` Swagger tag'i ostida.

---

## 3. Har endpoint

### `POST /v1/connections/requests` — so'rov yuborish 👤 🔓 ⏱️

**Request** — `SendConnectionRequestDto`: `{ "addresseeId": string }` (bo'sh bo'lmagan string).

**Response:** `ConnectionDto` (HTTP **201**).

**Logika** (`ConnectionsService.sendRequest`, tartib bo'yicha):
1. `addresseeId === self` → **422 `CANNOT_CONNECT_SELF`** (`O'zingizga so'rov yubora olmaysiz`).
2. Bunday student yo'q → **404 `STUDENT_NOT_FOUND`**.
3. Juftlik **har ikki tomon** bo'yicha bloklangan bo'lsa (`isBlockedEitherWay`) → **403 `USER_BLOCKED`** (`Bu foydalanuvchi bilan bog'lanib bo'lmaydi`).
4. Mavjud edge (`findEdge`) tekshiriladi:
   - `ACCEPTED` → **409 `ALREADY_CONNECTED`** (`Siz allaqachon bog'langansiz`).
   - `PENDING`, chaqiruvchi **requester** → **409 `CONNECTION_REQUEST_EXISTS`** (`So'rov allaqachon yuborilgan`).
   - `PENDING`, **teskari** (target avval chaqiruvchiga yuborgan) → **avto-qabul**: edge `ACCEPTED`ga o'tadi, endi connected (**C1 reverse shortcut**). Response: `status: "ACCEPTED"`.
   - `DECLINED` edge bor + rad etilganiga **24 soat** o'tmagan → **429 `RATE_LIMITED`** (`Rad etilgan so'rovni birozdan so'ng qayta yuborishingiz mumkin`). C10 anti-spam cooldown (kod ichida, throttle'dan alohida).
   - `DECLINED` + cooldown o'tgan → eski edge o'chiriladi, yangi `PENDING` yaratiladi.
5. Edge bo'lmasa → yangi `PENDING` yaratiladi.

> **Ikki qatlamli rate-limit:** `@Throttle` 20 req/min/IP (429 `RATE_LIMITED`) **va** juftlik-darajali 24 soatlik decline-cooldown (u ham 429 `RATE_LIMITED`, boshqa message).

### `GET /v1/connections/requests` — kutilayotgan so'rovlar 👤 🔓

**Query** — `RequestsQueryDto`: `direction` (**majburiy**, `incoming` | `outgoing`), `page` (default 1), `size` (default 20, max 100).

**Response:** `RequestItemPageDto` — 1-based sahifalangan `{ items, page, size, total, hasNext }`. Har `item` (`RequestItemDto`): `{ connectionId, student: StudentSummaryDto, createdAt }`. `connectionId` — accept/decline uchun `:id`.

**Logika:** faqat `PENDING` edge'lar; `incoming` = chaqiruvchi **addressee**, `outgoing` = chaqiruvchi **requester**. Presence maskasi: pending hali connected emas → `isConnected=false`, ya'ni presence faqat target `lastSeenVisibility=EVERYONE` bo'lsa ko'rinadi.

### `POST /v1/connections/requests/:id/accept` · `/decline` — javob berish 👤 🔓

**Request:** body yo'q; `:id` — connection request id.

**Response:** `accept` → `ConnectionDto` (`status: ACCEPTED`), HTTP **200**. `decline` → `result: null`, HTTP **200**.

**Logika** (`loadIncomingPending`): edge topilmasa **yoki** `addresseeId !== self` **yoki** status `!== PENDING` → **404 `CONNECTION_REQUEST_NOT_FOUND`** (`So'rov topilmadi`). Faqat **kelgan** (incoming) pending so'rovga javob berish mumkin. `accept` → `ACCEPTED`, `decline` → `DECLINED` (`respondedAt` to'ldiriladi; DECLINED cooldown shu vaqtdan boshlanadi).

### `GET /v1/connections` — bog'lanishlar ro'yxati 👤 🔓

**Query** — `ConnectionsQueryDto`: `page` (default 1), `size` (default 20, max 100). Boshqa filtr yo'q.

**Response:** `ConnectionSummaryPageDto` — sahifalangan. Har `item` (`ConnectionSummaryDto`): `{ student: StudentSummaryDto, connectedAt }`. `connectedAt` = `respondedAt ?? createdAt`.

**Logika:** faqat `ACCEPTED` edge'lar (`listAccepted`), ikkala yo'nalish. Bu ro'yxatdagilar ta'rifan connected → presence maskasi `isConnected=true` (ya'ni `EVERYONE` **yoki** `CONNECTIONS` ko'rinadi, faqat `NOBODY` yashiradi).

### `DELETE /v1/connections/:studentId` — uzish 👤 🔓

**Request:** body yo'q; `:studentId` — narigi student id.

**Response:** `result: null`, HTTP **200**.

**Logika:** edge yo'q **yoki** `ACCEPTED` emas → **404 `CONNECTION_NOT_FOUND`** (`Bog'lanish topilmadi`). Aks holda edge o'chiriladi (har ikki tomon uzishi mumkin). Faqat o'chirish — DECLINED holatiga o'tmaydi, shuning uchun cooldown yo'q (darrov qayta so'rov mumkin).

### `POST /v1/blocks` · `DELETE /v1/blocks/:studentId` — bloklash 👤 🔓

`POST /v1/blocks` — `BlockDto`: `{ "studentId": string }`. HTTP **200**, `result: null`.
- `studentId === self` → **422 `CANNOT_CONNECT_SELF`** (`O'zingizni bloklay olmaysiz`).
- Student yo'q → **404 `STUDENT_NOT_FOUND`**.
- Aks holda bloklaydi — **idempotent**, va juftlikdagi **har qanday edge'ni o'chiradi** (block bog'lanishdan ustun: connected/pending hammasi yo'qoladi). Bloklangan juftlik bir-biriga so'rov yubora olmaydi (`sendRequest` da `USER_BLOCKED`) va bir-birini direktoriyada ko'rmaydi.

`DELETE /v1/blocks/:studentId` — blokni olib tashlaydi. HTTP **200**, `result: null`. **Idempotent** — blok bo'lmasa ham xatosiz o'tadi. Blokdan chiqarish bog'lanishni **tiklamaydi** (qayta so'rov kerak).

### `POST /v1/reports` — shikoyat 👤 🔓 ⏱️

**Request** — `CreateReportDto`:

| Field | Turi / validatsiya | Izoh |
|---|---|---|
| `targetStudentId` | string? | Studentni shikoyat qilish |
| `messageId` | string? | Xabarni shikoyat qilish |
| `reason` | `ReportReason` (**majburiy**) | `SPAM` · `SCAM` · `HARASSMENT` · `INAPPROPRIATE` · `OTHER` |
| `note` | string? · max **1000** | Ixtiyoriy izoh |

**`targetStudentId` va `messageId` dan roppa-rosa BITTASI** berilishi shart (service tekshiradi).

**Response:** `ReportDto` (HTTP **201**): `{ id, reason, status, createdAt }`. `status` yangi shikoyatda doim **`OPEN`**.

**Logika** (`ReportsService.report`):
1. Ikkalasi ham berilgan **yoki** ikkalasi ham yo'q → **422 `REPORT_TARGET_INVALID`** (`Shikoyat uchun foydalanuvchi yoki xabar ko'rsatilishi kerak`).
2. `targetStudentId === self` → **422 `REPORT_TARGET_INVALID`** (`O'zingizni shikoyat qila olmaysiz`).
3. `targetStudentId` bo'yicha student yo'q → **404 `STUDENT_NOT_FOUND`**.
4. **Coalescing (C12):** shu reporter'ning shu target'ga (student yoki message) **OPEN** shikoyati allaqachon bo'lsa — yangi yozuv yaratmaydi, **mavjudini qaytaradi** (idempotent, spam-himoya).
5. Aks holda yangi `OPEN` shikoyat yaratiladi.

> **Message shikoyati:** `Message` jadvali hali yo'q, shuning uchun `contentSnapshot` doim `null` (message snapshot'i Plan 2). `messageId` mavjudligi tekshirilmaydi.

### `GET /v1/students` — student direktoriyasi 👤 🔓 ⏱️

**Query** — `StudentsQueryDto`. Har filtr **ixtiyoriy**; hammasi AND bilan birlashadi; multi-value filtrlar `a,b` yoki takror `?k=a&k=b` shaklida keladi (bo'shlar tashlanadi).

| Query param | Turi | Izoh |
|---|---|---|
| `q` | string? | Username **prefix** OR fullName **contains** (case-insensitive) |
| `universityId` | string[]? (`a,b`) | Bir yoki bir nechta; student profilidagi qiymatga **aniq** mos (hozir `emis-<id>`, masalan `emis-142`) |
| `gender` | `Gender[]?` (`MALE,FEMALE`) | Bir yoki bir nechta |
| `courseYear` | `CourseYear[]?` (`1,2`) | Bir yoki bir nechta (`"1".."4","MASTER"`) |
| `birthYearFrom` | int? (1900–2100) | Inclusive quyi chegara |
| `birthYearTo` | int? (1900–2100) | Inclusive yuqori chegara |
| `connectionStatus` | `ConnectionView?` | Faqat shu munosabatdagilar (`NONE`/`PENDING_OUT`/`PENDING_IN`/`CONNECTED`) |
| `sort` | `StudentSort?` (default `RECENT`) | `RECENT` = yangi accountlar oldin; `NAME` = alifbo |
| `page` / `size` | int? | 1-based, default 1 / 20 (max 100) |

**Response:** `SearchResultPageDto` — sahifalangan. Har `item` (`SearchResultDto`) = **`StudentSummaryDto` + `connectionStatus: ConnectionView`** (chaqiruvchining o'sha studentga munosabati).

**Logika** (`listStudents`):
- **Doimo chiqarib tashlanadi:** chaqiruvchining o'zi **va** har ikki tomon bo'yicha bloklanganlar (`blockedIds`).
- `connectionStatus` filtri viewer-relativ, direktoriya o'zi hisoblay olmaydi — service `idsByView` orqali id ro'yxatiga aylantiradi:
  - `CONNECTED`/`PENDING_OUT`/`PENDING_IN` → faqat o'sha id'lar bilan cheklaydi (`restrictToIds`). Agar sizda o'sha munosabatda hech kim bo'lmasa → **bo'sh sahifa**.
  - `NONE` → hozircha hech qanday munosabatingiz bo'lmagan **hamma** (barcha connected+pending id'lar `excludeIds`ga qo'shiladi).
- Butun sahifa uchun **bitta** `findEdges` so'rovi bilan har qatorning `connectionStatus`i hisoblanadi (per-row so'rov yo'q).
- **Presence maskasi:** qator `CONNECTED` bo'lsagina `isConnected=true` — ya'ni `CONNECTIONS` visibility faqat connected juftlarga presence beradi; boshqalarda faqat `EVERYONE` ko'rinadi.

### `GET /v1/students/search` — eski qidiruv (⚠️ deprecated) 👤 🔓

**Query** — `SearchQueryDto`: `q` (endi **ixtiyoriy**), `page`, `size`.

**Response:** `SearchResultPageDto` (yuqoridagidek).

**Logika:** `listStudents`ning yupqa aliasi — `sort` majburan `NAME`, boshqa filtrlarsiz. `GET /v1/students?q=&sort=NAME` bilan **aynan bir xil**. Faqat eski clientlar ishlashi uchun saqlangan. ⚠️ **Bu endpointda `@Throttle` yo'q** (30/min limit faqat `GET /v1/students`da). Yangi ish uchun `GET /v1/students` ishlatilsin.

---

### `StudentSummaryDto` (odam ko'ringan hamma joyda)

| Field | Turi | Izoh |
|---|---|---|
| `id` | string | cuid |
| `username` | string \| null | |
| `fullName` | string \| null | `firstName`+`lastName` qo'shilgani, yoki `null` |
| `avatarUrl` | string \| null | |
| `universityId` | string \| null | Profildagi free-form qiymat (`emis-142`); server-side katalog yo'q |
| `gender` | `Gender` \| null | |
| `courseYear` | `CourseYear` \| null | `"1".."4","MASTER"` |
| `online` | boolean | **Presence** — maskalangan (pastga qarang) |
| `lastSeenAt` | string \| null | ISO-8601; online yoki yashirin bo'lsa `null` |

> `lastSeenVisibility` **wire'ga chiqmaydi** — u faqat ichki masking kiritmasi.

**Presence masking (C7)** — target studentning `lastSeenVisibility`iga qarab (`applyPresenceVisibility`):
- `EVERYONE` → `online`/`lastSeenAt` doim ko'rinadi.
- `CONNECTIONS` (default) → faqat chaqiruvchi **connected** bo'lsa ko'rinadi.
- `NOBODY` → hech qachon; `online=false`, `lastSeenAt=null`.

Yashirilganda `online` ham `false`ga tushiriladi (shunchaki "online" ekanini oshkor qilish last-seen'ni yashirishni buzardi). Kontekstga ko'ra `isConnected`: direktoriyada qator `CONNECTED` bo'lsa · `GET /connections`da doim `true` · `GET /connections/requests`da doim `false`.

**Success (`POST /v1/reports`) — BaseResponse:**
```jsonc
{
  "success": true,
  "status": 201,
  "code": null,
  "message": "OK",
  "result": {
    "id": "rep_01H8X",
    "reason": "HARASSMENT",
    "status": "OPEN",
    "createdAt": "2026-07-28T10:30:00Z"
  },
  "error": null
}
```

**Success (`GET /v1/students`) — BaseResponse:**
```jsonc
{
  "success": true,
  "status": 200,
  "code": null,
  "message": "OK",
  "result": {
    "items": [
      {
        "id": "stu_01H8Q",
        "username": "dilnoza",
        "fullName": "Dilnoza Karimova",
        "avatarUrl": "https://cdn.elon.uz/avatars/d1.jpg",
        "universityId": "emis-142",
        "gender": "FEMALE",
        "courseYear": "2",
        "online": true,
        "lastSeenAt": null,
        "connectionStatus": "PENDING_OUT"
      },
      {
        "id": "stu_01H8R",
        "username": "sardor",
        "fullName": "Sardor Aliyev",
        "avatarUrl": null,
        "universityId": "emis-77",
        "gender": "MALE",
        "courseYear": "3",
        "online": false,
        "lastSeenAt": "2026-07-27T21:14:00Z",
        "connectionStatus": "NONE"
      }
    ],
    "page": 1,
    "size": 20,
    "total": 2,
    "hasNext": false
  },
  "error": null
}
```

---

## 4. Enumlar

| Enum | Qiymatlar | Izoh |
|---|---|---|
| `ConnectionStatus` | `PENDING` · `ACCEPTED` · `DECLINED` | Edge lifecycle (wire = Prisma). `ConnectionDto.status`da chiqadi |
| `ConnectionView` | `NONE` · `PENDING_OUT` · `PENDING_IN` · `CONNECTED` | Viewer-relativ munosabat. `NONE` = edge yo'q (yoki eski DECLINED); `PENDING_OUT` = siz yubordingiz; `PENDING_IN` = sizga yuborildi; `CONNECTED` = accepted. Filtr sifatida ham, `connectionStatus` javobida ham |
| `ReportReason` | `SPAM` · `SCAM` · `HARASSMENT` · `INAPPROPRIATE` · `OTHER` | Shikoyat sababi |
| `ReportStatus` | `OPEN` · `REVIEWED` · `ACTIONED` · `DISMISSED` | Shikoyat moderatsiya lifecycle'i. **Faqat `OPEN` erishiladi** — qolganlariga o'tkazadigan endpoint yo'q (6-bo'limga qarang) |
| `Gender` | `MALE` · `FEMALE` | |
| `CourseYear` | `"1"` · `"2"` · `"3"` · `"4"` · `"MASTER"` | Wire qiymatlari string |
| `StudentSort` | `RECENT` (default) · `NAME` | Direktoriya tartibi |

---

## 5. Xatolar

| HTTP | `error.code` | Qachon | `message` (o'zbekcha) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Token yo'q/yaroqsiz / muddati o'tgan | — (umumiy) |
| 403 | `FORBIDDEN` | Biznes token (`StudentGuard`) | — (umumiy) |
| 403 | `USER_BLOCKED` | So'rov yuborishda juftlik bloklangan (har ikki tomon) | `Bu foydalanuvchi bilan bog'lanib bo'lmaydi` |
| 404 | `STUDENT_NOT_FOUND` | So'rov/blok/shikoyat targetida bunday student yo'q | `Foydalanuvchi topilmadi` |
| 404 | `CONNECTION_REQUEST_NOT_FOUND` | accept/decline: pending kelgan so'rov bunday id bilan yo'q | `So'rov topilmadi` |
| 404 | `CONNECTION_NOT_FOUND` | disconnect: bu student bilan accepted bog'lanish yo'q | `Bog'lanish topilmadi` |
| 409 | `ALREADY_CONNECTED` | So'rov yuborishda allaqachon connected | `Siz allaqachon bog'langansiz` |
| 409 | `CONNECTION_REQUEST_EXISTS` | So'rov yuborishda o'z pending so'rovingiz bor | `So'rov allaqachon yuborilgan` |
| 422 | `CANNOT_CONNECT_SELF` | O'zingizga so'rov/o'zingizni blok | `O'zingizga so'rov yubora olmaysiz` / `O'zingizni bloklay olmaysiz` |
| 422 | `REPORT_TARGET_INVALID` | Target ikkalasi/hech biri, yoki o'zini shikoyat | `Shikoyat uchun foydalanuvchi yoki xabar ko'rsatilishi kerak` / `O'zingizni shikoyat qila olmaysiz` |
| 422 | `VALIDATION_ERROR` | DTO validatsiyasi (bo'sh `addresseeId`, yaroqsiz `direction`/enum, `note`>1000, birthYear diapazoni) — `fields` bilan | — |
| 429 | `RATE_LIMITED` | (a) `@Throttle` IP-limit (requests 20/min, students 30/min, reports 10/min); (b) DECLINED so'rovga 24 soatlik cooldown ichida qayta yuborish | (b) `Rad etilgan so'rovni birozdan so'ng qayta yuborishingiz mumkin` |

---

## 6. Admin panel eslatmasi

🔓 **Butun modul self-scoped** — har endpoint faqat **chaqiruvchi studentning o'z** grafi/qidiruvini qaytaradi. **Cross-user ko'rinish yo'q:** admin boshqa studentning so'rovlari, bog'lanishlari yoki bloklarini ko'ra olmaydi.

**Eng muhim bo'shliq — moderatsiya navbati (shikoyatlar):**

`POST /v1/reports` — bu **moderatsiya navbatining yagona manbasi**. `Report.status` (`OPEN → REVIEWED / ACTIONED / DISMISSED`) va `ReportStatus` enum **mavjud**, kod izohlari "Feeds moderation (admin, later)" deydi, **lekin**:

- shikoyatlarni **ro'yxatlash** endpointi **YO'Q** (status/reason/target bo'yicha),
- bitta shikoyatni ko'rish (target student yoki xabar snapshot'i) endpointi **YO'Q**,
- statusni o'tkazish (choralar ko'rish: `REVIEWED`/`ACTIONED`/`DISMISSED`) endpointi **YO'Q**.

Ya'ni bugun shikoyatlar bazaga tushadi-yu, ularni **ko'radigan yoki hal qiladigan** hech qanday yo'l yo'q — hammasi abadiy `OPEN`. Complaints/moderation paneli uchun backend qo'shishi kerak:

- `GET /v1/admin/reports` — filtr (`status`, `reason`, `targetStudentId`, `reporterId`, sana) + paginatsiya;
- `GET /v1/admin/reports/:id` — reporter, target student **yoki** xabar snapshot'i (`contentSnapshot` — hozir doim `null`, Plan 2 message-snapshot kerak);
- `POST /v1/admin/reports/:id/review · /action · /dismiss` — statusni o'tkazish (kerak bo'lsa target studentni block/warn bilan bog'lash).

**Qo'shimcha bo'shliqlar:**

- **Blok/bog'lanish ko'rinishi yo'q** — admin biror studentning kimni bloklagani yoki kim bilan bog'langanini ko'ra olmaydi. Support/moderatsiya uchun `GET /v1/admin/users/:id/connections` va `.../blocks` kerak bo'lishi mumkin.
- **Coalescing e'tibor:** takroriy OPEN shikoyat yangi yozuv yaratmaydi — bir target ustidan **necha kishi** shikoyat qilgani (reporter soni) moderatsiya panelida ko'rsatilishi uchun aggregatsiya kerak.

Barchasi permission-gated admin endpointlar. To'liq ro'yxat: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).
