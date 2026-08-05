# Tartib — qaysi biri qachon

Papkadagi hamma hujjat **bajarilishi kerak**. Raqamlar — tavsiya etilgan ketma-ketlik:
bog'liqlik va foydaning tezligi bo'yicha, murakkablik bo'yicha emas.

| # | Hujjat | Nima | Nega shu joyda |
|---|---|---|---|
| 01 | `NOTIFICATIONS_BACKEND` | `GET /v1/notifications`, `POST /v1/notifications/read` | **Ortida tayyor klient kodi bekor turibdi.** Ikkita endpoint — ilovada bitta bayroq o'zgaradi va o'lik ekran jonlanadi. Eng arzon, eng ko'rinadigan natija |
| 02 | `PUSH_CATALOG_BACKEND` | 12 ta hodisa uchun push matni, `data` konverti, chastota | 01 bilan **bitta ish**: push va ro'yxat qatori bitta manbadan chiqadi. Alohida qilinsa hodisalar ikki marta yoziladi |
| 03 | `VIDEO_UPLOAD_STREAMING_BACKEND` | `init` da `totalBytes` ixtiyoriy, `complete` da `parts` | Ikkita spec maydoni, ta'siri katta: 3 daqiqalik videoda kutish ~2 barobar qisqaradi. Hech narsaga bog'liq emas — istalgan vaqtda kiritsa bo'ladi |
| 04 | `CALLS_BACKEND` | coturn, VoIP push, `tokenType`, `/v1/calls/active` | Eng katta va yagona **tashqi bog'liqlikka ega** ish. Kontrakt tomoni allaqachon tayyor, qolgani infratuzilma |
| 05 | `STUDENT_LISTINGS_INTEGRATION_BACKEND` | 4 ta `*DetailsDto`, `POST /search` sxemasi, Faza 2 | E'lonlar to'liq ishlayapti; bu kontrakt gigiyenasi va keyingi bosqich rejasi. Kechiktirilsa foydalanuvchi sezmaydi |

---

## ⚠️ Bitta narsa navbatni kutmasin

**coturn uchun server/IP, DNS yozuvi va 443/TLS sertifikatini bugun buyurtma qiling**
(04 §6). Bu kod emas — tashqi jarayon, bir kunda bo'lmaydi va uni navbatda hech kim
tezlashtira olmaydi. Qolgan hamma narsa 01 dan boshlab ketaversin; coturn tayyor
bo'lgunicha 04 ning kod qismiga navbat kelib qoladi.

Hozir `GET /v1/calls/ice-servers` `503` qaytaradi — ya'ni qo'ng'iroqning media qismini
na siz, na biz sinay olmayapmiz.

---

## Fayl nomlari

Raqamli prefiks faqat shu papkada — tartib ko'rinib tursin uchun. Repodagi asl nomlar
prefikssiz (`NOTIFICATIONS_BACKEND.md` va h.k.), yangilanish o'sha yerdan keladi.
