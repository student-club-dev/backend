# Boyitilgan profil — klient tomonidagi talablar

Profil ekranidagi «tez orada» qatorlari yopildi: bir nechta rasm, tarjimayi hol, telefon raqami,
va suhbatsiz odamning profilini ochish.

---

## 1. ⚠️ `avatarUrl` — o'zgarmadi va o'zgarmaydi

`avatarUrl` **saqlanib qoldi**. Endi u **hosila maydon**: har doim `photos[0].url` ga teng.
Rasm qo'shilganda, asosiy qilinganda yoki o'chirilganda server ikkalasini bitta tranzaksiyada
yangilaydi.

Ya'ni: eski, tarqatilgan versiyalar buzilmaydi va eskirgan rasm ko'rsatmaydi.

---

## 2. Profil rasmlari

### Oqim

```
1. POST /v1/media/chat-upload   kind=PROFILE_PHOTO   → { id }
2. POST /v1/profile/photos      { mediaId: id }      → ProfilePhotoDto
```

`conversationId` yubormang. Chegara: **12 MB**, jpeg/png/webp/heic/heif. EXIF (GPS ham)
tozalanadi.

### Endpointlar

| Metod | Yo'l | Izoh |
|---|---|---|
| `GET` | `/v1/profile/photos` | O'z rasmlarim, tartib bo'yicha |
| `POST` | `/v1/profile/photos` | `{ mediaId }` → **eng boshiga**, avatar bo'ladi |
| `PUT` | `/v1/profile/photos/{id}/main` | Mavjudini asosiy qilish |
| `DELETE` | `/v1/profile/photos/{id}` | O'chirish |

**Maksimum 6 ta** → `422 PHOTO_LIMIT_REACHED`.

### Xulq

- Yangi rasm **doim birinchi o'ringa** tushadi → "rasmni almashtirish" = bitta `POST`.
  Alohida "asosiy qilish" chaqiruvi kerak emas.
- Birinchisi o'chirilsa **keyingisi avtomatik avatar** bo'ladi.
- Oxirgisi o'chirilsa `avatarUrl = null` → bosh harflarga tushing.

### `ProfilePhotoDto`

```jsonc
{ "id": "pht_01J…",
  "url": "https://api.studentclub.uz/v1/media/med_…/raw",
  "thumbUrl": "…?variant=thumb",
  "width": 1080, "height": 1080 }
```

`url` **token bilan** so'raladi (`Authorization: Bearer`).

---

## 3. `StudentSummaryDto` — uchta yangi maydon

