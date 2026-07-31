# Chat: xabarlarni belgilash, o'chirish, tarixni tozalash va sitata — Backend spetsifikatsiyasi

Bu hujjat **Student Club** chatini Telegram darajasiga yetkazish uchun backendda nima
qilinishi kerakligini tavsiflaydi. Uchta blok:

- **A qism — Ko'p xabarni belgilab o'chirish.** Foydalanuvchi xabarlarni bosib-surib
  belgilaydi va bir zarbada o'chiradi; o'chirishda **«men uchun»** yoki **«ikkalamiz uchun»**
  tanlovi bo'ladi (Telegram'dagi «Kumushim uchun ham o'chirilsin» katagi).
- **B qism — Tarixni tozalash va suhbatni o'chirish.** Suhbat menyusidagi «Tarixni tozalash»
  tugmasi; xuddi Telegram'dagidek — o'zim uchun yoki ikkalamiz uchun.
- **C qism — Sitata bilan javob (reply/quote).** Xabarning **bir gapini belgilab** unga javob
  yozish; pufak ustida sitata ko'rinadi.

Yakuniy API kontrakti — `dev/api-client-generator/student-club.json` (OpenAPI v1).
**U yagona manba**: Kotlin klienti o'sha yerdan generatsiya qilinadi, shuning uchun bu
hujjatdagi har bir model/endpoint spec'ga qo'shilishi shart. WebSocket hodisalari Swagger'ga
sig'maydi — ular `handoff/03-WEBSOCKET.md` ga yoziladi.

Klient: Kotlin Multiplatform (Android + iOS), Ktor, Socket.IO (Engine.IO v4), local kesh —
SQLDelight (offline-first: ekran **faqat keshni** o'qiydi, REST/WS uni to'ldiradi).

---

## 0. Hozirgi holat

| Imkoniyat | Holat bugun |
|---|---|
| `DELETE /v1/messages/{id}` — bitta xabar, soft delete | ✅ ishlaydi, lekin **doim ikkala tomon uchun** |
| Bir nechta xabarni o'chirish | ❌ yo'q — klient sikl bilan N ta so'rov yuboradi |
| «Faqat men uchun o'chirish» | ❌ yo'q |
| Tarixni tozalash | ❌ yo'q |
| Suhbatni o'chirish | ❌ yo'q (arxivlash ham **faqat local** bayroq) |
| Javob berish (reply) / sitata (quote) | ❌ yo'q |
| Xabarga «sakrash» (`?around=`) | ❌ yo'q — faqat `before` / `after` |

**Klient hozir nima qilyapti** (bu hujjat amalga oshgunicha):

- Ko'p tanlash va o'chirish **ishlaydi**: «ikkalamiz uchun» — mavjud `DELETE /v1/messages/{id}`
  ni har bir tanlangan xabar uchun chaqiradi.
- «Faqat men uchun» — **local keshda yashirish** (`MessageEntity.hiddenAt`). Bu vaqtinchalik
  yechim va uning kamchiligi ochiq: ilova qayta o'rnatilsa yoki foydalanuvchi boshqa
  qurilmaga kirsa, yashirilgan xabarlar **qaytib keladi**.
- Tarixni tozalash tugmasi **hali qo'yilmadi** — u faqat local bo'lsa yolg'on va'da bo'lardi
  (server keyingi `loadLatest` da hamma narsani qaytarib beradi).
- Sitata bilan javob **yo'q** — kontrakt bo'lmagani uchun.

Ya'ni §A ning yarmi, §B va §C to'liq **serverga bog'liq**.

### ⚠️ O'zgarmas qoidalar

