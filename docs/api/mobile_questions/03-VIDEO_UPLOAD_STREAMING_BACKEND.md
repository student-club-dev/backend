# Noma'lum hajmli (oqimli) yuklash — **qolgan ikkita o'zgarish**

Bu hujjat 2026-08-05 da qisqartirildi: bajarilgan qismlar olib tashlandi. To'liq asl
nusxa git tarixida.

Maqsad o'zgarmadi: `POST /v1/media/upload/init` **`totalBytes` siz** ham sessiya ocha
olsin, hajm esa `complete` da e'lon qilinsin. Shunda video **siqilayotgan paytda**
yuborila boshlaydi va 3 daqiqalik lavhada yuborish vaqti taxminan siqish vaqtiga teng
bo'lib qoladi (hozir: siqish + yuklash, ketma-ket).

Yakuniy API kontrakti — `dev/api-client-generator/student-club.json` (OpenAPI v1,
**yagona manba**).

---

## Bajarilgan

Spec'dan tekshirildi (2026-08-04):

| Narsa | Holat |
|---|---|
| `CompleteUploadDto.totalBytes` (`int64`) — yakuniy hajmni `complete` da aytish | ✅ qo'shilgan |
| `init` dagi `totalBytes` endi «yuqori chegara, aniq bo'lishi shart emas» | ✅ izoh yangilangan |
| `PUT …/part/{index}` — takroriy indeks o'zini qayta yozadi | ✅ o'zgarishsiz |

---

## Qolgani

### 1. `InitUploadDto` da `totalBytes` — `required` dan chiqarilsin

Hozir: `"required": ["kind", "totalBytes"]`. Ya'ni hajmni bilmasdan sessiya ocholmaymiz
va oqimli yuklash mumkin emas — «yuqori chegara» izohi masalani yechmaydi, chunki
kodlash boshlanmasidan uni ham bilmaymiz.

```jsonc
{ "kind": "VIDEO", "conversationId": "…", "fileName": "video.mp4" }   // totalBytes YO'Q
```

- `totalBytes` **berilsa** — hammasi bugungidek qoladi.
- **Berilmasa** — sessiya "oqimli" bo'ladi: bo'laklar soni oldindan noma'lum, oxirgi
  bo'lakni `complete` belgilaydi.

Javob o'zgarmaydi (`uploadId`, `chunkSize`, `received`).

**Kvota.** Oqimli sessiyada `init` da aniq hajm yo'q — taklif: kvotadan **shartli**
ravishda bitta videoning yuqori chegarasi band qilinsin va `complete` da haqiqiy hajm
bo'yicha to'g'rilansin. Kvota to'lgan bo'lsa `init` baribir darhol rad etsin — bu `init`
ning asosiy foydasi va u yo'qolmasligi kerak.

### 2. `CompleteUploadDto` ga `parts` qo'shilsin

```jsonc
{ "totalBytes": 11534336, "parts": 6 }
```

`totalBytes` bor, `parts` yo'q. Oqimli sessiyada bo'laklar soni oldindan noma'lum
bo'lgani uchun **oxirgi bo'lakni aynan shu maydon belgilaydi** — usiz server yig'ish
tugaganini bilolmaydi.

- Ikkala maydon ham faqat **oqimli** sessiyada majburiy; `totalBytes` bilan ochilgan
  sessiyada tana bo'sh qolaveradi (orqaga mos).
- Server tekshiradi: `0..parts-1` bo'laklarning **hammasi** kelganmi va yig'indi hajm
  e'lon qilinganiga tengmi. Mos kelmasa — `409 UPLOAD_INCOMPLETE` (yoki mavjud kod).

---

## Bitta nozik joy (bizdan ogohlantirish)

MP4 muxer fayl oxirida boshidagi `mdat` sarlavhasini to'g'rilaydi, ya'ni **0-bo'lak
oxirida qayta yuboriladi**. Sizning tarafingizda bu allaqachon xavfsiz (bir xil indeks
o'zini qayta yozadi) — qo'shimcha hech narsa kerak emas, faqat `complete` gacha bo'lakni
qayta qabul qilishda davom eting.

---

## Qabul mezonlari

- [ ] `init` `totalBytes` siz ishlaydi va `uploadId` + `chunkSize` qaytaradi
- [ ] `complete { totalBytes, parts }` faylni yig'adi va o'sha `AttachmentDto` ni qaytaradi
- [ ] Bo'lak yetishmasa yoki hajm mos kelmasa `complete` xato beradi va sessiya buzilmaydi
      (yetishmagan bo'lakni yuborib qayta urinish mumkin)
- [ ] 0-bo'lak `complete` dan oldin qayta yuborilsa — yangi baytlar qoladi
- [ ] `totalBytes` bilan ochilgan eski oqim **hech qanday o'zgarishsiz** ishlaydi
