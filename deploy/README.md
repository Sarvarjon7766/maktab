# School Supervision: tuman va viloyat serverlarini o'rnatish

Bitta kod, ikki rejim (`APP_MODE`). Frontend ham bitta (`npm run build`), rejimni `/api/config` dan bilib oladi.

```
Tuman serveri (har tuman uchun alohida, o'z domeni)      Viloyat serveri (bitta)
  APP_MODE=district                                         APP_MODE=region
  maktablar, kameralar, AI, davomat, bot, Excel   <──────   tumanlar reestri + viloyat monitori
  tuman superadmini + tuman monitori             HTTPS+kalit  viloyat superadmini + viloyat monitorlari
  /api/federation/v1/*  (faqat o'qish)                      kamera/AI/bot/o'quvchi bazasi YO'Q
```

## 1. Tuman serveri

1. Server: Linux, Node 22+, MongoDB 7, Nginx. `deploy/district.env.example` ni `backend/.env` qilib nusxalang, sirlarni o'zgartiring.
2. `cd backend && npm ci && node index.js` (productionda `pm2 start deploy/ecosystem.config.cjs --only district`).
3. Frontend: `cd frontend && VITE_BASE_URL= npm run build`, `dist/` ni nginx beradi (`deploy/nginx.district.conf.example`).
4. Tuman superadmini kirib: **Platforma → Viloyat ulanishi → Yangi kalit** yaratadi. Kalit (`fk_xxxxxxxx.…`) BIR MARTA ko'rsatiladi: viloyat superadminiga xavfsiz yo'l bilan beriladi.
   - Imkon bo'lsa kalitga viloyat serverining IP manzilini yozing (IP ruxsat) va nginx'da ham shu IP bilan cheklang.

## 2. Viloyat serveri

1. Alohida server (yengil: 2 yadro, 4 GB yetadi). `deploy/region.env.example` ni `backend/.env` qiling. **JWT_SECRET tuman serverlarinikidan BOSHQA bo'lsin.**
2. Bo'sh MongoDB bazasi. Viloyat superadminini yarating: `node backend/scripts/createPlatformOwner.js viloyat-admin` (parol bir marta chiqadi).
3. Viloyat superadmini kirib: **Tumanlar bilan ulanish → Tuman serverini qo'shish** (nomi, viloyat, `https://tuman.example.uz`, kalit). Server darrov tekshiriladi.
4. Tuman chegaralari (xarita): **Tumanlar** sahifasidan.
5. Viloyat monitorlari: **Viloyat monitorlari** / **Tuman monitorlari** sahifalari (monitorning hududi tuman yoki viloyat bilan cheklanadi, boshqa tuman ma'lumoti ko'rinmaydi).

## 3. Xavfsizlik (tekshiruv ro'yxati)

- [ ] Hamma joyda HTTPS (Let's Encrypt). Productionda `NODE_ENV=production`: federatsiya HTTP so'rovlarini rad etadi, HSTS yoqiladi, CORS faqat `CORS_ORIGINS`.
- [ ] Har serverda **alohida** `JWT_SECRET` va `HIK_SECRETS_KEY` (kamida 32 belgi, tasodifiy). Ularni git'ga yozmang.
- [ ] Standart parollar (`tizim123/123456` va boshqalar) almashtirilgan.
- [ ] Nginx: `/api/federation/` ga faqat viloyat serveri IP manzilidan ruxsat (`allow`/`deny`). MongoDB tashqaridan yopiq (faqat localhost).
- [ ] Federatsiya kaliti: IP ro'yxati, amal qilish muddati belgilangan; qo'yilganini **Viloyat ulanishi → Oxirgi so'rovlar** da kuzating. Shubha bo'lsa kalitni o'chiring: viloyat darrov uzilsa ham tuman ishlashda davom etadi.
- [ ] `TRUST_PROXY=1` (nginx ortida), shunda haqiqiy mijoz IP'si bilan cheklovlar ishlaydi.
- [ ] MongoDB zaxira nusxasi har kuni (`mongodump`) va tiklashni bir marta sinab ko'ring.
- [ ] Server vaqti (NTP) va vaqt zonasi `Asia/Tashkent`.

## 4. Nima viloyatga chiqadi

Faqat monitor hisobotlari (davomat sonlari, ro'yxatlar, ogohlantirishlar, kamera holati, AI jamlamalari) va so'ralganda dalil rasmi/lavha. Parollar, tokenlar, API kalitlar, Hik/Telegram kalitlari, bot ma'lumotlari javoblardan avtomatik olib tashlanadi (`utils/scrub.js`). Federatsiya API'si faqat GET qabul qiladi. Jonli video viloyat va tuman serverlaridan o'tmaydi: brauzer Hik bulutiga to'g'ridan-to'g'ri ulanadi, viloyat esa qisqa muddatli oqim tokenini tuman serveridan oladi.

## 5. Tuman uzilganda

Viloyat sahifalari qolgan tumanlar bilan ishlayveradi; javobda `partial` ro'yxati bo'ladi. Ketma-ket xato bergan tuman bir necha soniya so'ralmaydi (avtomat uzish), shuning uchun u qolgan tumanlarni sekinlashtirmaydi.
