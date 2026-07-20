# ElonUz — Backend topshiriq to'plami

Backendni **Claude (yoki dasturchi)** bilan qurish uchun shu papkадаgi fayllarni bering.

## Qanday ishlatiladi

1. **`BACKEND_PROMPT.md`** ni oching — "PROMPT BOSHLANISHI" dan "PROMPT TUGADI" gacha
   bo'lgan matnni to'liq nusxalab, Claude'ga bering.
2. Yoniga **ikkita faylни biriktiring** (prompt shuni talab qiladi):
   - `elon-uz.json` — OpenAPI 3.0.3 shartnoma (haqiqat manbai, 29 endpoint)
   - `catalog-seed.json` — katalog seed (7 tur, 74 kategoriya, atributlar)

## Fayllar

| Fayl | Nima |
|---|---|
| `BACKEND_PROMPT.md` | **Asosiy topshiriq** — stack, auth (Firebase Admin), data model, biznes qoidalar, acceptance |
| `elon-uz.json` | OpenAPI shartnoma — barcha endpoint/DTO shu yerда |
| `catalog-seed.json` | Biznes turlari/kategoriyalari/atributlari (seed) |
| `ENDPOINTS_CHECKLIST.md` | 1-daraja (22) endpoint uchun ustuvor bajarish ro'yxati |
| `API_RESPONSE_FORMAT.md` | Javob konverti (`BaseResponse`) batafsil |
| `DISCOUNTS_BUSINESS_API.md` | E'lon/biznes/chegirma to'liq spetsifikatsiyasi |

## Eslатma
- Autentifikatsiya **Firebase**da qoladi; backend faqat **Firebase ID tokenни tekshiradi**
  (mobil ilova bilan **bir xil Firebase loyihasi**).
- Har javob **`BaseResponse`** konvertида (`{success,status,result,error}`).
- `BusinessType` — **enum EMAS**, `business_types` jadvalидаgi string kalit → yangi tur qo'shish
  migratsiyasiz.