1. **`seq` ga tegilmasin.** `seq` — suhbatning tartib o'qi va o'qildi/yetkazildi
   kursorlarining asosi. O'chirish qatorni yo'q qilmaydi: hozirgidek soft delete
   (`deletedAt` + bo'sh tana) qoladi. Tarix tozalanganda ham `seq` **qayta sanalmaydi**.
2. **`body` string bo'lib qolsin.** Sitata `body` ichiga solinmasin — u uchun alohida
   `replyTo` maydoni.
3. **Barcha yangi maydonlar nullable/ixtiyoriy.** Eski klient yangi maydonlarni ko'rmasa ham
   ishlashda davom etsin.
4. **Idempotentlik.** O'chirish va tozalash takror chaqirilsa `200` qaytsin, `404` emas.

---

# A QISM — KO'P XABARNI BELGILAB O'CHIRISH

## A1. O'chirish qamrovi (scope)

Telegram modeli:

| Qamrov | Kim uchun yo'qoladi | Kimning xabariga qo'llanadi |
|---|---|---|
| `ME` | faqat so'rovchi (uning **hamma qurilmalarida**) | **istalgan** xabar — o'ziniki ham, suhbatdoshniki ham |
| `EVERYONE` | ikkala a'zoda ham | **faqat o'z** xabari |

`EVERYONE` da hozirgi xatti-harakat saqlanadi: qator qoladi, tanasi bo'shatiladi,
`deletedAt` to'ldiriladi, ikkala a'zoga `message:deleted` ketadi, xabar o'qilmaganlar
sanog'idan chiqadi.

`ME` da esa **qator ham, `seq` ham tegilmaydi** — faqat so'rovchi uchun ko'rinmas bo'ladi:

```sql
CREATE TABLE message_hidden (
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id  uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    hidden_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, message_id)
);
CREATE INDEX message_hidden_user_idx ON message_hidden(user_id, message_id);
```

Yashirilgan xabar:

- `GET /v1/conversations/{id}/messages` javobiga **tushmaydi** (so'rovchi uchun);
- `GET /v1/conversations` dagi `lastMessage` ga **tushmaydi** — ko'rinish so'rovchi uchun
  ko'rinadigan eng oxirgi xabardan qurilsin, hech nima qolmasa `null`;
- o'qilmaganlar sanog'idan **chiqadi** (ko'rinmaydigan xabarni o'qib bo'lmaydi — busiz badge
  abadiy yonib turadi, bu xatoni chat allaqachon boshdan kechirgan);
- **suhbatdoshda o'z joyida qoladi** — u hech narsani sezmaydi.

## A2. `POST /v1/messages/delete` — ko'p xabarni bir zarbada

Belgilash rejimida 50 ta xabar tanlanadi va hozircha bu 50 ta HTTP so'rov degani: yarmi
o'tib, yarmi yiqilsa ekran ham, sanoq ham buziladi. Kerak — **bitta tranzaksiya**.

**So'rov**

```http
POST /v1/messages/delete
Authorization: Bearer <token>
Content-Type: application/json

{
  "ids":   ["01J...A", "01J...B", "01J...C"],
  "scope": "EVERYONE"          // "ME" | "EVERYONE", majburiy
}
```

| Maydon | Tur | Cheklov |
|---|---|---|
| `ids` | `string[]` | 1..100 ta, takrorlanmagan; hammasi **bitta** suhbatdan |
| `scope` | `enum` | `ME` \| `EVERYONE` |

**Javob `200`**

```json
{
  "conversationId": "01J...",
  "deleted":  ["01J...A", "01J...B"],
  "skipped":  [{ "id": "01J...C", "reason": "NOT_OWN" }],
  "unreadCount": 3,
  "lastMessage": { "...": "MessageDto yoki null" }
}
```

- `deleted` — haqiqatan o'chirilgan (yoki allaqachon o'chirilgan — idempotent) id'lar.
- `skipped` — o'tkazib yuborilganlar sababi bilan: `NOT_OWN` (`EVERYONE` da o'zganiki),
  `NOT_FOUND`, `NOT_MEMBER`.
- `unreadCount`, `lastMessage` — klient ro'yxatni qayta so'ramasin uchun.

Bitta ham id o'chmasa ham javob `200` bo'lsin (`deleted: []`) — bu xato emas, natija.
`403` faqat suhbatning a'zosi bo'lmaganda.

**Vaqt chegarasi yo'q.** Telegram'da ham cheklov yo'q; qo'ymaymiz.

`DELETE /v1/messages/{id}` **qoladi** (eski klientlar uchun) va unga ixtiyoriy `?scope=`
qo'shiladi; berilmasa — `EVERYONE`, ya'ni bugungi xatti-harakat o'zgarmaydi.

