# Sizning spec'ingizdan chetlashishlar

Manba: `CHAT_MEDIA_AND_CALLS_BACKEND.md` §10–16. Quyidagilarning hammasi **ongli qaror** — har
birining sababi bor. Klient kodiga ta'sir qiladiganlari **qalin**.

## Umumiy jadval

| # | Nima | Siz aytgansiz | Bizda | Klientga ta'siri |
|---|---|---|---|---|
| 1 | **`callId` formati** | ULID, `cal_01J…` | **uuid v4**, 36 belgi | ⚠️ **ha** |
| 2 | **Hodisalar soni** | 15 | **17** (+`call:connected`, +`call:auth`) | ⚠️ **ha** |
| 3 | **`relayOnly: boolean`** | yo'q edi | `invite` ack, `call:incoming`, `call:accepted` da | ⚠️ **ha** |
| 4 | **`call:invite` payload'i** | `{ conversationId, calleeId, media, sdp }` | **`conversationId` yo'q** | ⚠️ **ha** |
| 5 | **`call:ringing` yo'nalishi** | faqat S → K | **K → S → K** (chaqirilgan yuboradi) | ⚠️ **ha** |
| 6 | **Band holat** | `call:declined { reason: "BUSY" }` hodisasi | **`call:invite` ack'ida `CALL_BUSY` xatosi** | ⚠️ **ha** |
| 7 | **`BLOCKED` kodi** | `BLOCKED` | **`USER_BLOCKED`** | ⚠️ **ha** |
| 8 | **`CallStatus`** | 7 qiymat | **8** (+`CONNECTING`) | ⚠️ **ha** |
| 9 | **`endedBy`** | `Student.id` | **`"CALLER" \| "CALLEE" \| null`** | ⚠️ **ha** |
| 10 | **`durationMs`** | nullable ustun | **doimo son**, javobsizda `0` | ⚠️ **ha** |
| 11 | **`GET /v1/calls` element shakli** | `callerId`, `calleeId` | **`peerId` + `direction`** | ⚠️ **ha** |
| 12 | **`MessageType.CALL` + `MessageDto.call`** | §14.2 da so'ralgan | qo'shildi, **klient yubora olmaydi** | ⚠️ **ha** |
| 13 | **`ice-servers` 503** | yo'q edi | TURN sozlanmagan deploy'da `NOT_IMPLEMENTED` | ⚠️ **ha** |
| 14 | Chatdagi yozuv | belgilanmagan | `Message` ustunlarida **snapshot**, `Call` ga JOIN emas | yo'q |
| 15 | `CallEndReason.UNAUTHORIZED` | §12.1 ro'yxatida bor | enum'da bor, **1-bosqichda hech qachon chiqmaydi** | kichik |
| 16 | Glare qoidasi | «kichik `callId` yutadi» | + **teskari juftlik** va **`RINGING`** shartlari | yo'q |
| 17 | Chastota chegarasi | daqiqasiga 10 taklif | + **juftlik byudjeti**, + socket bucket, + ICE/renegotiate | ⚠️ **ha** |
| 18 | Payload cheklari | belgilanmagan | qat'iy chegaralar + **ortiqcha maydon rad etiladi** | ⚠️ **ha** |
| 19 | Telemetriya | §15.5 `POST /v1/calls/{id}/stats` | **3-bosqichga** | keyinroq |
| 20 | `Report.callId` | §16 | **3-bosqichga** | keyinroq |
| 21 | VoIP push | §13 | **2-bosqichga** | keyinroq |
| 22 | `tokenType` taxmini | `IOS → APNS` | **ikkala platformada ham `FCM`** | 2-bosqichda |
| 23 | Bekor push'i | «darhol» VoIP orqali | **VoIP kanalidan ketmaydi** | 2-bosqichda |

---

## A. Protokol

### 1. `callId` — uuid v4, ULID emas

`3fa85f64-5717-4562-b3fc-2c963f66afa6` — **36 belgi**, `cal_01J…` emas.

