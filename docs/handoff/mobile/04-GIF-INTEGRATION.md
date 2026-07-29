# GIF paneli — klient tomonidagi talablar

Provayder: **KLIPY**. Backend proksi qiladi, kalit serverda qoladi.

> Nega KLIPY: **Tenor API 2026-yil 30-iyunda butunlay o'chirildi** (mavjud kalitlar ham ishlamaydi),
> Giphy esa bepul kalitda soatiga atigi 100 ta so'rov beradi va cheksiz tarifi pullik. KLIPY —
> Tenor jamoasi qurgan, production tarifi bepul va cheksiz; WhatsApp allaqachon unga o'tgan.

## Endpointlar

### `GET /v1/gifs/search`

| Parametr | Izoh |
|---|---|
| `q` | Qidiruv so'zi. **Bo'sh bo'lsa** — trending qaytariladi |
| `limit` | 1–50, odatiy 30 |
| `pos` | Keyingi sahifa kursori — **shaffof**, ichiga qaramang |
| `locale` | `uz_UZ` / `ru_RU` / `en_US`, odatiy `uz_UZ` |

```jsonc
{
  "result": {
    "items": [
      {
        "id": "1938481",
        "url": "https://static.klipy.com/ii/…/IlnkvSyF.mp4",
        "thumbUrl": "https://static.klipy.com/ii/…/M7ThMWi7.gif",
        "width": 220, "height": 230,
        "durationMs": null
      }
    ],
    "next": "2",
    "provider": "KLIPY"
  }
}
```

### `POST /v1/gifs/{id}/share`

Foydalanuvchi GIF tanlaganda chaqiring. Hozirgi provayderda bu no-op, lekin kontraktda qoladi —
provayder almashsa (bir oyda ikki marta bo'ldi) klient o'zgarmasligi uchun.

## ⚠️ Atribut — majburiy

**«Powered by KLIPY»** brendi qidiruv panelida ko'rsatilishi **shart**. Bu shartnomaviy talab, va
production kalitini olish uchun ular buni videodan tekshiradi.

Assetlar KLIPY Partner Panel'dan olinadi — backend jamoasi sizga beradi. Javobdagi `provider` maydoni qaysi
belgini ko'rsatishni aytadi — hozir doim `KLIPY`.

## `url` — bu MP4, GIF emas

`items[].url` — **ovozsiz, takrorlanuvchi MP4**. `.gif` emas: bir xil animatsiya GIF'da ~20 barobar
og'ir bo'ladi, bu esa mobil trafik.

Shunday o'ynating: **avtomatik, cheksiz takror, ovozsiz**. `thumbUrl` — yuklanguncha ko'rsatiladigan
statik kadr.

## GIF yuborish — ikki manba, bitta shakl

**a) Qidiruvdan tanlangan** — yuklash yo'q, `gif` obyektini qaytarib yuborasiz:

```jsonc
{
  "type": "GIF",
  "gif": {
    "provider": "KLIPY",
    "externalId": "1938481",
    "url": "https://static.klipy.com/…/IlnkvSyF.mp4",
    "thumbUrl": "https://static.klipy.com/…/M7ThMWi7.gif",
    "width": 220, "height": 230
  },
  "clientMsgId": "…"
}
```

**b) Foydalanuvchi o'zi yuklagan** — odatdagi oqim, `chat-upload` (`kind: GIF`) → `mediaId`:

```jsonc
{ "type": "GIF", "mediaId": "med_…", "clientMsgId": "…" }
```

Server yuklangan GIF'ni **ovozsiz MP4 ga o'giradi** (sinovda 203 KB → 17 KB).

**Ikkalasi ham `MessageDto.attachment` da bir xil ko'rinadi** — `isAnimated: true`, `mimeType:
"video/mp4"`. Klient ularni ajratishi shart emas.

`gif.url` domen oq ro'yxatidan o'tadi (`422 GIF_URL_NOT_ALLOWED`). Javobda kelgan obyektni
o'zgartirmasdan qaytaring.

## Xatolar

| HTTP | `error.code` | Ma'nosi |
|---|---|---|
| **429** | `GIF_PROVIDER_RATE_LIMITED` | Provayder kvotasi tugadi. Birozdan keyin qayta urining |
| 429 | `RATE_LIMITED` | **Bizning** chegara — daqiqasiga 60 ta qidiruv |
| 502 | `GIF_PROVIDER_ERROR` | Provayder javob bermadi |
| 503 | `GIF_PROVIDER_ERROR` | Bu deploymentda GIF qidiruvi sozlanmagan |

Ikkita 429 ni ajrating: birinchisi kutish, ikkinchisi foydalanuvchini sekinlashtirish.

## ⚠️ Hozirgi holat: test kaliti — soatiga 100 ta so'rov

Bu **global** chegara, foydalanuvchi boshiga emas. Panelni ochish 1 ta so'rov, har bir qidiruv yana
bittadan. Ya'ni soatiga ~5–10 foydalanuvchi, keyin hamma `429 GIF_PROVIDER_RATE_LIMITED` oladi.

**Ishlab chiqish uchun yetarli, prod uchun emas.**

### Production kaliti sizga ham bog'liq

KLIPY production kaliti bepul va cheksiz, lekin so'rov formasi **ilova ichida ishlab turgan GIF
panelining video yozuvini** talab qiladi:

1. Backend tayyor ✅
2. Siz panelni quring, **atribut belgisi bilan**
3. 30–60 soniyalik ekran yozuvi: chat → GIF paneli (**atribut kadrda**) → qidiruv → yuborish →
   suhbatda o'ynashi
4. Backend jamoasi formani topshiradi, javob bir necha ish kunida keladi

Ya'ni **GIF qidiruvi v1 ga ulgurmasligi mumkin**. GIF **yuborish** (yuklash) esa hech kimga bog'liq
emas va allaqachon ishlaydi — panel keyinga qolsa ham foydalanuvchi GIF yubora oladi.