## A3. WS — `message:deleted` ni kengaytirish

Hozir hodisa bitta xabar haqida keladi. Ko'p o'chirishda 100 ta hodisa yuborish o'rniga
**bitta** hodisa:

```json
// server → klient, `/chat`
{
  "event": "message:deleted",
  "data": {
    "conversationId": "01J...",
    "ids":   ["01J...A", "01J...B"],
    "seqs":  [141, 142],
    "scope": "EVERYONE",
    "deletedBy": "01J...user"
  }
}
```

- **Orqaga moslik:** eski `{ id, seq }` maydonlari ham **saqlansin** (birinchi element bilan
  to'ldirilsin) — tarqatilgan klientlar hodisani tushunishda davom etsin.
- `scope = ME` bo'lganda hodisa **faqat so'rovchining o'z qurilmalariga** yuborilsin,
  suhbatdoshga **emas**. Bu — ko'p qurilmali sinxronizatsiyaning yagona yo'li.

## A4. Ketma-ketlik va qatorma-qator moslik — **eng muhim qism**

O'chirish tarixning **tartibini buzmasligi** kerak. Talab bitta jumlada: *ikkala a'zoning
ekranida qatorlar aynan bir xil tartibda va bir xil joyda tursin — o'chirishdan oldin ham,
keyin ham.*

### A4.1. `seq` qayta sanalmaydi

- `seq` — suhbat ichida **1 dan boshlanadigan, bo'shliqsiz, o'zgarmas** raqam.
- Xabar o'chirilganda qator **qolaveradi** (soft delete): `seq` o'z joyida, tanasi bo'sh,
  `deletedAt` to'la. Qatorni jismonan o'chirish yoki `seq` larni siljitish **taqiqlanadi**.
- Sabab: `seq` — bir vaqtning o'zida tarix kursori (`before`/`after`), o'qildi kursori
  (`lastReadSeq`, `peerReadSeq`), yetkazildi kursori va o'qilmaganlar arifmetikasining o'qi.
  Bittasini siljitsangiz, ikkinchi qurilmadagi kursor **boshqa xabarni** ko'rsatib qoladi:
  o'qilgan xabarlar qayta o'qilmagan bo'lib chiqadi va badge yolg'on son ko'rsatadi.
- Klient ham aynan shunga tayanadi: local kesh `ORDER BY (seq = 0), seq ASC, createdAt ASC`
  bilan o'qiladi. `seq = 0` — hali yuborilmagan optimistik qator, u doim eng oxirida turadi.

### A4.2. Tartib qoidasi — ikkala tomonda bitta

Barcha ro'yxatlar (REST tarix, WS oqimi, `around`) **aynan shu tartibda** qaytsin:

```sql
ORDER BY seq ASC, created_at ASC, id ASC
```

`created_at` va `id` — zaxira: bir xil `seq` bo'lmasligi kerak, lekin tartib **deterministik**
bo'lishi shart, aks holda ikkita so'rov ikki xil tartib qaytarib, klient keshida xabarlar
o'rin almashib qoladi.

### A4.3. Sahifalash filtrdan **keyin** emas, **ichida**

Yashirilgan (`message_hidden`) va tozalangan (`cleared_before_seq`) qatorlar SQL'ning
`WHERE` qismida chiqarilsin, `LIMIT` dan **keyin** emas:

```sql
SELECT * FROM messages m
WHERE m.conversation_id = :id
  AND m.seq > :cleared_before_seq
  AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = :me)
  AND m.seq < :before
ORDER BY m.seq DESC
LIMIT :limit;
```

Aks holda 50 ta so'ralgan sahifadan 12 tasi qaytadi, klient «tarix tugadi» deb o'ylab
yuqoriga yuklashni to'xtatadi va **o'rtada teshik** qoladi.

`hasMore` ham **filtrlangan** to'plam bo'yicha hisoblansin (`LIMIT + 1` usuli), aks holda
oxirgi sahifada abadiy aylanuvchi indikator qoladi.

### A4.4. Ko'p o'chirish — bitta tranzaksiya

`POST /v1/messages/delete` dagi barcha id'lar **bitta tranzaksiyada** qayta ishlansin:

1. hammasi bir suhbatga tegishliligi tekshiriladi (`MIXED_CONVERSATIONS`);
2. huquqi bor'lari o'chiriladi/yashiriladi;
3. `unread_count` **bir marta** qayta hisoblanadi (har bir xabar uchun alohida `-1` emas —
   parallel so'rovda sanoq manfiyga ketadi);
4. `last_message` ko'rinishi **bir marta** yangilanadi;
5. WS hodisasi **bitta** yuboriladi (§A3).

Yarim bajarilgan holat bo'lmasin: yiqilsa hech nima o'chmasin.

### A4.5. Ro'yxatdagi ko'rinish qaysi xabardan olinadi

`GET /v1/conversations` dagi `lastMessage` — **so'rovchi ko'radigan** eng oxirgi xabar:
yashirilgan va tozalangandan pastdagi qatorlar hisobga olinmaydi. O'chirilgani (tombstone)
esa **hisobga olinadi** — u ekranda ko'rinadigan qator (klient uni «Xabar o'chirildi» deb
chizadi).

Ya'ni bir suhbatning ikki a'zosi ro'yxatda **turli** oxirgi xabarni ko'rishi mumkin — bu
to'g'ri xatti-harakat, `scope = ME` ning bevosita natijasi.

### A4.6. Qabul qilish mezoni (E2E)

Quyidagilar test bilan qoplansin:

1. 50 ta xabardan o'rtadagi 10 tasi `EVERYONE` bilan o'chiriladi → ikkala a'zoda ham
   ro'yxat uzunligi **o'zgarmaydi**, `seq` lar bir xil, tombstone'lar aynan o'sha joyda.
2. O'sha 10 tasi `ME` bilan o'chiriladi → so'rovchida ro'yxat 10 taga qisqaradi,
   suhbatdoshda **50 tasi ham joyida**, ikkalasining ham qolgan qatorlari bir xil tartibda.
3. `?before=` bilan sahifalab butun tarix yig'iladi → yashirilganlaridan boshqa hamma xabar
   **bir marta** keladi, dublikat va teshik yo'q.
4. Tarix tozalangandan keyin yangi xabar yuboriladi → uning `seq` i oldingisidan katta,
   ro'yxatda yolg'iz o'zi turadi, suhbatdoshda esa butun tarix joyida.
5. O'qilmagan 5 ta xabardan 3 tasi o'chiriladi → badge 5 dan 2 ga tushadi, manfiyga
   ketmaydi, takroriy so'rovda ham 2 bo'lib qoladi (idempotentlik).

---

# B QISM — TARIXNI TOZALASH VA SUHBATNI O'CHIRISH

## B1. `DELETE /v1/conversations/{id}/history`

```http
DELETE /v1/conversations/{id}/history?scope=ME
```

| `scope` | Ma'nosi |
|---|---|
| `ME` | tarix **faqat so'rovchida** yo'qoladi (hamma qurilmalarida); suhbatdoshda qoladi |
| `EVERYONE` | tarix **ikkalasida** ham yo'qoladi |

**Javob `200`**

```json
{ "conversationId": "01J...", "clearedBeforeSeq": 812, "unreadCount": 0 }
```

**Amalga oshirish — `seq` suv belgisi, qatorlarni o'chirmasdan:**

```sql
ALTER TABLE conversation_members ADD COLUMN cleared_before_seq int NOT NULL DEFAULT 0;
```

- `cleared_before_seq = <suhbatdagi eng katta seq>` qo'yiladi (so'rovchi uchun; `EVERYONE`
  da — ikkala a'zo uchun).
- `GET /v1/conversations/{id}/messages` **doimo** `seq > cleared_before_seq` filtri bilan
  javob bersin. Bu `before`/`after`/`around` kursorlarining hammasiga taalluqli.
- `unread_count = 0`, `last_read_seq = cleared_before_seq`.
- `GET /v1/conversations` da bu suhbatning `lastMessage` i `null` bo'ladi, lekin suhbatning
  o'zi **ro'yxatda qoladi** (Telegram ham shunday: tarix tozalanadi, suhbat qolaveradi).
- Tozalashdan **keyin** kelgan xabarlar odatdagidek ko'rinadi — `seq` o'sishda davom etadi.

Qatorlarni fizik o'chirmaslikning sababi: `seq` bo'shliqsiz bo'lishi va suhbatdoshning
kursorlari ishlashi kerak. Fizik tozalash kerak bo'lsa — fon vazifasi: ikkala a'zoning
`cleared_before_seq` idan past qatorlarni haftada bir marta o'chirish.

**WS hodisasi**

```json
{
  "event": "history:cleared",
  "data": { "conversationId": "01J...", "clearedBeforeSeq": 812, "scope": "ME", "by": "01J...user" }
}
```

`scope = ME` — faqat so'rovchining qurilmalariga; `EVERYONE` — ikkala a'zoga.

## B2. `DELETE /v1/conversations/{id}` — suhbatni o'chirish

Tarixni tozalash + suhbatni **ro'yxatdan olib tashlash**. Telegram semantikasi:

- so'rovchi uchun suhbat ro'yxatdan yo'qoladi (`conversation_members.hidden = true`);
- yangi xabar kelsa suhbat **o'zi qaytadi** (o'sha `conversationId` bilan, faqat tozalashdan
  keyingi xabarlar bilan);
