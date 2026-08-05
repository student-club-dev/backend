# ADMIN-API — qurilgan admin endpointlar

Bu — hozirgacha backend'da **haqiqatan qurilgan** `/v1/admin/*` endpointlari (ishlaydi, Swagger'da ham bor). To'liq reja: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md). Umumiy qoidalar (envelope, pagination, error): [`00-overview.md`](./00-overview.md).

- **Auth:** har so'rovda `Authorization: Bearer <adminAccessToken>` (login'dan).
- **Rollar:** `ADMIN`, `MODERATOR`. Faza 1 read'lar — ikkalasi ham.
- **Pagination:** 1-based (`page` default 1, `size` default 20, max 100), `{ items, page, size, total, hasNext }`.
- Field tafsilotlari — Swagger (`/docs`) va tegishli modul referens fayllari (`02-profile`, `03-business`).

---

## Faza 0 — Auth ✅

| METHOD + path | Request | Response | Izoh |
|---|---|---|---|
| `POST /v1/admin/auth/login` | `{ email, password }` | `{ accessToken }` | Env creds bilan tekshiradi. Xato → **401 `ADMIN_INVALID_CREDENTIALS`** ("Email yoki parol noto'g'ri", enumeration yo'q) |
| `GET /v1/admin/auth/me` | — (Bearer) | `{ email, role }` | Joriy admin |
| `POST /v1/admin/auth/logout` | — (Bearer) | `null` | Stateless (client tokenni tashlaydi) |

**Env:** `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (rol `ADMIN`), `MODERATOR_EMAIL` + `MODERATOR_PASSWORD_HASH` (rol `MODERATOR`). Parol — **argon2 hash**:
```bash
node -e "require('@node-rs/argon2').hash(process.argv[1]).then(h=>console.log(h))" 'sizningParolingiz'
```

---

## Faza 1 — Cross-user read'lar (ADMIN + MODERATOR) ✅ BAJARILDI

### Studentlar ✅
| METHOD + path | Filtrlar / Response |
|---|---|
| `GET /v1/admin/students` | Filtr: `q` (firstName/lastName/username/phoneNumber/email, insensitive contains), `universityId`, `courseYear`, `gender`, `phoneVerified`, `createdFrom`/`createdTo`, `sort` (`NEWEST`\|`OLDEST`), `page`, `size`. → `AdminStudentSummaryDto` sahifasi (id, firstName, lastName, username, avatarUrl, phoneNumber, email, universityId, courseYear, createdAt) |
| `GET /v1/admin/students/:id` | `AdminStudentDto` — barcha Student maydonlari (**`passwordHash` yo'q**). 404 `STUDENT_NOT_FOUND` |

> `status` (ban) filtri — Faza 3'da (model maydoni qo'shilgach).

### Biznes egalari ✅
| METHOD + path | Filtrlar / Response |
|---|---|
| `GET /v1/admin/business-owners` | Filtr: `q` (firstName/lastName/phoneNumber/email), `phoneVerified`, `createdFrom`/`createdTo`, `sort`, `page`, `size`. → `AdminBusinessOwnerSummaryDto` sahifasi (+ `businessesCount`) |
| `GET /v1/admin/business-owners/:id` | `AdminBusinessOwnerDto` (barcha maydon, `passwordHash` yo'q, + `businessesCount`). 404 `BUSINESS_OWNER_NOT_FOUND` |
| `GET /v1/admin/business-owners/:id/businesses` | `[{ id, name, type, status, listingsCount, createdAt }]` — o'sha egaga tegishli hamma biznes (har status) |

### Bizneslar ✅
| METHOD + path | Filtrlar / Response |
|---|---|
| `GET /v1/admin/businesses` | Filtr: `q` (name/legalName/inn/phone), `ownerId`, `status` (BusinessStatus — **repeatable/multi**), `type`, `regionId` (biznesning biror filiali shu regionda), `isOnlineOnly`, `createdFrom`/`createdTo`, `sort` (`NEWEST`\|`OLDEST`\|`NAME`), `page`, `size`. → `AdminBusinessSummaryDto` sahifasi (id, name, type, ownerId, ownerFullName, status, listingsCount, branchesCount, createdAt) |
| `GET /v1/admin/businesses/:id` | `AdminBusinessDto` (to'liq + `owner {ownerId, ownerFullName, ownerPhone}` + branchesCount). Admin **ownership'ni bypass** qiladi (har biznes, ARCHIVED ham). 404 `BUSINESS_NOT_FOUND` |

### Do'konlar / filiallar ✅
| METHOD + path | Filtrlar / Response |
|---|---|
| `GET /v1/admin/branches` | Filtr: `q` (name/address), `businessId`, `ownerId`, `regionId`, `districtId`, `tradeCenterId`, `isActive`, `hasDelivery`, **geo** — bbox (`minLat/minLng/maxLat/maxLng`) yoki radius (`lat/lng/radiusMeters`, default 5000; PostGIS `ST_DWithin`), `sort` (`NEWEST`\|`NAME`), `page`, `size`. → `AdminBranchSummaryDto` sahifasi (id, businessId, businessName, name, regionId, regionName, districtName, address, lat, lng, isActive, tradeCenterName) |
| `GET /v1/admin/branches/:id` | `AdminBranchDto` (to'liq: location + region/district nomlari, workingHours, deliveryZone, tradeCenter + fields). 404 `BRANCH_NOT_FOUND` |

### E'lonlar ✅
| METHOD + path | Filtrlar / Response |
|---|---|
| `GET /v1/admin/listings` | Filtr: `q` (title/description), `businessId`, `ownerId`, `status` (**repeatable/multi** — DRAFT/PENDING/REJECTED ham), `categoryKey`, `type`, `groupKey`, `regionId`, `districtId` (biror filiali orqali), `priceMin`/`priceMax` + `priceBasis` (`FINAL`\|`ORIGINAL`), `discountType`, `listingKind` (`ALL`\|`DISCOUNT`\|`REGULAR`), `redemptionMethod`, `createdFrom`/`createdTo`, `validToAfter`/`validToBefore`, `sort` (`NEWEST`\|`OLDEST`\|`PRICE_FINAL`\|`VIEWS`\|`ENDING_SOON`), `page`, `size`. → `AdminListingSummaryDto` sahifasi |
| `GET /v1/admin/listings/:id` | `AdminListingDto` (to'liq, **har status** + businessName). 404 `LISTING_NOT_FOUND` |
| `GET /v1/admin/listings/:id/stats` | `ListingStatsDto` (viewsCount, favoritesCount, redemptionsCount, conversionRate, totalRevenue). 404 `LISTING_NOT_FOUND` |

### Dashboard ✅
| METHOD + path | Response |
|---|---|
| `GET /v1/admin/dashboard/stats` | `AdminDashboardStatsDto`: `students {total}`, `businessOwners {total}`, `businesses {total, byStatus{...6}}`, `listings {total, byStatus{...9}}`, `redemptions {total, confirmed, pending}`, `moderation {pendingBusinesses, pendingListings, openReports}` |

> Ban sonlari (`students.banned`) va `/timeseries` — keyingi fazalarda.

---

## Faza 3 — Write: create · edit · ban · delete ✅ BAJARILDI

Ruxsat: **PUT (edit) = ADMIN + MODERATOR**; **POST (create) = faqat ADMIN**.

### Studentlar ✅
| METHOD + path | Rol | Nima |
|---|---|---|
| `PUT /v1/admin/students/:id` | ADMIN+MOD | Tahrirlash (firstName, lastName, username, phoneNumber, gender, universityId, universityEmail, birthYear, courseYear, avatarUrl — optional). Phone o'zgarsa `phoneVerified=false`; username unique. 404 `STUDENT_NOT_FOUND`, 409 `ACCOUNT_EXISTS`/`USERNAME_TAKEN`. → `AdminStudentDto` |
| `POST /v1/admin/students` | ADMIN | Yangi akkaunt: `email?`/`phoneNumber?` (≥1), `password` (min 8, argon2) + profil maydonlari. → `AdminStudentDto` (201) |

### Biznes egalari ✅
| METHOD + path | Rol | Nima |
|---|---|---|
| `PUT /v1/admin/business-owners/:id` | ADMIN+MOD | Tahrirlash (firstName, lastName, phoneNumber, gender, avatarUrl). Phone o'zgarsa `phoneVerified=false`. 404 `BUSINESS_OWNER_NOT_FOUND`. → `AdminBusinessOwnerDto` |
| `POST /v1/admin/business-owners` | ADMIN | Yangi akkaunt (`email?`/`phoneNumber?` ≥1, `password` min 8 + maydonlar). → `AdminBusinessOwnerDto` (201) |

### Bizneslar / Do'konlar / E'lonlar — tahrirlash ✅
Ruxsat: ADMIN + MODERATOR. Ownership bypass, lekin **mavjud validatsiya to'liq qayta ishlatiladi**.
| METHOD + path | Nima |
|---|---|
| `PUT /v1/admin/businesses/:id` | `UpdateBusinessDto` (type immutable → 422 `BUSINESS_TYPE_IMMUTABLE`). 404 `BUSINESS_NOT_FOUND`. → `AdminBusinessDto` |
| `PUT /v1/admin/branches/:id` | `BranchRequestDto` (full replace + location/trade-center gate'lar). 404 `BRANCH_NOT_FOUND`. → `AdminBranchDto` |
| `PUT /v1/admin/listings/:id` | `UpdateListingRequestDto` (finalPrice qayta hisob + catalog/attribute/discount validatsiya). 404 `LISTING_NOT_FOUND`. → `AdminListingDto` |

### Ban / suspend ✅
Ruxsat: ADMIN + MODERATOR. Migration: `students`/`business_owners` → `status`, `bannedAt`, `banReason` (deploy'da `prisma migrate deploy`).
| METHOD + path | Nima |
|---|---|
| `POST /v1/admin/students/:id/ban` | `{ reason }` → status=BANNED, sessiyalar bekor. 404 `STUDENT_NOT_FOUND`. → `AdminStudentDto` |
| `POST /v1/admin/students/:id/unban` | status=ACTIVE. → `AdminStudentDto` |
| `POST /v1/admin/business-owners/:id/ban` · `/unban` | Xuddi shu (owners). 404 `BUSINESS_OWNER_NOT_FOUND` |

- **Auth:** BANNED/DELETED hisob **login / refresh / OAuth** qila olmaydi → **403 `ACCOUNT_BANNED`**.
- **Filtr/DTO:** `GET /admin/students · /business-owners` endi `status` filtri + `status`/`bannedAt`/`banReason` maydonlari; dashboard'da `banned` soni.

### O'chirish ✅
Ruxsat: **ADMIN only** (hisoblar), ADMIN + MODERATOR (e'lonlar). To'liq: [`15-deletion.md`](./15-deletion.md).
Migration: `students`/`business_owners` → `deletedAt`, `deletedReason`.

| METHOD + path | Nima |
|---|---|
| `DELETE /v1/admin/students/:id` | `{ reason? }` → status=DELETED, sessiyalar bekor, push tokenlari o'chadi, **o'z e'lonlari ARCHIVED**. 404 `STUDENT_NOT_FOUND`, 409 allaqachon o'chirilgan. → `AdminStudentDto` |
| `DELETE /v1/admin/business-owners/:id` | `{ reason? }` → o'sha + **bizneslari va ulardagi barcha e'lonlar ARCHIVED**. 404 `BUSINESS_OWNER_NOT_FOUND` |
| `DELETE /v1/admin/listings/:id` | → status=ARCHIVED (owner'ning o'z DELETE'i bilan bir xil holat). 404 `LISTING_NOT_FOUND`, 409 allaqachon arxivlangan. ADMIN + MODERATOR |

⚠️ **Hech qanday qator bazadan o'chirilmaydi va tiklash endpointi YO'Q.** `Student` ga 21 ta jadval
`onDelete: Cascade` — jumladan `Message` (boshqa odamning suhbat tarixi) va `Report` (o'sha odam
ustidan yozilgan shikoyatlar). Sabab va tafsilotlar: [`15-deletion.md`](./15-deletion.md) §2.

### Talaba e'lonlari ✅ **(yangi surface)**
Ruxsat: ADMIN + MODERATOR. Ilgari bu yo'nalishda **umuman hech narsa yo'q edi**.

| METHOD + path | Nima |
|---|---|
| `GET /v1/admin/student-listings` | Filtrlar: `q`, `kind`, `status` (vergul bilan; berilmasa **hamma** status), `ownerId`, `includeDeleted`, `page`, `size`. → `{ items, page, size, total, hasNext }` |
| `GET /v1/admin/student-listings/:id` | Har qanday statusda, **o'chirilgani ham**. 404 `LISTING_NOT_FOUND` |
| `DELETE /v1/admin/student-listings/:id` | Soft (`deletedAt`). 409 allaqachon o'chirilgan |

⚠️ Talaba e'lonlari **moderatsiyadan o'tmaydi** — yuborilgan zahoti chop etiladi. `approve`/`reject`
yo'q va bo'lmaydi; o'chirish — yagona chora.

### Tizim bildirishnomalari ✅
Ruxsat: **ADMIN only**.

| METHOD + path | Nima |
|---|---|
| `POST /v1/admin/notifications` | `{ studentIds[1..500], title, body?, kind?: ANNOUNCEMENT\|PROFILE, sendPush?: false }` → talabalarning ilova ichidagi ro'yxatiga yozadi. `ANNOUNCEMENT` **sukut bo'yicha push yubormaydi**; `PROFILE` doim yuboradi. Ikkalasi ham tungi jimlikka (22:00–08:00) bo'ysunadi. → `null` |

«Hammaga yubor» bayrog'i ataylab yo'q — ro'yxat qo'lda tuzilsin.

---

## Faza 4 — Reference CRUD (ADMIN only) ✅ BAJARILDI

### Geo — regions & districts ✅
| METHOD + path | Nima |
|---|---|
| `POST · PUT · DELETE /v1/admin/regions` (`/:id`) | Viloyat CRUD (id key, nameUz/Ru, centerLat/Lng). 409 `REGION_EXISTS`/`REGION_IN_USE`, 404 `REGION_NOT_FOUND` |
| `POST · PUT · DELETE /v1/admin/districts` (`/:id`) | Tuman CRUD (`regionId` mavjud bo'lishi shart). 409 `DISTRICT_EXISTS`/`DISTRICT_IN_USE`, 404 `DISTRICT_NOT_FOUND`/`REGION_NOT_FOUND` |

### Savdo markazlari — centers & fields ✅
| METHOD + path | Nima |
|---|---|
| `GET /v1/admin/trade-centers` (`/:id`) | Hammasi (**INACTIVE ham**). → `AdminTradeCenterDto` (status, sortOrder bilan) |
| `POST · PUT · DELETE /v1/admin/trade-centers` (`/:id`) | Markaz CRUD (`slug` unique). 409 `TRADE_CENTER_SLUG_EXISTS`/`TRADE_CENTER_IN_USE` |
| `POST · PUT · DELETE /v1/admin/trade-centers/:id/fields` (`/:fieldId`) | Dinamik maydonlar CRUD. 409 `TRADE_CENTER_FIELD_IN_USE`, 404 `TRADE_CENTER_FIELD_NOT_FOUND` |

Barcha delete'lar **referential-integrity** bilan (ishlatilayotgan bo'lsa 409).

### Katalog — groups / categories / attribute specs / business-types ✅
| METHOD + path | Nima |
|---|---|
| `POST · PUT · DELETE /v1/admin/catalog/groups` (`/:key`) | Guruh CRUD. 409 `CATALOG_GROUP_EXISTS`/`CATALOG_GROUP_IN_USE`, 404 `CATALOG_GROUP_NOT_FOUND` |
| `POST · PUT · DELETE /v1/admin/categories` (`/:id`) | Kategoriya CRUD (`businessType` mavjud). 409 `CATEGORY_EXISTS`/`CATEGORY_IN_USE`, 404 `CATEGORY_NOT_FOUND`/`BUSINESS_TYPE_NOT_FOUND` |
| `POST · PUT · DELETE /v1/admin/attribute-specs` (`/:id`) | Atribut sxemasi CRUD. 409 `ATTRIBUTE_SPEC_EXISTS`, 404 `ATTRIBUTE_SPEC_NOT_FOUND` (in-use tekshiruvi yo'q — attributelar loose JSON) |
| `POST · PUT · DELETE /v1/admin/business-types` (`/:type`) | Biznes turi CRUD (avvaldan bor; guard endi `AdminJwtGuard`) |

> 🔑 **Placeholder tozalandi:** eski `X-Admin-Key` (`AdminGuard`) va `ADMIN_API_KEY` **o'chirildi** — barcha admin endpointlar endi yagona `AdminJwtGuard` ostida.

---

## Boshqa keyingi fazalar — 🔴 hali yo'q
- **Ban/suspend + delete** (student & owner) — `status`/`bannedAt` migration bilan.
- **Faza 5:** redemptions audit, audit log.
- *(Moderatsiya — hozircha kerak emas.)*
Reja: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).