**Nima uchun.** `callId` **baza qatoridan oldin** kerak: u qo'ng'iroqni band qilish uchun
ishlatiladi, ya'ni Prisma'ning o'z id generatori juda kech ishga tushadi. Loyihada esa hech qanday
ULID generatori o'rnatilmagan. `crypto.randomUUID()` yangi dependency talab qilmaydi va
**kriptografik tasodifiy** — ULID'ning vaqt bo'yicha tartiblangan prefiksidan farqli o'laroq,
taxmin qilib bo'lmaydi. Bu muhim, chunki glare qarori `callId` larni solishtiradi.

**Sizga nima qilish kerak:** `callId` ni tekshiradigan har qanday DTO validatsiyasi **uuid**
kutsin. Prefiksli-id regex'i (`^cal_`) yoki `@Length(20, 32)` bo'lsa — `call:invite` dan keyingi
**har bir hodisa** rad etiladi.

⚠️ **Talaba id'lari o'zgarmadi** — `calleeId`, `peerId`, `senderId` hamon cuid (20–32 belgi).
Ikkalasini bitta «id» tipi bilan tekshirmang.

### 2. Ikkita yangi hodisa — 17 ta, 15 emas

| Hodisa | Nima uchun qo'shildi |
|---|---|
| **`call:connected`** (K → S) | Sizning §12.4 dagi «accept'dan keyin 30 s → `FAILED`» taymeringiz o'lchash uchun holat talab qiladi. `call:accept` darhol `ACTIVE` qilsa, «hali ulanmagan» degan holat umuman mavjud bo'lmaydi va taymer hech qachon ishlamaydi. Shuning uchun `accept → CONNECTING`, va klientning `call:connected` i `→ ACTIVE`. Muqobil (birinchi `call:ice` ni «ulandi» deb hisoblash) rad etildi: nomzod almashinuvi ulanish muvaffaqiyatli degani emas |
| **`call:auth`** (K → S) | Qo'ng'iroq 4 soat, token 15 daqiqa. Usiz tokeni eskirgan chaqirilgan **javob bera olmaydi** va qo'ng'iroqlar jimgina `MISSED` bo'ladi. `PREREQUISITES.md` §3 |

`call:connected` qo'shimcha vazifa ham bajaradi: qayta ulanishdan keyin mavjudlikni tiklaydi
(`PREREQUISITES.md` §2).

### 3. `relayOnly: boolean`

Sizning spec'ingizda yo'q edi. **1-bosqichda qo'shildi**, chunki bu protokol maydoni — keyin
qo'shish klient uchun buzuvchi o'zgarish bo'lardi.

**Nima uchun.** Offer taklif bilan birga ketadi (§12.2) va `call:incoming` uni chaqirilganning
barcha qurilmalariga yuboradi. TURN majburlanmasa, chaqirilgan **javob bermasa ham, hatto rad
etsa ham** chaquvchining umumiy IP manzilini oladi. IP → provayder + shahar. Talabalar ko'pincha
bir-birini tanimaydi.

**Qayerda:** `call:invite` ack'i, `call:incoming`, `call:accepted`.

⚠️ **`GET /v1/calls/ice-servers` javobida emas** — u endpoint peer kim ekani ma'lum bo'lishidan
oldin chaqiriladi, `relayOnly` esa juftlikka bog'liq (bu ikkalasi avval gaplashganmi?). U yerda
hisoblab bo'lmaydi.

To'liq qoida va klient nima qilishi kerakligi: `PROTOCOL.md` §11.

### 4. `call:invite` dan `conversationId` olib tashlandi

