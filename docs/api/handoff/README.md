# Mobil handoff — section by section

Har bir Swagger tegi (= section) uchun bitta fayl. Swagger'dan tashqari, mobil dev'ga
**shu papkani** beramiz: har fayl mustaqil o'qiladi, ichida so'rov/javob misollari, xato
kodlari, kafolatlar va ekran oqimi bor.

| # | Section (Swagger tag) | Ilova | Fayl | Endpoint | Holat |
|---|---|---|---|---|---|
| 1 | `Catalog (student feed)` | Student | [`catalog-student-feed.md`](./catalog-student-feed.md) | 3 | ✅ tayyor |
| 2 | `Discounts (student feed)` | Student | [`discounts-student-feed.md`](./discounts-student-feed.md) | 6 | ✅ tayyor |
| 3 | `Connections` | Student | [`connections.md`](./connections.md) | 10 | ✅ tayyor |

> 1 va 2 juft ishlaydi: katalog filtr ekranini chizadi, discounts uni qo'llaydi.
> 3 — chat'ning eshigi: bog'lanmagan talabalar yozisha olmaydi.

> Qolgan sectionlar navbat bilan qo'shiladi.

## Fayl ichidagi tartib (har bo'lim uchun bir xil)

1. Section nima va nechta endpoint
2. Umumiy qoidalar (base URL, auth, envelope)
3. Har endpoint: so'rov → javob → maydonlar jadvali → misol
4. Xatolar
5. Kafolatlar (klient shularga suyanishi mumkin)
6. Enumlar
7. Ekran oqimi
8. Spec'dan farqlar / qurilmaganlar
9. Manba fayllar
