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

## Keyingi fazalar — 🔴 hali yo'q
- **Faza 2 — Moderatsiya:** biznes/e'lon approve/reject/block, shikoyatlar navbati.
- **Faza 3 — User boshqaruvi:** create/edit/ban/delete student & owner (+ ban migration).
- **Faza 4–5:** reference CRUD, redemptions audit, audit log.
Reja: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).