Bu DTO hamma joyda ishlatiladi (qidiruv, bog'lanishlar, suhbatlar, story lentasi), shuning uchun
uchalasi ham hamma joyda keladi.

### `photos: StudentPhotoDto[]`

```jsonc
"photos": [
  { "id": "pht_…", "url": "…", "thumbUrl": "…", "width": 1080, "height": 1080 }
]
```

Tartib bo'yicha. **Birinchi element doim `avatarUrl` ga teng.**

⚠️ **Bo'sh massiv** = rasm qo'ymagan talaba → `avatarUrl` ga tushing (u ham `null` bo'lishi
mumkin). Maydon `null` emas, **doim massiv** — Kotlin'da `List<StudentPhotoDto>`.

Telegramdagidek: yuqorida chiziqchalar, surib ko'riladi. Bitta rasm bo'lsa bitta chiziqcha.

### `bio: String?`

140 belgigacha. **Havola, `@handle` va telefon raqami serverda rad etiladi**, shuning uchun
oddiy matn sifatida chizsangiz bo'ladi — link detection ishga tushirish shart emas.

### `phoneNumber: String?`

E.164 formatda, **yoki `null`**. Ko'rish huquqi bo'lmasa `null` keladi.

⚠️ **Odatiy sozlama `NOBODY`**, ya'ni **ko'pchilik talabalarda `null` bo'ladi.** `null` bo'lsa
qatorni umuman chizmang — bo'sh "Telefon: —" qatori foydali emas.

---

## 4. `phoneVisibility` — yangi sozlama

`GET/PUT /v1/profile/me` da:

```jsonc
{ "phoneVisibility": "EVERYONE" | "CONNECTIONS" | "NOBODY" }
```

**Odatiy `NOBODY`.** Talabalar raqamini ko'rsatishga rozilik bermagan — sukut bo'yicha ochish spam
qo'ng'iroqqa olib keladi.

Mantiq `lastSeenVisibility` bilan **aynan bir xil**, lekin ikkalasi mustaqil: presence ochiq,
raqam yopiq bo'lishi mumkin va aksincha.

Maxfiylik ekranida ikkinchi qator sifatida qo'ying.

---

## 5. `bio` yozish

`PUT /v1/profile/me` → `{ "bio": "5/5 · Dasturiy injiniring" }`

- 140 belgi. Bo'sh satr (`""`) → tozalanadi.
- **Rad etiladi** (`422 BIO_NOT_ALLOWED`): `http(s)://…`, `t.me/…`, `@kanal`, yalang'och domen
  (`arzonkiyim.uz`), **7+ raqamli ketma-ketlik** (ajratgichlar hisobga olinmaydi —
  `+998 90 123 45 67` ham rad etiladi).

Xato matnini foydalanuvchiga ko'rsating: *"Tarjimayi holda havola yoki telefon raqami bo'lishi
mumkin emas"*. Yaxshisi — yozayotganda ogohlantiring, saqlashda kutmang.

---

## 6. `GET /v1/students/{id}` — yangi

Endi bitta talabaning profilini **suhbat ochmasdan** olish mumkin.

⚠️ **`StudentSummaryDto` emas, `SearchResultDto` qaytadi** — bu o'sha DTO ustiga
`connectionStatus` qo'shilgani, ya'ni `GET /v1/students` ro'yxatidagi qatorning aynan o'zi.

Sabab: profil ekranidagi 4 ta amal tugmasi ("Bog'lanish" / "Xabar" / …) qaysi holatda ekanini
bilishi kerak. Aks holda buni aniqlash uchun yana ro'yxatga murojaat qilardingiz.

- `bio`, `photos`, `phoneNumber` — ichida, har biri o'z maxfiylik sozlamasiga bo'ysunadi
- `404 STUDENT_NOT_FOUND` — talaba yo'q
- `403 USER_BLOCKED` — biri ikkinchisini bloklagan
- O'z id ingiz bilan ham ishlaydi

---

## 7. §12 «Postlar» bo'limi — qaror sizda

Backend hech narsa qilmadi. `GET /v1/students/{id}/listings` **qo'shilmadi**.

Siz to'g'ri aytdingiz: bu mahsulot qarori. Tavsiyamiz ham sizniki bilan bir xil — **bo'limni olib
tashlash**, chunki ilovada post tushunchasi yo'q va bo'sh tab chalg'itadi.

Mahsulot «talaba e'lonlari» ni qo'shishga qaror qilsa — ayting, kichik ish.

## 8. «Fayllar» bo'limi

`CHAT_MEDIA_AND_CALLS_BACKEND.md` §1 (`kind = FILE`) bilan yopilgan — allaqachon tayyor.

---

## 9. Xatolar

| Kod | HTTP | Nima qilish |
|---|---|---|
| `PHOTO_LIMIT_REACHED` | 422 | "6 tadan ko'p bo'lmaydi" — avval o'chiring |
| `PHOTO_NOT_FOUND` | 404 | Rasm yo'q yoki sizniki emas |
| `BIO_NOT_ALLOWED` | 422 | Bio'da havola / raqam |
| `MEDIA_ALREADY_USED` | 422 | Bu `mediaId` allaqachon ishlatilgan → qaytadan yuklang |
| `MEDIA_NOT_FOUND` | 422 | `kind=PROFILE_PHOTO` bilan yuklanmagan |
| `STUDENT_NOT_FOUND` | 404 | Talaba yo'q |
| `USER_BLOCKED` | 403 | Bloklangan |

---

## 10. Ish tartibi — tavsiya

Backend hammasini bir vaqtda berdi, lekin klientda bosqichma-bosqich qilsangiz bo'ladi:

| # | Ish | Nega shu tartibda |
|---|---|---|
| 1 | `bio` + `phoneVisibility` + `phoneNumber` ko'rsatish | Eng arzon; «tez orada» qatorlarining yarmi darhol to'ladi |
| 2 | `GET /v1/students/{id}` | Kichik, lekin profilni suhbatdan tashqarida ochadi |
| 3 | `photos` massivi + 4 ta endpoint | UI allaqachon tayyor — faqat massiv kerak |
