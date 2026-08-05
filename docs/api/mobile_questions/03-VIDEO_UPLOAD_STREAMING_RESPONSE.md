# Oqimli yuklash — backend javobi

`03-VIDEO_UPLOAD_STREAMING_BACKEND.md` **to'liq bajarildi** — qolgan ikkala o'zgarish ham.
Qabul mezonlaridan **5 tasi 5 tadan**.

> **Spec:** `docs/api/generated/student.json` (= `docs/handoff/mobile/student-api.json`) yangilandi.

---

## 0. Spec'da nima o'zgardi

```jsonc
// InitUploadDto
"required": ["kind"]          // ← "totalBytes" olib tashlandi

// CompleteUploadDto
"properties": {
  "totalBytes": { "type": "integer", "format": "int64" },
  "parts":      { "type": "integer", "format": "int32" }   // ← yangi
}
// required: yo'q — ikkalasi ham ixtiyoriy, orqaga to'liq mos
```

`parts` — **`int32`**, `number` emas. Siz `04-hujjat` §14 da ogohlantirgan tuzoq: `number` bo'lsa
generator `Double` chiqaradi.

---

## 1. `init` — `totalBytes` siz

```jsonc
POST /v1/media/upload/init
{ "kind": "VIDEO", "conversationId": "cnv_…", "fileName": "video.mp4" }   // totalBytes YO'Q
```

Javob o'zgarmadi: `uploadId`, `chunkSize`, `received`, `expiresAt`, `totalBytes`.

- `totalBytes` **berilsa** — hammasi bugungidek. Hech narsa o'zgarmadi.
- **Berilmasa** — sessiya «oqimli» bo'ladi: bo'laklar soni oldindan noma'lum, oxirgi bo'lakni
  `complete` belgilaydi.

⚠️ **Javobdagi `totalBytes` haqida.** U `nullable` qilinmadi — bu klientda `Long` → `Long?` degani
bo'lardi va sizning mavjud kodingizni buzardi. Oqimli sessiyada u **rezerv** qiymatini qaytaradi,
ya'ni «bu sessiya oshib keta olmaydigan shift». Bu sizning faylingiz hajmi haqida va'da emas —
tavsifga ham shunday yozildi. Siz uni baribir o'qimaysiz.

### Kvota — so'raganingizdek

Siz aytdingiz: «Kvota to'lgan bo'lsa `init` baribir darhol rad etsin — bu `init` ning asosiy foydasi
va u yo'qolmasligi kerak.» Bajarildi.

Oqimli sessiya **rezerv** hisobiga yoziladi (`CHAT_UPLOAD_STREAM_RESERVE_BYTES`, sukut bo'yicha
**2 GB**), va `complete` da haqiqiy hajm bo'yicha to'g'rilanadi — kvota faqat `complete` da
yechiladi, bugungidek.

2 GB tanlandi, chunki u telefon kodlagan har qanday videodan ancha katta, kunlik limitdan esa ancha
kichik: hech qachon haqiqiy yuborishni rad etmaydi va bitta sessiya kunlik kvotani yeb qo'ymaydi.
Kerak bo'lsa env orqali o'zgartiriladi.

Ruxsat, disk joyi va ochiq sessiyalar chegarasi — hammasi avvalgidek `init` da tekshiriladi.

---

## 2. `complete` — `parts` bilan

```jsonc
POST /v1/media/upload/{uploadId}/complete
{ "totalBytes": 11534336, "parts": 6 }
```

| Sessiya turi | `totalBytes` | `parts` |
|---|---|---|
| `totalBytes` bilan ochilgan | ixtiyoriy (aniqlashtirish uchun) | ixtiyoriy, yuborilsa tekshiriladi |
| **oqimli** (`totalBytes` siz) | **majburiy** | **majburiy** |

Oqimli sessiyada ikkalasi ham bo'lmasa — `422 VALIDATION_ERROR`, `error.fields` bilan.

### Server nimani tekshiradi

