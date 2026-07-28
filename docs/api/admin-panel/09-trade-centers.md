# 09 — Trade Centers (`/v1/trade-centers`)

> Konvensiyalar (envelope, pagination, guard'lar, scope belgilar) — [`00-overview.md`](./00-overview.md). Bu fayl faqat shu modul mantiqini yozadi.

## 1. Maqsad

Savdo markazlari (savdo markazi / TRC) — branch joylashuvi uchun **qo'shimcha strukturalangan metama'lumot**. Har savdo markazining o'z **dinamik maydonlari** (`fields`) bor (masalan "Qator", "Pavilon") — frontend shu ta'riflardan branch formasini quradi va biznes egasi to'ldiradi.

Bu modul **🔒 Auth** (`JwtAuthGuard`) va **read-only reference data** (seed-managed). Faqat **ACTIVE** markazlar ko'rinadi. ID'lar string kalit (`"tc_abusaxiy"`).

---

## 2. Endpointlar

| METHOD + path | Scope | Maqsad |
|---|---|---|
| `GET /v1/trade-centers` | 🔒 Auth | ACTIVE savdo markazlari ro'yxati (`sortOrder`, keyin `name` bo'yicha) |
| `GET /v1/trade-centers/:id` | 🔒 Auth | Bitta ACTIVE markaz + uning dinamik maydonlari |

Ikkalasi ham faqat `JwtAuthGuard` bilan himoyalangan (student ham, biznes ham chaqira oladi). Yozuv (create/update/delete) endpointi **yo'q**.

---

## 3. `GET /v1/trade-centers`  🔒 Auth

ACTIVE savdo markazlari ro'yxatini qaytaradi.

**Request:** body yo'q, query yo'q. Faqat `Authorization: Bearer <accessToken>`.

**Response `result` (`TradeCenterDto[]`):**

| Maydon | Tur | Izoh |
|---|---|---|
| `id` | `string` | String kalit, masalan `"tc_abusaxiy"` |
| `name` | `string` | Ko'rsatiladigan nomi |
| `slug` | `string` | URL-safe slug, masalan `"abu-saxiy"` |

**LOGIKA:** `tradeCenters.findActive()` — faqat **ACTIVE**, `orderBy: sortOrder asc, keyin name asc`. INACTIVE markazlar bu ro'yxatda **umuman ko'rinmaydi**. Ro'yxat elementlarida `fields` yo'q (yengil ro'yxat) — maydonlar faqat detail endpointda.

**FILTRLAR:** yo'q (to'liq ACTIVE ro'yxat, paginatsiyasiz).

---

## 4. `GET /v1/trade-centers/:id`  🔒 Auth

Bitta savdo markazini uning dinamik maydonlari bilan qaytaradi.

**Request:** path param `id`. Body yo'q.

**Response `result` (`TradeCenterDetailDto`):**

| Maydon | Tur | Izoh |
|---|---|---|
| `id` | `string` | Markaz kaliti |
| `name` | `string` | Ko'rsatiladigan nomi |
| `slug` | `string` | URL-safe slug |
| `fields` | `TradeCenterFieldDto[]` | Dinamik maydonlar, `sortOrder` bo'yicha tartiblangan |

**`TradeCenterFieldDto`:**

| Maydon | Tur | Izoh |
|---|---|---|
| `id` | `string` | Maydon kaliti, masalan `"f_qator"` |
| `label` | `string` | Ko'rinadigan yorliq, masalan `"Qator"` |
| `type` | `TradeCenterFieldType` | `TEXT` yoki `NUMBER` |
| `required` | `boolean` | Majburiymi |
| `sortOrder` | `number` | Ko'rsatish tartibi (o'sish bo'yicha) |

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK",
  "result": {
    "id": "tc_abusaxiy",
    "name": "Abu Saxiy",
    "slug": "abu-saxiy",
    "fields": [
      { "id": "f_qator",  "label": "Qator",  "type": "TEXT",   "required": true,  "sortOrder": 0 },
      { "id": "f_pavilon", "label": "Pavilon", "type": "NUMBER", "required": false, "sortOrder": 1 }
    ]
  },
  "error": null
}
```

**LOGIKA:** `tradeCenters.findActiveByIdWithFields(id)`. Markaz topilmasa **yoki** ACTIVE bo'lmasa → **404** `TRADE_CENTER_NOT_FOUND` (`message: "Savdo markazi topilmadi"`). `fields` `sortOrder asc` bo'yicha tartiblangan.

**FILTRLAR:** yo'q.

---

## 5. Enumlar

| Enum | Qiymatlar | Izoh |
|---|---|---|
| `TradeCenterFieldType` | `TEXT` · `NUMBER` | Dinamik maydonning kiritish turi. Keyinchalik kengaytiriladi (`SELECT`, `BOOLEAN`, `DATE`, `PHONE`) — hozircha faqat shu ikkitasi |

---

## 6. Xatolar

| HTTP | `error.code` | Qachon | `message` (o'zbekcha) |
|---|---|---|---|
| 401 | `UNAUTHORIZED` / `TOKEN_EXPIRED` | Token yo'q/yaroqsiz / muddati o'tgan | — (umumiy) |
| 404 | `TRADE_CENTER_NOT_FOUND` | `:id` bo'yicha markaz yo'q yoki ACTIVE emas | `Savdo markazi topilmadi` |

---

## 7. Admin panel eslatmasi

🔒 **Read-only, ACTIVE-only, seed-managed.** Ikkala endpoint ham faqat **ACTIVE** markazlarni **o'qish** uchun. **Create/edit/delete YO'Q** va **INACTIVE markazlarni ko'rish yo'q**: savdo markazlari va ularning maydonlari seed'dan (deploy paytida) keladi, runtime'da boshqarib bo'lmaydi.

Savdo-markaz boshqaruv paneli (yangi markaz qo'shish, nom/slug tahrirlash, ACTIVE/INACTIVE o'zgartirish, dinamik maydonlarni qo'shish/tahrirlash/qayta tartiblash) uchun mavjud endpointlar **yetarli emas** — backend admin CRUD qo'shishi kerak, masalan:
- `GET /admin/trade-centers` (INACTIVE'larni ham qamrab, status filtri bilan),
- `POST /admin/trade-centers`, `PATCH /admin/trade-centers/:id` (status, nom, slug),
- `POST /admin/trade-centers/:id/fields`, `PATCH .../fields/:fieldId`, `DELETE .../fields/:fieldId`.

To'liq ro'yxat: [`BACKEND-TASKS.md`](./BACKEND-TASKS.md).
