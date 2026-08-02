# Sizga bog'liq uchta ish

Backend deploy bo'la oladi, lekin bu uchtasining har biri **haqiqiy bog'liqlik** — har birining
aniq buzilish stsenariysi bor. Birinchisi **deploy'dan oldin** hal qilinishi kerak, qolgan ikkitasi
qo'ng'iroqni yoqishdan oldin.

| # | Ish | Qachon | Bajarilmasa nima bo'ladi |
|---|---|---|---|
| 1 | `MessageType.CALL` ga chidamlilik | **backend deploy'idan OLDIN** | **yangilanmagan** foydalanuvchilarning chat ekrani buziladi |
| 2 | Qayta ulanishda `call:connected` ni qayta yuborish | qo'ng'iroqni yoqishdan oldin | qisqa tarmoq uzilishi jonli qo'ng'iroqni 20 soniyadan keyin o'ldiradi |
| 3 | `call:auth { token }` | qo'ng'iroqni yoqishdan oldin | tokeni eskirgan odam qo'ng'iroqqa **javob bera olmaydi**, qo'ng'iroqlar jimgina `MISSED` bo'ladi |

---

## 1. `MessageType.CALL` ga chidamlilik — deploy'dan oldin

### Nima bo'ladi

Qo'ng'iroq tugagach server suhbatga `type: "CALL"` xabar yozadi. Ya'ni **yangi klientdagi
foydalanuvchi eski klientdagi foydalanuvchiga qo'ng'iroq qilsa**, eski klient hech qachon
ko'rmagan enum qiymatiga ega qator oladi:

- `message:new` hodisasida (`/chat` socket'i),
- `GET /v1/conversations/{id}/messages` tarixida,
- suhbatlar ro'yxatidagi `lastMessage` da,
- va agar kimdir o'sha xabarga javob yozsa — `MessageDto.replyTo.type` da ham.

### Nima buziladi

kotlinx.serialization **noma'lum enum qiymatida `SerializationException` tashlaydi** — bu uning
odatiy xatti-harakati. Va bu bitta pufakchani emas, **butun javobni** yiqitadi: tarix sahifasi
pars bo'lmaydi, suhbatlar ro'yxati pars bo'lmaydi, `message:new` handler'i xato beradi. Ekran
bo'sh yoki xato holatida qoladi.

⚠️ **Bu yangi klientning muammosi emas — allaqachon tarqatilgan klientning muammosi.** Shuning
uchun uni yangi versiya bilan «tuzatib» bo'lmaydi: qurbon yangilanmagan odam. Backend deploy
qilinishi bilan har bir tugagan qo'ng'iroq shunday qator yozadi.

### Nima qilish kerak

1. **Hozirgi productiondagi klientni tekshiring** — `MessageTypeDto` ni qanday deserializatsiya
   qiladi? Agar u qat'iy bo'lsa, backend deploy'i **kutishi kerak**.
2. Deserializerni bardoshli qiling. Amaliy variantlar:
   - `Json { coerceInputValues = true }` + `MessageType` maydoniga **odatiy qiymat** (`= UNKNOWN`)
     berish — kotlinx noma'lum qiymatni odatiyga tushiradi;
   - yoki maydonni `String` sifatida o'qib, `when` bilan xaritalash va noma'lumini e'tiborsiz
     qoldirish;
   - yoki `MessageType` uchun `UNKNOWN` a'zosi bo'lgan maxsus `KSerializer`.
3. Xuddi shu chidamlilikni **`CallStatus`, `CallEndReason`, `CallMedia`, `CallDirection`** uchun ham
   qo'ying. Ular kelajakda kengayishi mumkin, va `CallStatus` allaqachon sakkiz qiymatli.
4. `MessageDto.call` — **yangi nullable maydon**, additive, xavfsiz. Xavf faqat enum'da.

### Qanday tekshiriladi

Bitta `CALL` xabarli JSON javobini eski klientning parseriga bering. Xato tashlamasa va qolgan
xabarlar ko'rinsa — tayyor. **Bizga shu tasdiqni yozing**, backend deploy shunga qarab
rejalashtiriladi.

---

## 2. `/calls` qayta ulangach `call:connected` ni qayta yuboring

### Nima bo'ladi

Ishtirokchining socket'i uzilganda server uning mavjudlik belgisini tozalaydi va **20 soniyalik**
oyna quradi. Bu oynani faqat **o'sha talabadan, o'sha qo'ng'iroq uchun kelgan `call:*` freym**
bekor qiladi.

Server ikkita holatni farqlaydi:

| Holat | Server o'zi hal qila oladimi |
|---|---|
| Socket **almashtirilgan** — yangisi eskisi o'lishidan oldin ulangan (ping timeout tarmoq uzilishidan ~45 s orqada qolishi mumkin) | ✅ ha — shaxsiy xonada boshqa jonli socket borligini ko'radi va oynani umuman qurmaydi |
| **Oddiy uzilib-qayta ulanish** — eski socket o'ldi, keyin yangisi keldi | ❌ **yo'q** — yangi socket hech qanday `callId` olib kelmaydi va server uni nimaga bog'lashni bilmaydi |

### Nima buziladi

ICE kelishib bo'lgandan keyin qo'ng'iroq bu socket'da **butunlay jimib qolishi mumkin** — media
peer-to-peer oqadi, signalizatsiya freymlari umuman ketmaydi. Ya'ni qayta ulanib, so'ng shunchaki
kutib turgan klientning **sog'lom, media oqib turgan qo'ng'irog'i** 20 soniyadan keyin
`call:ended { reason: "FAILED" }` bilan yopiladi.

Amalda bu: lift, tunnel, metro, Wi-Fi → mobil o'tish. Ya'ni **har kuni**.

### Nima qilish kerak

`/calls` socket'i jonli qo'ng'iroq davomida qayta ulangan **zahoti**, boshqa hech narsadan oldin:

```kotlin
socket.emit("call:connected", mapOf("callId" to liveCallId))
```

Har bir jonli qo'ng'iroq uchun (amalda bitta).

**U idempotent:** qo'ng'iroq allaqachon `ACTIVE` bo'lsa holat yozuvi no-op bo'ladi va faqat
mavjudlik belgisi yangilanadi. Shuning uchun uni har qayta ulanishdan keyin yuborish **doim
xavfsiz** — va bu ICE birinchi marta ulanganda yuboradigan aynan o'sha hodisa, yangi kod emas.

Boshqa qo'ng'iroq ichidagi hodisalar (`call:ice`, `call:media-state`, `call:renegotiate`,
`call:ringing`) ham mavjudlikni yangilaydi — lekin **aytadigan gap bo'lmaganda ham** yuborsa
bo'ladigani faqat `call:connected`.

⚠️ Qayta ulanish 20 soniyadan uzoq davom etsa qo'ng'iroq allaqachon yopilgan bo'ladi va
`call:connected` `CALL_NOT_FOUND` qaytaradi — bu «qo'ng'iroq tugadi» degani, xato holati emas.
UI'ni shunga qarab yoping.

---

## 3. `call:auth { token }`

### Nima bo'ladi

Qo'ng'iroq **4 soatgacha** yashaydi, access token esa **15 daqiqa**. `/calls` socket'i handshake'da
tokenni bir marta tekshiradi va uning `exp` ini eslab qoladi.

`call:invite` va `call:accept` — holat yaratuvchi hodisalar, ular **yangi token talab qiladi**
(`PROTOCOL.md` §8). Bu tekshiruv **hozir ham yoqilgan**.

### Nima buziladi

Foydalanuvchi ilovani ochib qo'yib, 20 daqiqa boshqa ish bilan band bo'ldi. Socket ochiq, lekin
uning saqlangan `exp` i o'tib ketdi. Endi unga kimdir qo'ng'iroq qiladi:

1. `call:incoming` yetib boradi, telefon jiringlaydi.
2. Foydalanuvchi «Javob berish» ni bosadi → `call:accept` → **`TOKEN_EXPIRED`**.
3. U hech nima qila olmaydi. 45 soniyadan keyin qo'ng'iroq `MISSED` bo'ladi.
4. Chaquvchi «javob bermadi» deb o'ylaydi.

Ilova tokenni fonda yangilagan bo'lsa ham foyda yo'q — **socket eski `exp` ni ushlab turadi**.

### Nima qilish kerak

Access token yangilangan **har safar**, ochiq `/calls` socket'ida:

```kotlin
socket.emit("call:auth", mapOf("token" to newAccessToken), ack)
// ack: { "status": "ok", "expiresAt": "2026-08-01T09:33:00.000Z" }
```

Socket uzilmaydi, qo'ng'iroq to'xtamaydi — faqat saqlangan `exp` yangilanadi.

⚠️ **Boshqa talabaning tokenini yubormang** — bu yangilash emas, sessiya almashtirish deb
qaraladi va socket **uziladi**.

### Nima uchun bu «keyin» emas

Backendda `CALLS_ENFORCE_TOKEN_EXPIRY` bayrog'i bor. **Hozir `false`**: socket token muddati
o'tganda uzilmaydi.

U aynan shuning uchun o'chirilgan — **`call:auth` ni yuboradigan klient hali yo'q**. Bayroq
`true` bo'lsa socket `exp + 60 s` da uziladi, ya'ni **~16 daqiqadan uzoq har qanday qo'ng'iroq
uziladi**.

Bayroq **ikkala platforma ham `call:auth` ni chiqargandan keyin** yoqiladi. Undan oldin server
`/calls` socket'larida token muddatini majburlayapti deb hisoblamang.

> Vaqtinchalik chora sifatida socket'ni yangi token bilan **qayta ulash** ham ishlaydi — lekin
> jonli qo'ng'iroq davomida qayta ulanish §2 dagi `call:connected` ni ham talab qiladi. `call:auth`
> ikkalasini ham chetlab o'tadi.

---

## Qisqa tekshiruv ro'yxati

- [ ] Eski klient `type: "CALL"` bo'lgan xabarni yiqilmasdan pars qiladi — **tasdiqlangan**
- [ ] Yangi klient `MessageTypeDto` va to'rtala qo'ng'iroq enum'ini bardoshli o'qiydi
- [ ] `/calls` qayta ulanganda jonli qo'ng'iroq uchun `call:connected { callId }` ketadi
- [ ] Token yangilanganda ochiq `/calls` socket'ida `call:auth { token }` ketadi
- [ ] `call:ended`, `call:declined` **va** `call:canceled` — uchalasi ham UI'ni yopadi
- [ ] `relayOnly: true` da `iceTransportPolicy = "relay"` va host/srflx nomzod chiqmaydi
- [ ] `RATE_LIMITED` da darhol qayta urinilmaydi
- [ ] `GET /v1/calls/ice-servers` ning **503** javobi alohida qayta ishlanadi
