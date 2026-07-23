# Katalog — Mobil Klient uchun Qo'llanma (ElonUz)

> **Asosiy o'zgarish:** Katalog (biznes turlari, kategoriyalar, e'lon formasi maydonlari) endi
> **serverdan olinadi**. Klientdagi eski hardcode (`ListingCatalog.kt`) o'rniga quyidagi 2 ta
> endpoint chaqiriladi. Bu qiymatlar backend'da o'zgarishi mumkin — hardcode qilmang.

Real javob namunalari (27 ta type uchun to'liq): **`example-responses.json`** (shu papkada).

---

## 1. Endpointlar

Barcha javoblar `BaseResponse` konvertida keladi:

```jsonc
{ "success": true, "status": 200, "code": null, "message": "OK", "result": <payload>, "error": null }
```

### 1.1 `GET /v1/business/types`
Biznes turlari ro'yxati — "type tanlash" ekrani uchun. `result` = `BusinessTypeInfo[]` (type bo'yicha alfavit).

Ixtiyoriy: `?gender=MALE|FEMALE` — shaxsiylashtiradi (MALE → `BEAUTY_SALON` chiqmaydi, FEMALE → `BARBERSHOP` chiqmaydi). Berilmasa — barcha 27 tur.

### 1.2 `GET /v1/business/types/{type}/categories`
Tanlangan turning kategoriyalari — har biri **o'z forma maydonlari (`fields`)** bilan. `result` = `Category[]`.

Ixtiyoriy: `?gender=MALE|FEMALE` — faqat `CLOTHING` uchun ta'sir qiladi (erkak/ayol kategoriya ro'yxati). Boshqa turlarda e'tiborsiz.

Noma'lum `{type}` → **404**, `error.code = "NOT_FOUND"`.

---

## 2. Javob modellari

### BusinessTypeInfo
| Maydon | Tur | Izoh |
|--------|-----|------|
| `type` | string | Kalit, masalan `"TENNIS"` (keyingi endpointga shu beriladi) |
| `nameUz` | string | Ko'rsatiladigan nom |
| `nameRu` | string? | Hozircha `null` |
| `iconUrl` | string? | Hozircha `null` |
| `defaultPriceUnit` | enum | Standart narx birligi (`priceUnits[0]`) |
| `emoji` | string? | Masalan `"🎾"` |
| `accentColor` | string? | HEX rang, masalan `"#16A34A"` |
| `priceUnits` | enum[] | Ushbu turdagi ruxsat etilgan narx birliklari (birinchisi — default) |

`PriceUnit`: `PER_ITEM · PER_HOUR · PER_KG · PER_MONTH · PER_COURSE · PER_LESSON · PER_TICKET · PER_PERSON · PER_SESSION`.

### Category
| Maydon | Tur | Izoh |
|--------|-----|------|
| `key` | string | Kalit, masalan `"OUTDOOR"`. `Listing.categoryKey` shu bo'ladi |
| `businessType` | string | Ota tur |
| `nameUz` | string | Ko'rsatiladigan nom |
| `nameRu` | string? | `null` |
| `iconUrl` | string? | `null` |
| `sortOrder` | number | Ko'rsatish tartibi (0 dan) |
| `fields` | AttributeField[] | **Shu kategoriya tanlansa formada chiqadigan maydonlar** |
| `requiresCustomName` | boolean | `true` faqat `OTHER` uchun → `customCategoryName` majburiy bo'ladi |

- Ro'yxatning **birinchisi doim `ALL`** ("butun assortimentga/barchasiga" chegirmasi), **oxirgisi `OTHER`** ("Boshqa").

### AttributeField (forma maydoni)
| Maydon | Tur | Izoh |
|--------|-----|------|
| `key` | string | `Listing.attributes` dagi kalit |
| `label` | string | Maydon sarlavhasi |
| `type` | enum | `TEXT · NUMBER · BOOLEAN · SELECT · MULTI_SELECT · TAGS` |
| `required` | boolean | `true` → to'ldirilmasa e'lon chop etilmaydi |
| `hint` | string? | TEXT/NUMBER uchun placeholder |
| `suffix` | string? | NUMBER birligi, masalan `"daqiqa"` |
| `multiple` | boolean? | `MULTI_SELECT` uchun `true` (qiymat vergul bilan: `"S,M,L"`) |
| `options` | `{value,label}[]?` | Faqat `SELECT`/`MULTI_SELECT` uchun |

**Maydon turini render qilish:**
- `TEXT` → matn input (`hint` = placeholder)
- `NUMBER` → raqam input (`suffix` = o'ng tarafdagi birlik)
- `BOOLEAN` → switch/checkbox
- `SELECT` → bitta tanlov (`options`)
- `MULTI_SELECT` → ko'p tanlov (`options`, qiymat vergul bilan saqlanadi)
- `TAGS` → erkin teglar (chip input, `hint` = misol)

> Diqqat: hozircha bir turdagi **barcha kategoriyalar bir xil `fields`ni** oladi (maydonlar type
> darajasida). Shuning uchun `fields`ni kategoriya emas, **type bo'yicha** ham keshlashingiz mumkin.

---

## 3. E'lon yaratish oqimi (klient)

1. `GET /v1/business/types` → foydalanuvchi **type** tanlaydi.
2. `GET /v1/business/types/{type}/categories` → **kategoriya** tanlaydi.
3. Tanlangan kategoriyaning `fields[]` bo'yicha formani dinamik quramiz.
4. `Listing` yuborishda: `categoryKey`, `attributes` (`field.key` → qiymat), narx (`priceUnit` `priceUnits`dan), chegirma. `finalPrice` **serverda hisoblanadi** — yubormang.
5. `OTHER` tanlansa (`requiresCustomName: true`) → `customCategoryName` majburiy.

---

## 4. `catalog-seed.json` bilan ADASHMANG

Repodagi `catalog-seed.json` — bu **backend'ning ichki seed formati**, API javobi EMAS. Farqlar:

| seed | API |
|------|-----|
| atribut turi = `kind` | `type` |
| `attributes` + `categoryAttributes` alohida | kategoriya ichida `fields[]` birlashtirilgan |
| `options: string[]` | `options: [{value,label}]` |
| envelope yo'q | `BaseResponse` |
| `availableForGenders`, `allCategoryLabel`, `optionGroupHint` bor | API'da yo'q (server ichida) |

**Codegen / integratsiya faqat API javobi (`example-responses.json` yoki Swagger) bo'yicha.**
