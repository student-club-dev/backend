# Chat: belgilash, tarix va sitata — backend javobi

`CHAT_SELECTION_AND_HISTORY_BACKEND.md` bo'yicha **A, B va C qismlari to'liq bajarildi**.

> **Kontrakt:** `docs/api/generated/student.json` (= `docs/handoff/mobile/student-api.json`) yangilandi.
> Kotlin klientini shu fayldan qayta generatsiya qiling.
> **WebSocket:** `docs/handoff/mobile/03-WEBSOCKET.md` — 3 ta yangi/o'zgargan hodisa.

---

## 0. Qisqacha — nima ulanishi mumkin

| Spec | Endpoint / maydon | Holat |
|---|---|---|
| §A2 | `POST /v1/messages/delete` | ✅ |
| §A2 | `DELETE /v1/messages/{id}?scope=` | ✅ |
| §A1 | `scope=ME` — serverda saqlanadi | ✅ |
| §A3 | WS `message:deleted` — bitta hodisa, butun paket | ✅ |
| §B1 | `DELETE /v1/conversations/{id}/history?scope=` | ✅ |
| §B1 | WS `history:cleared` | ✅ |
| §B1 | Fizik tozalash (haftalik) | ✅ |
| §B2 | `DELETE /v1/conversations/{id}?scope=` | ✅ |
| §B2 | WS `conversation:deleted` | ✅ |
| §C1 | `replyToMessageId` + `quote` — REST **va** WS | ✅ |
| §C2 | `MessageDto.replyTo` | ✅ |
| §C3 | `GET …/messages?around=` | ✅ |
| §D | 8 ta yangi xato kodi | ✅ |

Klient tomondagi vaqtinchalik yechimlarni (`MessageEntity.hiddenAt` ni faqat localda saqlash) endi
olib tashlashingiz mumkin — server holatni saqlaydi, qurilma almashsa ham yashiringan qoladi.

---

## 1. §A2 — `POST /v1/messages/delete`

```http
POST /v1/messages/delete
Authorization: Bearer <token>

{ "ids": ["clx…a", "clx…b"], "scope": "EVERYONE" }
```

| Maydon | Qoida |
|---|---|
| `ids` | 1–100 ta, takrorlanganlari birlashtiriladi, hammasi bitta suhbatdan |
| `scope` | `ME` \| `EVERYONE`, majburiy |

**Javob `200`**

```jsonc
{
  "success": true, "status": 200, "code": null, "message": "OK", "error": null,
  "result": {
    "conversationId": "clx…",
    "deleted": ["clx…a"],
    "skipped": [{ "id": "clx…b", "reason": "NOT_OWN" }],
    "unreadCount": 3,
    "lastMessage": { /* MessageDto yoki null */ }
  }
}
```

- Butun paket **bitta tranzaksiyada**. Yarim bajarilgan holat bo'lmaydi.
- `unreadCount` va `lastMessage` — **siz uchun** qayta hisoblangan. Ro'yxatni qayta so'ramang.
- Idempotent: takror chaqirsangiz yana `200`, raqamlar o'zgarmaydi.
- Bitta ham o'chmasa ham `200` (`deleted: []`) — bu natija, xato emas.

**`skipped.reason`:** `NOT_OWN` (`EVERYONE` da o'zganiki) · `NOT_FOUND` (bunday id yo'q) · `NOT_MEMBER`.

### Ikki `scope` orasidagi farq

| | `ME` | `EVERYONE` |
|---|---|---|
| Kimga ta'sir qiladi | faqat sizga, **barcha qurilmalaringizda** | ikkala a'zoga |
| Qaysi xabarga | **istalgan** — suhbatdoshniki ham | **faqat o'zingizniki** |
| Xabar qatori | tegilmaydi | `body` bo'shatiladi, `deletedAt` qo'yiladi |
| Suhbatdosh nima ko'radi | hech qanday o'zgarish yo'q | «Xabar o'chirildi» |

`ME` da xabar qatori umuman o'zgarmagani uchun u suhbatdoshning xabariga ham qo'llanadi.

---

## 2. §A2 — `DELETE /v1/messages/{id}` o'zgarmadi

```http
DELETE /v1/messages/{id}?scope=ME
```

**Javob shakli `MessageDto` bo'lib qoldi** — tarqatilgan klientlaringiz buzilmaydi. `scope`
tushirilsa `EVERYONE`, ya'ni bu route ilgari nima qilgan bo'lsa, aynan shuni qiladi: o'zganikini
o'chirmoqchi bo'lsangiz `403 FORBIDDEN`, noma'lum id ga `404`.