Sizning payload'ingiz: `{ conversationId, calleeId, media, sdp }`. Bizda: **`{ calleeId, media,
sdp }`**.

**Nima uchun.** Qo'ng'iroq tugagach server o'sha `conversationId` ga `CALL` xabar yozadi. Agar
qiymat klientdan kelsa, hujumchi **begona ikki kishining suhbatiga xabar in'ektsiya qilib**,
ularning `seq` ini surib, o'qilmagan sonini ko'tara olardi. Server `conversationId` ni (caller,
callee) juftligidan **o'zi topadi** va ack'da hamda `call:incoming` da qaytaradi.

⚠️ **Yuborilsa payload validatsiyadan o'tmaydi** (§18 pastda) — `VALIDATION_ERROR`. Ya'ni eski
payload'ni «zararsiz ortiqcha maydon» deb qoldirib bo'lmaydi.

### 5. `call:ringing` — endi chaqirilgan yuboradi

Sizda: `call:ringing | S → K (chaquvchi)`. Bizda: chaqirilgan `call:incoming` ni olgach
`call:ringing { callId }` **yuboradi**, server esa uni chaquvchiga uzatadi.

Chaquvchi tomonda hodisa nomi va payload'i **o'zgarmagan** — u avvalgidek `call:ringing { callId }`
oladi. O'zgargan narsa: chaqirilgan klient uni yuborishi kerak, aks holda chaquvchi «jiringlayapti»
holatini hech qachon ko'rmaydi.

Qo'shimcha foyda: bu freym chaqirilganning mavjudligini qayd etadi va uzilish oynasini to'g'ri
ishlatadi (`PROTOCOL.md` §6).

### 6. Band holat — hodisa emas, ack xatosi

Sizning §12.3.3: «Chaqirilganning `ACTIVE`/`RINGING` qo'ng'irog'i bo'lsa — darhol
`call:declined { reason: "BUSY" }`».

Bizda: `call:invite` ning **ack'i xato qaytaradi**:

```jsonc
{ "status": "error", "error": { "code": "CALL_BUSY", "message": "Foydalanuvchi hozir band" } }
```

Alohida `call:declined` hodisasi yuborilmaydi. Sabab: bu yerda hech qanday qo'ng'iroq yaratilmadi —
rad etiladigan narsa yo'q. Ack allaqachon so'rovga javob bo'lib turibdi, ikkinchi kanal ortiqcha va
ikki xil yo'l bilan bir xil natijani ko'rsatish klientda ikkita holat mashinasi talab qilardi.

**Glare'da yutqazgan** qo'ng'iroq esa boshqa hikoya — u haqiqatan yaratilgan edi, shuning uchun u
`call:ended { reason: "BUSY" }` bilan yopiladi.

---

## B. Ma'lumot turlari

### 7. `BLOCKED` → `USER_BLOCKED`

Yangi sinonim qo'shilmadi. Loyihada allaqachon `USER_BLOCKED` bor va u aynan shu ma'noni
anglatadi — bitta ma'no ikki kodda bo'lmasin. Chat va connections modullarida ham xuddi shu kod.

Yangi kodlar: **`CALL_NOT_FOUND`**, **`CALL_BUSY`**, **`INVALID_CALL_STATE`**. Qayta ishlatilganlar:
`NOT_CONNECTED`, `USER_BLOCKED`, `FORBIDDEN`, `TOKEN_EXPIRED`, `VALIDATION_ERROR`, `RATE_LIMITED`,
`STUDENT_NOT_FOUND`, `NOT_IMPLEMENTED`, `INTERNAL_ERROR`.

To'liq jadval: `PROTOCOL.md` §9.

### 8. `CallStatus` da 8 qiymat — `CONNECTING` qo'shildi

```
RINGING · CONNECTING · ACTIVE · ENDED · MISSED · DECLINED · FAILED · CANCELED
```

`CONNECTING` = «javob berildi, media hali oqmayapti». Sababi §2 da. `GET /v1/calls` va
`MessageDto.call.status` ikkalasida ham chiqadi.

### 9. `endedBy` — `Student.id` emas, enum

```
"CALLER" | "CALLEE" | null
```

Qiymat faqat ikkitadan biri bo'lishi mumkin, shuning uchun id saqlashning ma'nosi yo'q — va
ishtirokchi hisobi o'chirilsa «osilib qolgan id» muammosi ham bo'lmaydi.

⚠️ **`null` haqiqiy holat**: taymer yopgan qo'ng'iroqda (jiringlash tugadi, ulanmadi, 4 soat,
uzilish) va glare'da hech kim tugatmagan.

### 10. `durationMs` — hech qachon `null` emas

Sizning §14.1 da u nullable ustun edi. Bizda **bazada ustun umuman yo'q** — `answeredAt`..`endedAt`
dan hisoblanadi (ikkita haqiqat manbai bo'lmasin), va DTO'da **doimo son**: javob berilmagan
qo'ng'iroqda `0`.

Kotlin'da `Int`, `Int?` emas. `call:ended`, `CallDto` va `MessageCallDto` — uchalasida ham.

### 11. `GET /v1/calls` — `peerId` + `direction`

Sizning §14.1 dagi jadval `callerId` va `calleeId` ni ko'rsatgan edi. DTO ularning o'rniga
**o'qiyotgan odamga nisbatan** hisoblangan ikkita maydon beradi:

| Maydon | Qiymat |
|---|---|
| `peerId` | suhbatdosh — hech qachon o'qiyotgan odamning o'zi emas |
| `direction` | `"INCOMING"` yoki `"OUTGOING"` |

Klient ro'yxatni chizishda «bu men chiqarganmi yoki menga kelganmi» va «kim bilan» degan ikki
savolga javob beradi; ikkala id'ni berib, klientni har qatorda o'zining id'si bilan solishtirishga
majburlashning ma'nosi yo'q edi.

### 12. `MessageType.CALL` va `MessageDto.call`

Sizning §14.2 aynan shuni so'ragan edi — bu kutilgan qo'shimcha. Ikkita nozik joyi bor:

1. ⚠️ **Bu enum kengayishi eski klientlarni buzishi mumkin** — `PREREQUISITES.md` §1.
2. **Klient `type: "CALL"` xabar yubora olmaydi** — WS va REST ikkalasida ham rad etiladi
   (`VALIDATION_ERROR`). Aks holda har kim soxta qo'ng'iroq tarixi yasab, suhbatdoshiga «javobsiz
   qo'ng'iroq» push'i yuborardi. `SYSTEM` bilan bir xil qoida.

Shakl va nullability: `REST.md` §3.

### 13. `GET /v1/calls/ice-servers` → 503 bo'lishi mumkin

Sizning §11.2 da bunday holat yo'q edi. `CALLS_ENABLED=false` bo'lganda (hozirgi holat — TURN
sozlanganidan qat'i nazar) yoki yoqilgan bo'lib TURN sozlanmagan bo'lsa endpoint
**503 `NOT_IMPLEMENTED`** qaytaradi (`createHmac(undefined)` bilan 500 berish o'rniga). Xuddi shu
bayroq `call:invite` ni ham rad etadi (`PROTOCOL.md` §9) — qolgan hodisalar va `GET /v1/calls` ga
ta'sir qilmaydi.

`CALLS_ENABLED` hali `false`, ya'ni **hozircha bu kutilgan javob**. Klient buni alohida qayta
ishlasin — «server ishlamayapti» emas, «qo'ng'iroq hozircha mavjud emas».

### 14. Chatdagi yozuv — snapshot

`MessageDto.call` `Call` jadvaliga JOIN qilinmaydi — qiymatlar xabar yozilgan paytda **muzlatiladi**
(`replyTo` va `sticker` bilan aynan bir xil naqsh).

Klient uchun ma'nosi: ishtirokchi hisobi o'chirilsa ham qo'ng'iroq pufakchasi to'liq ko'rinaveradi.
Va `call.status`/`durationMs` **hech qachon o'zgarmaydi** — ularni qayta so'rab yangilash kerak
emas.

### 15. `CallEndReason.UNAUTHORIZED` — bor, lekin chiqmaydi

Sizning §12.1 dagi `reason` ro'yxatida bor edi, shuning uchun enum'da saqlab qolindi va OpenAPI'da
ham bor. Lekin **1-bosqichda uni yozadigan yo'l yo'q** — hech bir yopilish sababi bunga olib
kelmaydi. Enum'ni to'liq qayta ishlang, lekin UI'da unga alohida matn o'ylab topishning hozircha
hojati yo'q.

---

## C. Xavfsizlik va chegaralar

### 16. Glare qoidasi kuchaytirildi

Sizning §12.3.4: «`callId` i leksikografik kichik bo'lgan qo'ng'iroq davom etadi».

Bizda shu qoida saqlandi, lekin **ikkita qo'shimcha shart** bilan: mavjud qo'ng'iroq (a) aynan
**teskari juftlik** bo'lishi (o'sha ikki talaba, teskari yo'nalishda) va (b) hali **`RINGING`**
bo'lishi kerak.

**Nima uchun.** `RINGING` sharti bo'lmasa — yangi taklif, faqat `callId` i kichik bo'lgani uchun,
**javob berilgan va davom etayotgan suhbatni** uzib yuborardi. Teskari juftlik sharti bo'lmasa —
siz bilan bog'langan har qanday uchinchi shaxs sizning jiringlayotgan qo'ng'irog'ingizni uzib
yuborardi. Bu glare emas, bu hujum.

Klient tomonda hech narsa o'zgarmaydi.

### 17. Chastota chegaralari — sizniki + yana beshta

Sizning §16: «daqiqasiga 10 ta taklif». U saqlandi, lekin u **bitta qurbonga soatiga 600 marta
jiringlash** imkonini beradi — shuning uchun ustiga yana to'rttasi qo'shildi:

| Chegara | Qiymat |
|---|---|
| Taklif — global | daqiqasiga 10 (sizniki) |
| **Taklif — juftlik** | **15 daqiqada 3 ta javobsiz taklif** |
| **Socket bucket** | **30 token, sekundiga 15 ta** |
| **Tugatish bucket** | **5 token, sekundiga 1 ta** (alohida) |
| **ICE / renegotiate** | qo'ng'iroqqa har ishtirokchidan **500 / 10** |

Klient amalda **socket bucket'ini** uradi, boshqalarini emas. To'liq tushuntirish va nima qilish
kerakligi: `PROTOCOL.md` §10.

### 18. Payload cheklari va **ortiqcha maydon rad etiladi**

Sizning spec'ingizda o'lcham cheklari yo'q edi. Bizda har hodisa uchun DTO va qat'iy chegaralar
(`PROTOCOL.md` §7). Eng muhimi:

⚠️ Validatsiya `whitelist` + `forbidNonWhitelisted` rejimida — **e'lon qilinmagan har qanday kalit
xato beradi**. Bu ichma-ich obyektlarga ham tegishli. Amalda ikkita tuzoq:

1. `call:invite` da eski `conversationId` maydoni (§4).
2. `candidate` obyektidagi `usernameFragment` — ko'p WebRTC implementatsiyasi
   `RTCIceCandidate.toJSON()` ga uni qo'shadi. **Olib tashlang.**

---

## D. Keyingi bosqichlarga qoldirilgani

### 19–21. Telemetriya, shikoyat, VoIP push

| Sizning bandingiz | Qayerda |
|---|---|
| §15.5 `POST /v1/calls/{id}/stats` | 3-bosqich. Klient `RTCStatsReport` yig'ishni hozirdan yozib qo'yishi mumkin, lekin yuboradigan joy hali yo'q |
| §16 `POST /v1/reports` ga `callId` | 3-bosqich |
| §13 VoIP push (PushKit + high-priority FCM) | **2-bosqich.** Hozircha qo'ng'iroq faqat ilova ochiq va `/calls` socket'i ulangan bo'lganda ishlaydi |

### 22. `tokenType` taxmini — ikkala platformada ham `FCM`

Sizning §13.1: «berilmasa platformadan kelib chiqib taxmin qilinsin (`ANDROID → FCM`,
`IOS → APNS`)».

Bizda taxmin **ikkala platformada ham `FCM`** bo'ladi. **Nima uchun:** bazadagi mavjud iOS tokenlar
haqiqatan ham **FCM registration token**. Ularni `APNS` deb belgilash bugun ishlab turgan iOS
push'ini butunlay o'ldiradi.

⚠️ Ya'ni 2-bosqichda **iOS klienti `tokenType` ni aniq yuborishi shart** — `APNS_VOIP` faqat siz
uni ochiq ko'rsatganingizda yoziladi.

### 23. Bekor push'i VoIP kanalidan ketmaydi

Sizning §13.4: «server **darhol** bekor push'ini yuborsin».

Bizda bekor xabari **VoIP kanalidan ketmaydi** — oddiy background push yoki socket orqali ketadi,
klient esa CallKit'ning standart «report qil, so'ng darhol tugat» naqshini bajaradi.

**Nima uchun.** APNs VoIP push'larni tartiblamaydi. Bekor push'i invite push'idan **oldin** yetib
borsa, ilova uyg'onadi va `reportNewIncomingCall` uchun hech narsa topmaydi — iOS ilovani o'ldiradi,
takrorlansa **o'sha qurilmaga VoIP yetkazishni butunlay to'xtatadi**. Ya'ni invite → 100 ms ichida
cancel → takrorlash = qurbonning telefonida boshqa **hech qachon** qo'ng'iroq jiringlamaydi, va
tuzatish uchun ilovani qayta o'rnatish kerak.

Bu 2-bosqichda kuchga kiradi, lekin klient CallKit oqimini hozirdan shunga moslab loyihalasin.

---

## E. Hujjatlar orasidagi ziddiyat — kod haqiqat

Ichki dizayn hujjatlarimizda amalga oshirilmagan bitta da'vo bor. Kod haqiqat, quyidagiga tayaning:

| Da'vo | Haqiqat |
|---|---|
| «har ishtirokchidan ≤150 ICE nomzod» (dizayn §6.3) | ❌ Amaldagi chegara — **500** |

> ⚠️ **Yangilanish:** avvalgi tahrirda bu yerda yana bitta qator bor edi — «server relay bo'lmagan
> ICE nomzodlarini filtrlamaydi», dizayn §9.2 ga zid. Bu **endi tuzatildi**: `relayOnly` bo'lgan
> qo'ng'iroqda `call:ice` yo'lida server nomzod qatoridagi `typ` tokenini o'qib, faqat `typ relay`
> ni oldinga uzatadi — `host`/`srflx`/`prflx` va tahlil qilib bo'lmaydigan qator tashlab yuboriladi
> (yopiq holatga tushish — bu maxfiylik nazorati, shubha holida uzatish emas). Nomzodlarni
> tugatish signali (bo'sh `candidate` qatori) hech qachon tashlab yuborilmaydi. Bu **filtr**, qayta
> yozish emas — nomzod hech qachon o'zgartirilmaydi, shuning uchun Opus/H.264 kafolatlariga ta'sir
> qilmaydi; va bu «server ICE'ga tegmaydi» qoidasining yagona chetlashishi.
>
> ⚠️ **Klient talabi o'zgarmadi.** `relayOnly: true` bo'lganda klient hamon
> `iceTransportPolicy: "relay"` bilan ishlashi va host/srflx nomzod yig'masligi **shart** — server
> filtri faqat eski klientlar uchun bir xillikni ta'minlaydi (ular `relayOnly` ni bilmasa ham IP
> ochilmaydi), lekin klient baribir bekorga yig'ib, server tashlab yuboradigan nomzodlarni
> tarmoqqa chiqarmasligi kerak.
