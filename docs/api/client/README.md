# StudentClub (talaba ilovasi) — API hujjatlari

Talaba tomonining spetsifikatsiyalari. Biznes tomoni (QS Business) — `../provider/`.

| Fayl | Nima | Holat |
|---|---|---|
| **`STUDENT_FEED.md`** | **Kelishilgan spetsifikatsiya** — feed, katalog guruhlari, filtr sxemasi, xarita, sevimlilar. Backend shu bo'yicha quriladi | ✅ amal qiladi |
| `_raw/` | Mobil dev yuborgan asl topshiriqlar | 🗄 tarixiy nusxa |

## `_raw/` nima uchun saqlanadi

Provenance uchun — asl matn kerak bo'lganda solishtirish mumkin. **Ishlab chiqarishda
ishlatilmaydi.** Har uchala fayl `STUDENT_FEED.md` ga singdirilgan yoki bekor qilingan:

| Fayl | Taqdiri |
|---|---|
| `DISCOUNTS_SEARCH_PROMPT.md` | `STUDENT_FEED.md` ning asosi. Ilova A (katalog) olib tashlandi — u `../provider/catalog-seed.json` da |
| `PROMPT_REGULAR_LISTINGS.md` | 6 banddan 5 tasi asosiy spec'da allaqachon bor edi; yagona yangisi (`byListingKind` faceti) `STUDENT_FEED.md` §8.3 ga qo'shildi |
| `BACKEND_PROMPT.md` | **Ishlatilmaydi.** `../provider/BACKEND_PROMPT.md` ning eskirgan nusxasi (3 farq, hammasida provider nusxasi to'g'ri) va student tomoniga tegishli emas — 29 endpointdan 28 tasi provider |

## Hukm tartibi

Ziddiyat chiqqanda:

```
elon-uz.json  →  provider/BACKEND_PROMPT.md  →  catalog-seed.json  →  STUDENT_FEED.md  →  _raw/
```

## Mobil dev uchun

`STUDENT_FEED.md` §0 — asl topshiriqdan **nima o'zgardi va nega**:
- §0.1 bekor qilingan talablar (allaqachon bajarilgan ishlar)
- §0.2 tuzatilgan xatolar (E1–E14)
- §0.3 qarorlar (D1–D20)
- §0.4 Level 1 dan chiqarilganlar

Ochiq qolgan ikki band mobil dev bilan kelishildi (2026-07-26) va `✅ Hal qilindi` deb
belgilangan: `GET /discounts` ning taqdiri (§2) va `CLOTHING.gender` ↔ `_gender` taqsimoti (§5).