`scope=ME` — yagona yangi tarmoq. Xabar **o'zgarmagan holda** qaytadi (hech narsa mutatsiya
qilinmaydi), faqat endi u sizning tarixingizda ko'rinmaydi.

> Bir nechta xabar uchun `POST /v1/messages/delete` dan foydalaning — 50 ta so'rov o'rniga bitta.

---

## 3. §A3 — WS `message:deleted`

```json
{
  "conversationId": "clx…",
  "ids":   ["clx…a", "clx…b"],
  "seqs":  [141, 142],
  "scope": "EVERYONE",
  "deletedBy": "clx…user",

  "messageId": "clx…a",
  "seq": 141
}
```

**`ids` va `seqs` — parallel massivlar**, bir xil tartibda (so'rovdagi tartib, `seq` bo'yicha
saralanmagan). `zip` qilsangiz to'g'ri juftlik chiqadi.

⚠️ **Spec'da `id` deb yozgan edingiz, lekin ishlab turgan hodisada maydon nomi `messageId`.**
Bor nomni saqladik — orqaga moslik aynan shuni anglatadi. `messageId` = `ids[0]`, `seq` = `seqs[0]`.

**Auditoriya `scope` ga bog'liq:**

| `scope` | Kimga boradi |
|---|---|
| `EVERYONE` | ikkala a'zoning barcha qurilmalariga |
| `ME` | **faqat o'chirgan odamning** qurilmalariga |

`ME` da suhbatdoshga hodisa bormaydi — xabar uning ekranida turishi kerak. Sizning boshqa
qurilmalaringizga esa boradi: bu «faqat menda o'chirish» ni qayta o'rnatishdan omon qoladigan qiladi.

---

## 4. §B1 — tarixni tozalash

```http
DELETE /v1/conversations/{id}/history?scope=ME
```

```jsonc
{ "result": { "conversationId": "clx…", "clearedBeforeSeq": 812, "unreadCount": 0 } }
```

`seq <= clearedBeforeSeq` bo'lgan hamma narsani local keshdan o'chiring — server ularni boshqa
qaytarmaydi (`before`, `after`, `around` — hammasiga taalluqli).

- **Suhbat ro'yxatda qoladi**, `lastMessage` `null` bo'ladi.
- Tozalashdan keyingi xabarlar odatdagidek ko'rinadi — `seq` o'sishda davom etadi.
- Idempotent.

> ⚠️ **`scope` tushirilsa `ME`** — xabar o'chirishdagi `EVERYONE` default'idan **farqli**. Sabab: bu
> endpoint suhbatdoshning butun tarixini ham o'chira oladi, shuning uchun parametrsiz chaqiruv hech
> qachon buzuvchi variantga tushmasligi kerak.

**WS:** `history:cleared { conversationId, clearedBeforeSeq, scope, by }` — auditoriya yuqoridagidek.

### Fizik tozalash

Haftalik fon vazifasi **ikkala a'zo** tozalab o'tgan xabarlarni bazadan butunlay o'chiradi. Klient
uchun ko'rinmas — u qatorlarni allaqachon ko'rmayotgan edi.

---

## 5. §B2 — suhbatni o'chirish

```http
DELETE /v1/conversations/{id}?scope=ME
```

Javob `history` bilan bir xil shaklda. Suhbat ro'yxatingizdan yo'qoladi.

**Eng muhimi:** yangi xabar kelsa suhbat **o'sha `conversationId` bilan qaytadi**, faqat
o'chirgandan keyingi xabarlar bilan. `POST /v1/conversations` ham o'sha id ni qaytaradi, yangisini
yaratmaydi — ya'ni tarix ikkiga bo'linmaydi. Suhbatni local bazadan **o'chirmang**, faqat
ro'yxatdan yashiring.

`scope` tushirilsa — `ME`.

**WS:** `conversation:deleted { conversationId, scope, by }`.

---

## 6. §C — sitata bilan javob

### Yuborish (REST va WS — bir xil)

```jsonc
{
  "body": "ha, kelaman",
  "clientMsgId": "…",
  "replyToMessageId": "clx…A",
  "quote": { "text": "ertaga soat 10 da", "offset": 14 }
}
```

| Maydon | Qoida |
|---|---|
| `replyToMessageId` | **o'sha suhbatdagi** xabar bo'lishi shart, o'chirilmagan bo'lishi shart |
| `quote.text` | 1–300 belgi, nishon tanasining **haqiqiy bo'lagi** bo'lishi shart |
| `quote.offset` | UTF-16 kod birligida — Kotlin/Swift o'zi shunday sanaydi, konvertatsiya kerak emas |

Server `body.slice(offset, offset + text.length) === text` ni tekshiradi. Mos kelmasa `422`.
Media xabarga javob berish mumkin, lekin `quote` bo'lmaydi (kesib olinadigan matn yo'q).

