# Story — klient tomonidagi talablar

24 soatlik lavhalar. Eshik **chat bilan aynan bir xil**: faqat bog'langan talabalar ko'radi,
bloklangan odam hech qachon ko'rmaydi.

---

## 1. Oqim — uch qadam

```
1. POST /v1/media/chat-upload   kind=STORY_IMAGE | STORY_VIDEO   → { id }
2. POST /v1/stories             { mediaId: id, caption? }        → StoryDto
3. GET  /v1/stories/feed                                          → lentani chizish
```

`conversationId` **yubormang** — story'da suhbat yo'q. Yuborsangiz ham e'tiborga olinmaydi.

### Yuklash chegaralari

| `kind` | MIME | Hajm | Davomiyligi |
|---|---|---|---|
| `STORY_IMAGE` | jpeg · png · webp · heic · heif | 12 MB | — |
| `STORY_VIDEO` | mp4 · quicktime | 48 MB | **≤ 30 s** |

Server: EXIF (GPS ham) tozalaydi, rasmni kichraytiradi, thumbnail + BlurHash chiqaradi, videoni
H.264/AAC ga o'giradi va birinchi kadrdan poster oladi.

**9:16 majburlanmaydi.** 9:16 ga kesib yuborsangiz — yaxshi; boshqa nisbat ham qabul qilinadi va
UI uni "fit" qilib ko'rsatadi.

⚠️ **Video darhol tayyor bo'lmasligi mumkin.** Yuklash `status: "PROCESSING"` qaytarsa,
`media:ready` WS hodisasini kuting va **shundan keyin** `POST /v1/stories` chaqiring. Erta
chaqirsangiz → `422 MEDIA_NOT_READY`.

---

## 2. `GET /v1/stories/feed`

**Muallif bo'yicha guruhlangan va allaqachon saralangan.** Qayta saralamang.

```jsonc
{
  "result": {
    "items": [
      {
        "author": { "...StudentSummaryDto..." },
        "stories": [ { "...StoryDto..." } ],
        "hasUnseen": true,
        "lastCreatedAt": "2026-07-31T08:14:22.531Z"
      }
    ]
  }
}
```

**Tartib:** avval `hasUnseen = true` bo'lganlar, ular ichida `lastCreatedAt` bo'yicha yangidan
eskiga. Avatarlar qatorini shu massivdan ketma-ket chizing.

`hasUnseen` — avatar atrofidagi halqa aynan shunga qarab yonadi.