1. `0 … parts-1` bo'laklarining **hammasi** kelganmi (teshik yo'qmi);
2. kelgan bo'laklar soni aynan `parts` gami;
3. yig'indi hajm e'lon qilingan `totalBytes` ga **tengmi**;
4. va u `init` dagi chegaradan oshmaganmi.

**Nega `parts` haqiqatan kerak** — bu eng muhim joyi: teshiksiz, lekin erta to'xtagan qator
(`0,1,2` bor, `3,4,5` hali yo'q) tugagan yuklashdan **farq qilmaydi**, agar nechta bo'lishi kerakligini
hech narsa aytmasa. `parts` siz server kesilgan videoni yig'ib, «muvaffaqiyat» deb qaytarardi.
Buni alohida test tekshiradi.

### Xato kodlari

| Holat | Kod | Status |
|---|---|---|
| Bo'lak yetishmayapti / soni mos emas | `UPLOAD_INCOMPLETE` | 422 |
| Hajm mos kelmadi yoki chegaradan oshdi | `UPLOAD_SIZE_MISMATCH` | 422 |
| Oqimli sessiyada `totalBytes`/`parts` yo'q | `VALIDATION_ERROR` | 422 |

⚠️ Siz `409 UPLOAD_INCOMPLETE` taklif qilgandingiz, lekin «(yoki mavjud kod)» deb qo'shgansiz.
**422 qoldirildi** — bu bugun ishlayotgan kod va uni o'zgartirish mavjud klientni buzardi.

**Hech biri sessiyani buzmaydi.** Yetishmagan bo'lakni yuborib, `complete` ni qayta chaqirsangiz
ishlaydi — buni ham test tekshiradi.

---

## 3. MP4 muxer nozikligi — hech narsa kerak emas edi

Siz ogohlantirgan holat (muxer fayl oxirida 0-bo'lakning `mdat` sarlavhasini to'g'rilaydi, ya'ni
0-bo'lak qayta yuboriladi) bizda allaqachon xavfsiz: bir xil indeks — bir xil fayl nomi, ya'ni
qayta yozish atomik.

Endi bu **test bilan mustahkamlangan**: `0 → 1 → 0(qayta)` ketma-ketligidan keyin yangi baytlar
qoladi va `complete` ishlaydi. Kelajakda kimdir buni buzsa, test yiqiladi.

---

## 4. Qabul mezonlari — 5/5

- [x] `init` `totalBytes` siz ishlaydi va `uploadId` + `chunkSize` qaytaradi
- [x] `complete { totalBytes, parts }` faylni yig'adi va o'sha `AttachmentDto` ni qaytaradi
- [x] Bo'lak yetishmasa yoki hajm mos kelmasa `complete` xato beradi va **sessiya buzilmaydi**
- [x] 0-bo'lak `complete` dan oldin qayta yuborilsa — yangi baytlar qoladi
- [x] `totalBytes` bilan ochilgan eski oqim **hech qanday o'zgarishsiz** ishlaydi

---

## 5. Testlar

**52 ta test** (39 servis + 13 DTO), shundan **22 tasi yangi**:

- Oqimli sessiya ochilishi, kvota rezerv bo'yicha hisoblanishi, kvota to'lganda `init` darhol
  rad etishi (bitta ham bayt kelmasidan);
- `complete` ning to'rtala tekshiruvi, jumladan **teshiksiz qisqa qator**;
- Muvaffaqiyatsiz `complete` dan keyin sessiya tirik qolishi va qayta urinish ishlashi;
- 0-bo'lak qayta yuborilishi;
- Rezervdan oshib ketishning rad etilishi;
- DTO darajasida: `init` `totalBytes` siz o'tishi, lekin `0`/`-1`/`"lots"` rad etilishi
  (yo'qlik «bilmayman» degani, nol esa klient xatosi — ikkisini aralashtirmaslik kerak).

**Orqaga moslik**: mavjud 30 ta test bittasi ham o'zgartirilmadi va hammasi o'tdi.
