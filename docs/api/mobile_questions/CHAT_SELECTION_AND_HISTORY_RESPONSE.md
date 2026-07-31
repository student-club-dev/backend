# Chat: belgilash, tarix va sitata — backend javobi

`CHAT_SELECTION_AND_HISTORY_BACKEND.md` bo'yicha **A, B va C qismlari to'liq bajarildi**.

Bu hujjat **o'zi-yetarli** — REST, WebSocket, xato kodlari, chekinishlar, hammasi shu yerda.

> ### Sizga ikkita narsa kerak
>
> 1. **Shu fayl** — nima o'zgargani, nega, va klientda nima ulanishi.
> 2. **`student-api.json`** — OpenAPI kontrakti, Kotlin klientini shundan generatsiya qilasiz.
>    (Repoda: `docs/handoff/mobile/student-api.json`, `docs/api/generated/student.json` bilan
>    bayt-ma-bayt bir xil.)
>
> Boshqa hujjat kerak emas. WebSocket qismi Swagger'ga sig'maydi, shuning uchun 4-bo'limda to'liq
> yozilgan.

---

## Mundarija

1. [Qisqacha — nima ulanishi mumkin](#1-qisqacha--nima-ulanishi-mumkin)
2. [§A — ko'p xabarni belgilab o'chirish](#2-a--kop-xabarni-belgilab-ochirish)
3. [§B — tarixni tozalash va suhbatni o'chirish](#3-b--tarixni-tozalash-va-suhbatni-ochirish)
4. [WebSocket hodisalari](#4-websocket-hodisalari)
5. [§C — sitata bilan javob](#5-c--sitata-bilan-javob)
6. [Xato kodlari](#6-xato-kodlari)
7. [Spec'dan chekinishlar](#7-specdan-chekinishlar--hammasi-sababi-bilan)
8. [§A4 invariantlari va qabul mezonlari](#8-a4--invariantlar-va-qabul-mezonlari)
9. [Bilib qo'yishingiz kerak bo'lgan narsa](#9-bilib-qoyishingiz-kerak-bolgan-bitta-narsa)
10. [Klient tomonda nima ulanadi](#10-klient-tomonda-nima-ulanadi)

---

## 1. Qisqacha — nima ulanishi mumkin

| Spec | Endpoint / maydon | Holat |
|---|---|---|
| §A2 | `POST /v1/messages/delete` | ✅ |
| §A2 | `DELETE /v1/messages/{id}?scope=` | ✅ |
| §A1 | `scope=ME` — **serverda** saqlanadi | ✅ |
| §A3 | WS `message:deleted` — bitta hodisa, butun paket | ✅ |
| §B1 | `DELETE /v1/conversations/{id}/history?scope=` | ✅ |
| §B1 | WS `history:cleared` | ✅ |
| §B1 | Fizik tozalash (haftalik fon vazifasi) | ✅ |
| §B2 | `DELETE /v1/conversations/{id}?scope=` | ✅ |
| §B2 | WS `conversation:deleted` | ✅ |
| §C1 | `replyToMessageId` + `quote` — REST **va** WS | ✅ |
| §C2 | `MessageDto.replyTo` | ✅ |
| §C3 | `GET …/messages?around=` | ✅ |
| §D | 8 ta yangi xato kodi | ✅ |

Klientdagi vaqtinchalik yechimlarni (`MessageEntity.hiddenAt` ni faqat localda saqlash) endi olib
tashlashingiz mumkin — server holatni saqlaydi, qurilma almashsa yoki ilova qayta o'rnatilsa ham
yashiringan xabarlar yashiringanicha qoladi.

---

## 2. §A — ko'p xabarni belgilab o'chirish

### 2.1. `POST /v1/messages/delete`

```http
POST /v1/messages/delete
Authorization: Bearer <token>
Content-Type: application/json

{ "ids": ["clx…a", "clx…b"], "scope": "EVERYONE" }
```

| Maydon | Qoida |
|---|---|
| `ids` | 1–100 ta, takrorlanganlari birlashtiriladi, hammasi **bitta** suhbatdan |
| `scope` | `ME` \| `EVERYONE`, **majburiy** |

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

- Butun paket **bitta tranzaksiyada** — yarim bajarilgan holat bo'lmaydi.
- `unreadCount` va `lastMessage` — **siz uchun** qayta hisoblangan. Ro'yxatni qayta so'ramang.
- **Idempotent**: takror chaqirsangiz yana `200`, raqamlar o'zgarmaydi.
- Bitta ham o'chmasa ham `200` (`deleted: []`) — bu natija, xato emas.
- Vaqt chegarasi **yo'q** — istalgan eski xabarni o'chirsa bo'ladi.

`skipped.reason`: `NOT_OWN` (`EVERYONE` da o'zganiki) · `NOT_FOUND` (bunday id yo'q) · `NOT_MEMBER`.

### 2.2. Ikki `scope` orasidagi farq

| | `ME` | `EVERYONE` |
|---|---|---|
| Kimga ta'sir qiladi | faqat sizga, **barcha qurilmalaringizda** | ikkala a'zoga |
| Qaysi xabarga qo'llanadi | **istalgan** — suhbatdoshniki ham | **faqat o'zingizniki** |
| Xabar qatori | tegilmaydi | `body` bo'shatiladi, `deletedAt` qo'yiladi |
| Suhbatdosh nima ko'radi | **hech qanday o'zgarish yo'q** | «Xabar o'chirildi» tombstone |
| `seq` | o'zgarmaydi | o'zgarmaydi |

`ME` da xabar qatori umuman mutatsiya qilinmagani uchun u suhbatdoshning xabariga ham qo'llanadi.

### 2.3. `DELETE /v1/messages/{id}` — **o'zgarmadi**

```http
DELETE /v1/messages/{id}?scope=ME
```

**Javob shakli `MessageDto` bo'lib qoldi** — tarqatilgan klientlaringiz buzilmaydi.

`scope` tushirilsa `EVERYONE`, ya'ni bu route ilgari nima qilgan bo'lsa, aynan shuni qiladi:
o'zganikini o'chirmoqchi bo'lsangiz `403 FORBIDDEN`, noma'lum id ga `404`.

`scope=ME` — yagona yangi tarmoq. Xabar **o'zgarmagan holda** qaytadi (hech narsa mutatsiya
qilinmaydi), faqat endi u sizning tarixingizda ko'rinmaydi.

> Bir nechta xabar uchun `POST /v1/messages/delete` dan foydalaning — 50 ta so'rov o'rniga bitta.

---

## 3. §B — tarixni tozalash va suhbatni o'chirish

### 3.1. `DELETE /v1/conversations/{id}/history?scope=`

```jsonc
{ "result": { "conversationId": "clx…", "clearedBeforeSeq": 812, "unreadCount": 0 } }
```

`seq <= clearedBeforeSeq` bo'lgan hamma narsani local keshdan o'chiring — server ularni boshqa
qaytarmaydi (`before`, `after`, `around` — **hammasiga** taalluqli).

- **Suhbat ro'yxatda qoladi**, `lastMessage` `null` bo'ladi.
- Tozalashdan keyingi xabarlar odatdagidek ko'rinadi — `seq` o'sishda davom etadi.
- Idempotent.

### 3.2. `DELETE /v1/conversations/{id}?scope=`

Javob 3.1 bilan bir xil shaklda. Suhbat ro'yxatingizdan yo'qoladi.

**Eng muhimi:** yangi xabar kelsa suhbat **o'sha `conversationId` bilan qaytadi**, faqat
o'chirgandan keyingi xabarlar bilan. `POST /v1/conversations` ham o'sha id ni qaytaradi, yangisini
yaratmaydi — ya'ni tarix ikkiga bo'linmaydi.

**Suhbatni local bazadan o'chirmang**, faqat ro'yxatdan yashiring.

### 3.3. ⚠️ `scope` ning sukut qiymati bu yerda boshqacha

| Endpoint | `scope` tushirilsa |
|---|---|
| `DELETE /v1/messages/{id}` | **`EVERYONE`** |
| `DELETE /v1/conversations/{id}/history` | **`ME`** |
| `DELETE /v1/conversations/{id}` | **`ME`** |

Sabab: oxirgi ikkitasi suhbatdoshning **butun tarixini** o'chira oladi, shuning uchun parametrsiz
chaqiruv hech qachon buzuvchi variantga tushmasligi kerak. Xabar o'chirishda esa `EVERYONE` —
o'sha route ilgari nima qilgan bo'lsa, shuni saqlash uchun.

### 3.4. Fizik tozalash

Haftalik fon vazifasi **ikkala a'zo** tozalab o'tgan xabarlarni bazadan butunlay o'chiradi. Klient
uchun ko'rinmas — u qatorlarni allaqachon ko'rmayotgan edi. Ta'sir qiladigan yagona narsa:
`replyTo.id` `null` bo'lib qolishi mumkin (5.2 ga qarang).

---

## 4. WebSocket hodisalari

Namespace **`/chat`**, Socket.IO (Engine.IO v4). Handshake: `auth = { "token": accessToken }`.

### 4.1. `message:deleted` — endi bitta hodisa, butun paket uchun

50 ta xabar belgilanib o'chirilganda 50 ta hodisa emas, **bitta** hodisa keladi:

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
Yangi kod `ids`/`seqs` ni o'qisin.

### 4.2. `history:cleared`

```json
{ "conversationId": "clx…", "clearedBeforeSeq": 812, "scope": "ME", "by": "clx…user" }
```

### 4.3. `conversation:deleted`

```json
{ "conversationId": "clx…", "scope": "ME", "by": "clx…user" }
```

Suhbatni ro'yxatdan olib tashlang. **Bazadan o'chirmang** — keyinroq o'sha `conversationId` bilan
`message:new` kelsa, suhbat qaytadi.

### 4.4. ⚠️ Auditoriya qoidasi — uchala hodisaga ham

| `scope` | Kimga boradi |
|---|---|
| `EVERYONE` | **ikkala** a'zoning barcha qurilmalariga |
| `ME` | **faqat amalni bajargan odamning** qurilmalariga |

`ME` da suhbatdoshga hodisa **bormaydi** — u tegishli narsani ko'rmoqda va ko'rishi kerak. Sizning
boshqa qurilmalaringizga esa boradi: aynan shu narsa «faqat menda o'chirish» ni qayta o'rnatishdan
va ikkinchi telefondan omon qoladigan qiladi.

### 4.5. `message:send` — sitata maydonlari qo'shildi

```json
{
  "conversationId": "clx…",
  "clientMsgId": "…",
  "body": "ha, kelaman",
  "replyToMessageId": "clx…A",
  "quote": { "text": "ertaga soat 10 da", "offset": 14 }
}
```

Validatsiya REST bilan **aynan bir xil** — WS orqali yuborish tekshiruvni chetlab o'tish yo'li emas.
Rad etilganda odatdagi `{ status: "error", error: { code, message } }` qaytadi.

Javob `message:new` da `message.replyTo` bilan keladi — REST'dagi `MessageDto` bilan bir xil shakl.

---

## 5. §C — sitata bilan javob

### 5.1. Yuborish (REST va WS — bir xil)

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
| `quote.offset` | **UTF-16 kod birligida** — Kotlin/Swift o'zi shunday sanaydi, konvertatsiya kerak emas |

Server `body.slice(offset, offset + text.length) === text` ni tekshiradi. Mos kelmasa `422`.

Media xabarga javob berish mumkin (`replyToMessageId`), lekin `quote` bo'lmaydi — kesib olinadigan
matn yo'q.

### 5.2. Qaytish — `MessageDto.replyTo`

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
  tashlang**. `id` ham `null` bo'lishi mumkin (xabar fizik tozalangan).

### 5.3. `?around=` — sitatani bosganda sakrash

```http
GET /v1/conversations/{id}/messages?around=141&size=50
```

`seq = 141` atrofidan taxminan yarmi pastdan, qolgani o'sha xabardan yuqoriga. Yashiringan va
tozalangan qatorlar oynaning joyini **egallamaydi** — so'ragan `size` ni to'liq olasiz.

- `before` / `after` bilan **birga kelmasin** → `422`.
- `hasMore` — oynadan **pastda** yana eski xabarlar bormi (sakrashdan keyin siz o'sha tomonga
  scroll qilasiz).

> ⚠️ Spec'da `limit=50` deb yozgan edingiz — bizda parametr nomi **`size`**, chunki loyihadagi
> barcha ro'yxatlar shu nom bilan sahifalanadi.

---

## 6. Xato kodlari

| Kod | HTTP | Qachon |
|---|---|---|
| `NOT_MEMBER` | 403 | So'rovchi suhbat a'zosi emas (`POST /v1/messages/delete`) |
| `TOO_MANY_IDS` | 422 | `ids.length > 100` |
| `MIXED_CONVERSATIONS` | 422 | `ids` turli suhbatlardan |
| `MESSAGE_NOT_FOUND` | 404 | **Birorta ham** id topilmadi |
| `REPLY_TARGET_NOT_FOUND` | 422 | Nishon boshqa suhbatda yoki yo'q |
| `REPLY_TARGET_DELETED` | 422 | Nishon o'chirilgan |
| `QUOTE_NOT_FOUND` | 422 | `quote.text` nishon tanasida o'sha `offset` da yo'q |
| `QUOTE_TOO_LONG` | 422 | `quote.text` > 300 belgi |
| `QUOTE_WITHOUT_REPLY` | 422 | `quote` bor, `replyToMessageId` yo'q |
| `CONVERSATION_NOT_FOUND` | 404 | Tarix tozalash / suhbat o'chirishda a'zo emassiz |

`NOT_OWN` — HTTP status **emas**, faqat `skipped.reason` qiymati.

Barcha xatolar odatdagi `BaseResponse` konvertida keladi; WS'da esa
`{ status: "error", error: { code, message } }` — kodlar to'plami ikkalasida bir xil.

---

## 7. Spec'dan chekinishlar — hammasi, sababi bilan

| # | Spec'da | Bizda | Nega |
|---|---|---|---|
| 1 | `?around=…&limit=50` | `?around=…&size=50` | Loyihadagi barcha ro'yxatlar `size` bilan sahifalanadi; bitta endpointda `limit` kiritish kontraktni bo'lardi |
| 2 | WS `message:deleted` da `{ id, seq }` saqlansin | `{ messageId, seq }` saqlandi | Ishlab turgan hodisada maydon nomi `messageId`. Orqaga moslik — **bor** nomni saqlash |
| 3 | `DELETE /v1/messages/{id}` javobi | `MessageDto` bo'lib **qoldi** | Spec «bugungi xatti-harakat o'zgarmaydi» deydi. `BulkDeleteResultDto` ga o'tkazish tarqatilgan klientlarni buzardi |
| 4 | `NOT_MEMBER` → 403 | 403 (spec'dagidek) | Lekin eski `DELETE /v1/messages/{id}` a'zo bo'lmaganga **404** qaytaradi va shundayligicha qoldi — u bitta id ni ko'r-ko'rona qabul qiladi, batch endpoint'ga yetib borish uchun esa sizda allaqachon haqiqiy id bo'lishi kerak |
| 5 | `uuid`, `REFERENCES users(id)` | `cuid`, `students(id)` | Chatda faqat talabalar bor; `users` jadvali yo'q |
| 6 | `message_hidden(user_id, message_id)` indeksi | Tashlab yuborildi, o'rniga `(message_id)` | Spec'dagi indeks birlamchi kalitni aynan takrorlaydi — planner uni hech qachon tanlamaydi. Teskari yo'nalish esa kerak edi |
| 7 | «Bitta ham id o'chmasa `200`» | `200`, lekin **birorta ham id topilmasa** `404` | `200` javobi `conversationId`, `unreadCount`, `lastMessage` ni talab qiladi — hech narsa topilmasa, ular qaysi suhbatniki? Spec bu holatni belgilamagan |
| 8 | `QUOTE_TOO_LONG` | Domain darajasida tekshiriladi | DTO validatsiyasi qo'ysak REST `VALIDATION_ERROR`, WS esa `QUOTE_TOO_LONG` qaytarardi — bir xil kirish, ikki xil kod |

---

## 8. §A4 — invariantlar va qabul mezonlari

Bular spec'da «har bir qadamning sharti» deb belgilangan edi:

- **`seq` qayta sanalmaydi.** O'chirish qatorni yo'q qilmaydi; tarix tozalash suv belgisi
  ko'taradi, xolos. Fizik tozalash faqat **ikkala** a'zo o'tib ketgan qatorlarni oladi — ya'ni hech
  kimning kursori teshikka tushmaydi.
- **Tartib deterministik:** `ORDER BY seq, created_at, id` — barcha ro'yxatlarda bir xil.
- **Filtr `LIMIT` ning ichida.** Yashiringan va tozalangan qatorlar SQL'ning `WHERE` qismida
  chiqariladi, `LIMIT` dan keyin emas. `hasMore` ham filtrlangan to'plam bo'yicha (`LIMIT + 1`).
- **Ko'p o'chirish — bitta tranzaksiya**, bitta qayta hisob, bitta WS hodisasi.
- **Ro'yxatdagi `lastMessage`** so'rovchi ko'radigan eng oxirgi xabardan quriladi. Ikki a'zo turli
  oxirgi xabarni ko'rishi mumkin — bu `scope = ME` ning to'g'ri natijasi, xato emas.

### Qabul mezonlari — qaysi test qoplaydi

Hammasi `test/chat.e2e-spec.ts` da, haqiqiy baza bilan:

| Mezon | Test nomi |
|---|---|
| 1. `EVERYONE` — uzunlik va `seq` o'zgarmaydi | `1. EVERYONE keeps the list length and every seq position, on both sides` |
| 2. `ME` — so'rovchida qisqaradi, suhbatdoshda qoladi | `2. ME shortens the requester's history and leaves the peer's untouched` |
| 3. `?before=` bilan sahifalash — teshik/dublikat yo'q | `3. paging with ?before= returns every visible message once` |
| 4. Tozalashdan keyingi yangi xabar | `4. after clearing, a new message stands alone for me and the peer keeps everything` |
| 5. Badge 5→2, manfiyga ketmaydi, idempotent | `5. the badge drops by what was deleted, never below zero, and is idempotent` |

Jami: **927 unit + 140 e2e test**, hammasi yashil.

---

## 9. Bilib qo'yishingiz kerak bo'lgan bitta narsa

**Xabarni o'chirish endi uning matnini to'liq yo'q qilmaydi.**

Kimdir sizning xabaringizdan sitata olgan bo'lsa, siz o'chirganingizdan keyin ham o'sha sitata va
`preview` javob xabarida qoladi (`originalDeleted: true` bo'ladi, matn esa turaveradi).

Bu §C2 ning ataylab talabi va Telegram ham shunday ishlaydi. **Qaror qilindi: shundayligicha
qoladi.** Ya'ni klientda alohida ishlov kerak emas — `originalDeleted: true` bo'lganda sitatani
ko'rsatishda davom eting, faqat sakrash tugmasini olib tashlang.

Bilib turishingiz uchun aytamiz: foydalanuvchi «o'chirdim» deb o'ylashi, matn esa javob pufagida
turishi mumkin. Agar kelajakda mahsulot bo'yicha fikr o'zgarsa, o'chirishda bog'langan sitatalarni
ham tozalaydigan qilish mumkin — lekin u holda kontrakt o'zgaradi va sizga aytamiz.

---

## 10. Klient tomonda nima ulanadi

| Backend | Klient qadami |
|---|---|
| `POST /v1/messages/delete` | `ChatRepository.deleteMessages(ids, forEveryone)` ichidagi siklni olib tashlang — N ta so'rov o'rniga bitta |
| `scope=ME` | `MessageEntity.hiddenAt` ni **serverdan** to'ldiring; qurilma almashganda yashiringan qoladi |
| WS `message:deleted` | Bitta hodisada `ids` massivini qayta ishlang, `scope=ME` bo'lsa faqat o'zingizda yashiring |
| `DELETE …/history` | Suhbat menyusiga «Tarixni tozalash» (`clearedBeforeSeq` + `selectMessages` filtri) |
| `DELETE /v1/conversations/{id}` | Ro'yxatdagi surish menyusiga «O'chirish» — local bazadan o'chirmang, yashiring |
| `replyTo` + `quote` | Matnni belgilash oynasiga «Sitata qilib javob berish», kompozitorda sitata paneli, pufakda sitata bloki |
| `?around=` | Sitatani bosganda tarixning o'rtasiga sakrash |

Savol bo'lsa yozing — ayniqsa **7-bo'limdagi chekinishlar** bo'yicha, ular kontraktga bevosita
ta'sir qiladi.