- `POST /v1/conversations` (idempotent) o'sha suhbatni qaytarsin — yangisini **yaratmasin**,
  aks holda tarix ikkiga bo'linadi.

`?scope=` bu yerda ham qo'llanadi: `EVERYONE` bo'lsa ikkalasida ham.

WS: `conversation:deleted { conversationId, scope, by }`.

---

# C QISM — SITATA BILAN JAVOB (REPLY / QUOTE)

Foydalanuvchi xabarni ochib, **matnning bir qismini belgilaydi** va «Javob berish» ni
bosadi — javob pufagi ustida aynan o'sha gap sitata bo'lib turadi.

## C1. Yuborish

`SendMessageDto` ga (REST `POST /v1/conversations/{id}/messages` va WS `message:send` —
**ikkalasiga ham**) ikkita ixtiyoriy maydon:

```json
{
  "body": "ha, kelaman",
  "clientMsgId": "…",
  "replyToMessageId": "01J...A",
  "quote": { "text": "ertaga soat 10 da", "offset": 14 }
}
```

| Maydon | Tur | Qoida |
|---|---|---|
| `replyToMessageId` | `string?` | **O'sha suhbatdagi** xabar bo'lishi shart → aks holda `422 REPLY_TARGET_NOT_FOUND`. O'chirilgan xabarga javob berib bo'lmaydi → `422 REPLY_TARGET_DELETED` |
| `quote.text` | `string?` | 1..300 belgi. Nishon xabarning tanasidagi **haqiqiy bo'lak** bo'lishi shart → `422 QUOTE_NOT_FOUND` |
| `quote.offset` | `int?` | Belgilangan joyning boshi (UTF-16 kod birligida — klient Kotlin/Swift'da shu bilan ishlaydi). Server `body.substring(offset, offset + text.length) == text` ni tekshirsin |

`quote` **`replyToMessageId` siz kelmasin** → `422 QUOTE_WITHOUT_REPLY`.

Sitata faqat **matnli** xabardan olinadi. Media xabarga javob berish mumkin
(`replyToMessageId`), lekin `quote` bo'lmaydi.

## C2. Qaytarish — `MessageDto.replyTo`

Javob xabari **snapshot** bilan qaytsin, ya'ni nishon xabar keyin o'chirilsa ham sitata
o'z joyida qoladi (Telegram ham shunday):

```json
"replyTo": {
  "id": "01J...A",
  "seq": 141,
  "senderId": "01J...user",
  "senderName": "Kumushim",
  "type": "TEXT",
  "preview": "ertaga soat 10 da uchrashamizmi",
  "quote": { "text": "ertaga soat 10 da", "offset": 14 },
  "originalDeleted": false
}
```

- `preview` — nishon xabarning **qisqartirilgan** ko'rinishi (≤ 120 belgi; media bo'lsa
  `null` va `type` bo'yicha klient «📷 Rasm» deb yozadi).
- `senderName` — pufak ustida ism ko'rsatiladi, klient buni id dan qidirmasin.
- `originalDeleted` — nishon keyinchalik o'chirilgan bo'lsa `true`; sitata baribir qoladi,
  «sakrash» esa o'chiriladi.
- Bu obyekt **o'zgarmas**: nishon tahrirlansa ham (kelajakda) snapshot yangilanmaydi.

Xuddi shu maydon WS `message:new` hodisasida ham bo'lsin.

## C3. `?around=` — sitatani bosganda sakrash

Sitata bosilganda klient asl xabarga sakraydi. U keshda bo'lmasligi mumkin (tarixning
o'rtasidagi eski xabar), shuning uchun:

```http
GET /v1/conversations/{id}/messages?around=141&limit=50
```

`seq = 141` atrofidan ±`limit/2` ta xabar qaytsin. `before`/`after` bilan birga
kelmasin → `422`.

---

## D. Xato kodlari

| Kod | HTTP | Qachon |
|---|---|---|
| `NOT_MEMBER` | 403 | So'rovchi suhbat a'zosi emas |
| `NOT_OWN` | — | (`skipped.reason`) `EVERYONE` da o'zganiki |
| `TOO_MANY_IDS` | 422 | `ids.length > 100` |
| `MIXED_CONVERSATIONS` | 422 | `ids` turli suhbatlardan |
| `REPLY_TARGET_NOT_FOUND` | 422 | `replyToMessageId` boshqa suhbatda yoki yo'q |
| `REPLY_TARGET_DELETED` | 422 | Nishon o'chirilgan |
| `QUOTE_NOT_FOUND` | 422 | `quote.text` nishon tanasida topilmadi |
| `QUOTE_TOO_LONG` | 422 | `quote.text` > 300 belgi |
| `QUOTE_WITHOUT_REPLY` | 422 | `quote` bor, `replyToMessageId` yo'q |

---

## E. Klient tomonda nima o'zgaradi

Bu tayyor bo'lgach klientda quyidagilar ulanadi (kod allaqachon shunga tayyor turadi):

| Backend | Klient qadami |
|---|---|
| `POST /v1/messages/delete` | N ta so'rov o'rniga bitta; `ChatRepository.deleteMessages(ids, forEveryone)` ichidagi sikl olib tashlanadi |
| `scope = ME` va `message_hidden` | Local `MessageEntity.hiddenAt` **serverdan** to'ldiriladi; qurilma almashganda yashirilganlar yashiriligicha qoladi |
| `DELETE …/history` | Suhbat menyusiga «Tarixni tozalash» qo'shiladi (`ConversationEntity.clearedBeforeSeq` + `selectMessages` filtri) |
| `DELETE /v1/conversations/{id}` | Ro'yxatdagi surish menyusiga «O'chirish» |
| `replyTo` + `quote` | Matnni belgilash oynasiga «Sitata qilib javob berish», kompozitorda sitata paneli, pufakda sitata bloki, bosilganda sakrash |
| `?around=` | Sitatani bosganda tarixning o'rtasiga sakrash |

## F. Tavsiya etilgan tartib

0. **A4** — alohida ish emas, **har bir qadamning shartI**: `seq` qayta sanalmasin, tartib
   deterministik bo'lsin, filtr `LIMIT` ning ichida bo'lsin. Buni keyinga qoldirish eng
   qimmatga tushadigan xato: tarixdagi teshikni keyin tuzatib bo'lmaydi.
1. **A2 + A3** (ko'p o'chirish + WS) — eng ko'p ishlatiladigan va eng arzon qismi.
2. **A1** (`scope = ME`, `message_hidden`) — «faqat menda o'chirish» ni haqiqiy qiladi;
   busiz u qurilmaga bog'liq yolg'on bo'lib qolaveradi.
3. **B1** (tarixni tozalash) — tugma shundan keyin paydo bo'ladi.
4. **C** (reply/quote) — eng katta ish, lekin chatning kundalik qulayligini eng ko'p
   oshiradigani.
5. **B2** (suhbatni o'chirish) — ixtiyoriy, oxirida.

Har bir qadam `student-club.json` (OpenAPI) ga qo'shilsin va WS hodisalari
`handoff/03-WEBSOCKET.md` da yangilansin — klient generatsiyasi shu ikkisidan boradi.