### Qaytish — `MessageDto.replyTo`

```jsonc
"replyTo": {
  "id": "clx…A",
  "seq": 141,
  "senderId": "clx…user",
  "senderName": "Kumushim",
  "type": "TEXT",
  "preview": "ertaga soat 10 da uchrashamizmi",
  "quote": { "text": "ertaga soat 10 da", "offset": 14 },
  "originalDeleted": false
}
```

- **Bu snapshot — o'zgarmas.** Nishon keyin o'chirilsa ham `preview` va `quote` o'z joyida qoladi.
- `senderName` tayyor keladi — id bo'yicha qidirmang.
- `preview` ≤120 belgi; media bo'lsa `null`, `type` bo'yicha «📷 Rasm» deb chizing.
- `originalDeleted: true` → sitatani ko'rsatishda davom eting, lekin **sakrash tugmasini olib
  tashlang**. `id` ham `null` bo'lishi mumkin (xabar butunlay tozalangan).
- Xuddi shu maydon WS `message:new` da ham keladi.

### §C3 — sitatani bosganda sakrash

```http
GET /v1/conversations/{id}/messages?around=141&size=50
```

`seq = 141` atrofidan taxminan yarmi pastdan, qolgani o'sha xabardan yuqoriga. Yashiringan va
tozalangan qatorlar oynaning joyini egallamaydi — so'ragan `size` ni to'liq olasiz.

- `before` / `after` bilan **birga kelmasin** → `422`.
- `hasMore` — oynadan **pastda** yana eski xabarlar bormi (sakrashdan keyin siz o'sha tomonga
  scroll qilasiz).

> ⚠️ Spec'da `limit=50` deb yozgan edingiz — bizda parametr nomi **`size`**, chunki loyihadagi
> barcha ro'yxatlar shu nom bilan sahifalanadi.

---

## 7. Xato kodlari

| Kod | HTTP | Qachon |
|---|---|---|
| `NOT_MEMBER` | 403 | So'rovchi suhbat a'zosi emas |
| `TOO_MANY_IDS` | 422 | `ids.length > 100` |
| `MIXED_CONVERSATIONS` | 422 | `ids` turli suhbatlardan |
| `MESSAGE_NOT_FOUND` | 404 | **Birorta ham** id topilmadi |
| `REPLY_TARGET_NOT_FOUND` | 422 | Nishon boshqa suhbatda yoki yo'q |
| `REPLY_TARGET_DELETED` | 422 | Nishon o'chirilgan |
| `QUOTE_NOT_FOUND` | 422 | `quote.text` nishon tanasida o'sha `offset` da yo'q |
| `QUOTE_TOO_LONG` | 422 | `quote.text` > 300 belgi |
| `QUOTE_WITHOUT_REPLY` | 422 | `quote` bor, `replyToMessageId` yo'q |
| `CONVERSATION_NOT_FOUND` | 404 | Tarix tozalash / suhbat o'chirishda a'zo emassiz |

`NOT_OWN` — HTTP status emas, faqat `skipped.reason` qiymati.

---

## 8. Spec'dan chekinishlar — hammasi, sababi bilan

