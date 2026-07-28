# API reference — admin panel uchun

Bu papka — **loyihaning mavjud API'sining to'liq referensi**, admin panel frontendi uchun. Har modul alohida faylda: endpointlar, ularning **logikasi**, **filtrlari**, request/response va **auth-scope**.

## Qanday ishlatiladi

Admin panel frontendi ikki manbani birga ishlatadi:
1. **Swagger** (`/docs`, `docs/api/provider/elon-uz.json`) — endpoint sxemasi (raw DTO shape, generatsiya uchun).
2. **Bu doc** — har endpointning mantiqi, filtrlari, business-rule'lari va admin panelda qanday ishlatilishi.

> 🔧 **Backend jamoasi uchun:** [`BACKEND-TASKS.md`](./BACKEND-TASKS.md) — admin panel **to'liq** ishlashi uchun qurilishi kerak bo'lgan endpointlar (admin auth/role, cross-user ro'yxatlar, moderatsiya) ustuvorlik fazalari bilan.

> ⚠️ Ko'p endpoint **self/owner-scoped** (faqat "o'zini" qaytaradi). Admin panel hamma ma'lumotni boshqarishi uchun backend bu scope'ni permission bilan ochishi kerak — batafsil [`00-overview.md`](./00-overview.md) → "Admin panel scope eslatmasi", va har faylning "Admin panel eslatmasi" bo'limi.

## Fayllar

| # | Fayl | Modul / qamrov |
|---|---|---|
| 00 | [`00-overview.md`](./00-overview.md) | Konvensiyalar: base URL, guard'lar/auth, envelope, pagination (2 xil), error, scope belgilar |
| 01 | [`01-auth.md`](./01-auth.md) | Auth (student + biznes): register, login, OAuth, refresh, logout, OTP, password, sessions |
| 02 | [`02-profile.md`](./02-profile.md) | Profil: `GET/PUT /profile/me` |
| 03 | [`03-business.md`](./03-business.md) | Biznes CRUD (my, :id, create, update, delete), status |
| 04 | [`04-branches.md`](./04-branches.md) | Filiallar/do'konlar CRUD (biznes ostida), lokatsiya, ish vaqti, yetkazib berish |
| 05 | [`05-catalog.md`](./05-catalog.md) | Katalog: business types, kategoriyalar, atributlar, catalog groups/types, admin business-type CRUD |
| 06 | [`06-listings.md`](./06-listings.md) | E'lonlar (owner): CRUD, status amallari (submit/pause/activate/withdraw/duplicate), stats |
| 07 | [`07-discounts-feed.md`](./07-discounts-feed.md) | Student feed: search (LIST/COUNT/MAP), detail, filter-schema, favorites, suggest — **barcha filtrlar** |
| 08 | [`08-geo.md`](./08-geo.md) | Geo: regions, districts, geocode / reverse-geocode |
| 09 | [`09-trade-centers.md`](./09-trade-centers.md) | Savdo markazlari: list, detail (dinamik maydonlar) |
| 10 | [`10-redemptions.md`](./10-redemptions.md) | Redemption: start (student), verify/confirm/history (biznes) |
| 11 | [`11-connections.md`](./11-connections.md) | Ijtimoiy: connection requests, connections, blocks, reports (shikoyatlar), student directory/search |
| 12 | [`12-chat.md`](./12-chat.md) | Chat: conversations, xabarlar, o'qildi kursori |
| 13 | [`13-media.md`](./13-media.md) | Media yuklash (`POST /media/upload`) |
| 14 | [`14-devices.md`](./14-devices.md) | Push qurilma tokenlari (student) |
| — | [`BACKEND-TASKS.md`](./BACKEND-TASKS.md) | Backend TODO: admin panel to'liq ishlashi uchun qurilishi kerak bo'lganlar |

## Har fayl ichida

1. **Maqsad** — modul nima qiladi.
2. **Endpointlar** — jadval: `METHOD + path` · scope belgilar · maqsad.
3. **Har endpoint** — request (DTO fields), response (shape), **logika** (business-rule'lar, status o'tishlari), **filtrlar** (list uchun barcha query/body params).
4. **Enumlar** — ishlatilgan enum qiymatlari.
5. **Xatolar** — error kodlari.
6. **Admin panel eslatmasi** — scope cheklovi + admin uchun nima ochilishi kerakligi.

## Umumiy qoidalar

Base URL, envelope, pagination, error, auth — [`00-overview.md`](./00-overview.md)da bir marta. Modul fayllari unga tayanadi.