Guruh ichidagi `stories` — **eskidan yangiga** (ko'rish tartibi).

---

## 3. `StoryDto`

```jsonc
{
  "id": "sty_01J…",
  "authorId": "std_01H…",
  "kind": "IMAGE",
  "url": "https://api.studentclub.uz/v1/media/med_…/raw",
  "thumbUrl": "https://api.studentclub.uz/v1/media/med_…/raw?variant=thumb",
  "width": 1080, "height": 1920,
  "durationMs": null,
  "caption": "Imtihon tugadi 🎓",
  "createdAt": "2026-07-31T08:14:22.531Z",
  "expiresAt": "2026-08-01T08:14:22.531Z",
  "seen": false,
  "viewsCount": null
}
```

| Maydon | Izoh |
|---|---|
| `url` / `thumbUrl` | **Token bilan** so'raladi — `Authorization: Bearer` shart. Oddiy `Image.load` ishlamaydi |
| `durationMs` | Video uchun. Rasm uchun `null` → o'zingiz 5 soniya ko'rsating |
| `seen` | **Siz** ko'rganmisiz. O'z story'ingizda doim `true` |
| `viewsCount` | **Faqat o'z story'ingizda** son. Boshqalarnikida `null` |

`viewsCount` boshqalarda `null` — ataylab: ko'rishlar soni orqali odamning tanishlar doirasi
o'lchanib qolmasligi uchun.

---

## 4. `POST /v1/stories/{id}/view`

Har lavha ochilganda chaqiring. **Idempotent** — bitta story'ni 5 marta ochsangiz `viewsCount`
1 ga oshadi. O'z story'ingizni ko'rish umuman hisoblanmaydi.

Javob tanasi yo'q (`result: null`). Xatosini ko'rsatmang — bu fon amali.

**Chegara: 120 so'rov/daqiqa.** Tez surib ko'rish normal, lekin ketma-ket 120 tadan oshsa 429.

---

## 5. `GET /v1/stories/mine`

Faol story'laringiz + **haqiqiy** `viewsCount`. Muddati o'tganlari qaytmaydi.

## 6. `GET /v1/stories/{id}/views`

**Faqat muallifga.** Boshqasiga `403`.

`?page=1&size=30` → `{ items: StudentSummaryDto[], page, size, total, hasNext }`, eng oxirgi
ko'rgan birinchi.

⚠️ **Bu ro'yxat `lastSeenVisibility` ga bo'ysunmaydi.** Story'ni ochgan odam o'zini ko'rsatgan
bo'ladi — presence yashirin bo'lsa ham bu yerda ko'rinadi. Foydalanuvchiga buni tushuntiring
(masalan, birinchi marta ochilganda kichik izoh).

## 7. `DELETE /v1/stories/{id}`

Faqat muallif. Javoblardan **darhol** yo'qoladi. Fayl 24 soatdan keyin server tomonda o'chadi
(kesh va CDN uchun) — lekin siz uni ko'rsatmaysiz.

Story **tahrirlanmaydi**. O'chirib, qaytadan qo'yiladi.

---

## 8. Cheklovlar

| | |
|---|---|
| Bir vaqtda faol | **10 ta** |
| Kuniga | **20 ta** (o'chirilganlar ham sanaladi) |
| Izoh | 200 belgi |
| Muddat | 24 soat, qat'iy |

Kunlik hisob o'chirilganlarni ham sanaydi — "qo'y-o'chir" bilan chetlab o'tib bo'lmaydi.

---

## 9. Push — **yuborilmaydi**

Siz so'raganingizdek, story uchun push yo'q. Lenta o'zi ko'rsatadi.

---

## 10. Xatolar

| Kod | HTTP | Nima qilish |
|---|---|---|
| `STORY_LIMIT_REACHED` | 422 | "10 tadan ko'p bo'lmaydi" / "kunlik chegara" |
| `STORY_NOT_FOUND` | 404 | Muddati o'tgan yoki o'chirilgan → lentadan olib tashlang |
| `STORY_FORBIDDEN` | 403 | Bog'lanmagan / bloklangan. `views` da — muallif emassiz |
| `MEDIA_NOT_READY` | 422 | Video hali transkod bo'lyapti → `media:ready` ni kuting |
| `MEDIA_ALREADY_USED` | 422 | Bu `mediaId` allaqachon ishlatilgan → qaytadan yuklang |
| `MEDIA_TOO_LONG` | 422 | Video 30 s dan uzun (yuklash bosqichida) |

**`404` ni jiddiy oling:** story har qanday vaqtda muddati o'tishi mumkin, shu jumladan
foydalanuvchi uni ochib turganda. Lentani yangilang, xato oynasi ko'rsatmang.

---

## 11. Nozik joylar

1. **Muddati o'tgan story hech qachon qaytmaydi.** Server har o'qishda `expiresAt > now()` shartini
   qo'yadi — tozalash joblari kechiksa ham. Ya'ni `expiresAt` ni klientda tekshirish shart emas,
   lekin ochiq turgan lentani vaqti-vaqti bilan yangilash foydali.

2. **Media URL'lari token talab qiladi.** `PROFILE_PHOTO` dan farqli, story medialarini faqat
   muallif va unga **bog'langan** odam o'qiy oladi. Havolani begonaga yuborish ishlamaydi.

3. **Bog'lanish uzilsa** — story lentadan darhol yo'qoladi va id bilan ochib ham bo'lmaydi.
