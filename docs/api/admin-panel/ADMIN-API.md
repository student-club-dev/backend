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

## Faza 3 — Write: edit + create ✅ (ban/delete keyingi)

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

### Qolgan (Faza 3) — 🔴 hali yo'q
Ban/suspend + delete (student & owner) — `status`/`bannedAt` **migration** bilan.

---

## Faza 4 — Reference CRUD (ADMIN only) 🚧

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

### Qolgan (Faza 4) — 🔴 hali yo'q
**Catalog CRUD** (groups / categories / attribute specs) — `admin/business-types` allaqachon bor (guard `X-Admin-Key` → `AdminJwtGuard`ga o'tkaziladi).

---

## Boshqa keyingi fazalar — 🔴 hali yo'q
- **Ban/suspend + delete** (student & owner) — `status`/`bannedAt` migration bilan.
- **Faza 5:** redemptions audit, audit log.
- *(Moderatsiya — hozircha kerak emas.)*
Reja: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).
