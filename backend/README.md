# School Supervision — backend

Node.js (Express 5) + MongoDB. Maktab davomati, FaceControl (yuz aniqlash hodisalari), sinfxona kameralari va AI tahlil (odam sanash, holatlar, notinchlik), Telegram ota-onalar boti, Excel hisobotlar. Loyiha ikki qismdan iborat: `backend/` (shu papka) va `../frontend/`.

## Ishga tushirish

```bash
cd backend
cp .env.example .env        # JWT_SECRET (>=32 belgi), MONGO_URI, PORT, FRONTEND_URL ni to'ldiring
npm install
npm run dev                 # nodemon, port 5050   |   npm start — oddiy ishga tushirish
npm test                    # birlik testlar (AI qoidalari, xavfsizlik, kesh)
```

- Rejim `APP_MODE`: `district` (tuman serveri: maktablar, kameralar, AI, davomat) yoki `region` (viloyat serveri: tumanlardan o'qiydi). `npm run dev:region` — `.env.region` bilan.
- Fon vazifalari (AI, Hik so'rovlari, bot, hisobotlar) bir vaqtda faqat BITTA nusxada ishlaydi (`utils/leader.js`, MongoDB qulfi). Port band bo'lsa server to'xtaydi.
- Salomatlik: `GET /api/health` (event loop kechikishi, xotira, rahbarlik, sekin so'rovlar).

## Tuzilma

| Papka | Vazifasi |
|---|---|
| `index.js`, `app.js` | server kirish nuqtasi; `app.js` — parolni bcrypt bilan xeshlash yordamchisi |
| `routes/`, `controllers/`, `services/`, `models/` | API qatlamlari (`services/` — asosiy mantiq) |
| `services/federation/`, `routes/federation*.js` | viloyat ↔ tuman ulanishi (kalit bilan, faqat o'qish) |
| `middlewares/` | autentifikatsiya, rollar, xavfsizlik sarlavhalari va tezlik cheklovi, fayl yuklash |
| `ai/` | odam sanash (YOLOX), skelet holatlari (RTMPose), telefon nomzodlari, dalil rasmlari; modellar `ai/models/` |
| `utils/` | yordamchilar (kesh, rahbar qulfi, rasm havolalari imzosi, tarjima va h.k.) |
| `locales/` | server xabarlari tarjimalari (en, ru; uz-cyrl avtomatik) |
| `scripts/` | bir martalik/xizmat skriptlari (admin yaratish, seed, zaxira nusxa, migratsiya) |
| `tests/` | `node --test` testlari |
| `uploads/`, `private/` | yuklangan rasmlar (himoyalangan) va dalil kadrlari (git'ga kirmaydi) |

## Hik-Connect
Hodisalar va xodim/o'quvchilar (qo'shish, yangilash, o'chirish) to'g'ridan-to'g'ri Hik-Connect bulut API orqali (`services/hikevents.service.js`, `services/hik.person.service.js`); maktabda alohida proxy xizmati kerak emas. Shaxslar qurilmalarga Hik-Connect'dagi kirish huquqi (access level) orqali tushadi. Holat: `GET /api/hik/persons/status`.

## Qo'shimcha qismlar (shu papka ichida)

| Papka | Nima |
|---|---|
| `deploy/` | production: `ecosystem.config.cjs` (pm2), nginx namunasi, `.env` namunalari, tuman/viloyat o'rnatish qo'llanmasi (`deploy/README.md`) |
| `tools/federation-test/` | viloyat ↔ tuman ulanishini mahalliy sinash skriptlari |
| `tools/hik/` | Hik-Connect API bilan ishlash namuna skriptlari (Python) |
| `tools/poc-rtsp-face/` | RTSP oqimidan yuz aniqlash tajribalari (Python) |

Desktop mijoz (Electron) — `../frontend/desktop/`.

## Xavfsizlik eslatmalari
- `.env` git'ga kirmaydi.
- `/uploads` rasmlari faqat token (`?t=`), maktab proxy tokeni yoki imzolangan havola (`?sig=`) bilan beriladi.
- Productionda `NODE_ENV=production`, `FRONTEND_URL` va `TRUST_PROXY` (nginx ortida) sozlang.