| # | Spec'da | Bizda | Nega |
|---|---|---|---|
| 1 | `?around=…&limit=50` | `?around=…&size=50` | Loyihadagi barcha ro'yxatlar `size` bilan sahifalanadi; bitta endpointda `limit` kiritish kontraktni bo'lardi |
| 2 | WS `message:deleted` da `{ id, seq }` saqlansin | `{ messageId, seq }` saqlandi | Ishlab turgan hodisada maydon nomi `messageId`. Orqaga moslik — **bor** nomni saqlash |
| 3 | `DELETE /v1/messages/{id}` javobi | `MessageDto` bo'lib **qoldi** | Spec «bugungi xatti-harakat o'zgarmaydi» deydi. Uni `BulkDeleteResultDto` ga o'tkazish tarqatilgan klientlarni buzardi |
| 4 | `NOT_MEMBER` → 403 | 403 (spec'dagidek) | Lekin eski `DELETE /v1/messages/{id}` a'zo bo'lmaganga **404** qaytaradi va shundayligicha qoldi. Sabab: u bitta id ni ko'r-ko'rona qabul qiladi; batch endpoint'ga yetib borish uchun esa sizda allaqachon haqiqiy id bo'lishi kerak |
| 5 | `uuid`, `REFERENCES users(id)` | `cuid`, `students(id)` | Chatda faqat talabalar bor; `users` jadvali yo'q |
| 6 | `message_hidden(user_id, message_id)` indeksi | Tashlab yuborildi, o'rniga `(message_id)` | Spec'dagi indeks birlamchi kalitni aynan takrorlaydi — planner uni hech qachon tanlamaydi. Teskari yo'nalish esa kerak edi |
| 7 | «Bitta ham id o'chmasa `200`» | `200`, lekin **birorta ham id topilmasa** `404` | `200` javobi `conversationId`, `unreadCount`, `lastMessage` ni talab qiladi — hech narsa topilmasa, ular qaysi suhbatniki? Spec bu holatni belgilamagan |
| 8 | `QUOTE_TOO_LONG` | Domain darajasida tekshiriladi | DTO validatsiyasi qo'ysak REST `VALIDATION_ERROR`, WS esa `QUOTE_TOO_LONG` qaytarardi — bir xil kirish, ikki xil kod |

---

## 9. §A4 — invariantlar bajarildi

Bular spec'da «har bir qadamning sharti» deb belgilangan edi:

- **`seq` qayta sanalmaydi.** O'chirish qatorni yo'q qilmaydi; tarix tozalash suv belgisi
  ko'taradi, xolos. Fizik tozalash faqat **ikkala** a'zo o'tib ketgan qatorlarni oladi — ya'ni hech
  kimning kursori teshikka tushmaydi.
- **Tartib deterministik:** `ORDER BY seq, created_at, id` — barcha ro'yxatlarda bir xil.
- **Filtr `LIMIT` ning ichida.** Yashiringan va tozalangan qatorlar SQL'ning `WHERE` qismida
  chiqariladi. `hasMore` ham filtrlangan to'plam bo'yicha (`LIMIT + 1` usuli).
- **Ko'p o'chirish — bitta tranzaksiya**, bitta qayta hisob, bitta WS hodisasi.
- **Ro'yxatdagi `lastMessage`** so'rovchi ko'radigan eng oxirgi xabardan quriladi. Ikki a'zo turli
  oxirgi xabarni ko'rishi mumkin — bu `scope = ME` ning to'g'ri natijasi.

### Qabul mezonlari — qaysi test qoplaydi

Hammasi `test/chat.e2e-spec.ts` da, haqiqiy baza bilan:

| Mezon | Test |
|---|---|
| 1. `EVERYONE` — uzunlik va `seq` o'zgarmaydi | `1. EVERYONE keeps the list length and every seq position, on both sides` |
| 2. `ME` — so'rovchida qisqaradi, suhbatdoshda qoladi | `2. ME shortens the requester's history and leaves the peer's untouched` |
| 3. `?before=` bilan sahifalash — teshik/dublikat yo'q | `3. paging with ?before= returns every visible message once` |
| 4. Tozalashdan keyingi yangi xabar | `4. after clearing, a new message stands alone for me and the peer keeps everything` |
| 5. Badge 5→2, manfiyga ketmaydi, idempotent | `5. the badge drops by what was deleted, never below zero, and is idempotent` |

Jami: **927 unit + 140 e2e test**, hammasi yashil.

---

## 10. Bilib qo'yishingiz kerak bo'lgan bitta narsa

**Xabarni o'chirish endi uning matnini to'liq yo'q qilmaydi.**

Kimdir sizning xabaringizdan sitata olgan bo'lsa, siz o'chirganingizdan keyin ham o'sha sitata va
`preview` javob xabarida qoladi (`originalDeleted: true` bo'ladi, matn esa turaveradi).

Bu §C2 ning ataylab talabi va Telegram ham shunday ishlaydi. Lekin foydalanuvchi «o'chirdim» deb
o'ylashi, matn esa boshqa joyda turishi mumkin — mahsulot qarori sifatida bilib turing. Kerak
bo'lsa, o'chirishda unga bog'langan sitatalarni ham tozalaydigan qilib o'zgartirsak bo'ladi.

---

## 11. Klient tomonda nima ulanadi

| Backend | Klient qadami |
|---|---|
| `POST /v1/messages/delete` | `ChatRepository.deleteMessages` ichidagi siklni olib tashlang |
| `scope=ME` | `MessageEntity.hiddenAt` ni **serverdan** to'ldiring — qurilma almashganda yashiringan qoladi |
| `DELETE …/history` | Suhbat menyusiga «Tarixni tozalash» qo'shing (`clearedBeforeSeq` + `selectMessages` filtri) |
| `DELETE /v1/conversations/{id}` | Ro'yxatdagi surish menyusiga «O'chirish» |
| `replyTo` + `quote` | Sitata paneli, pufakdagi sitata bloki, bosilganda sakrash |
| `?around=` | Sitatani bosganda tarixning o'rtasiga sakrash |

Savol bo'lsa yozing — ayniqsa 8-bo'limdagi chekinishlar bo'yicha, ular kontraktga bevosita ta'sir
qiladi.
