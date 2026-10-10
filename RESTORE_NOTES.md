# Tiklash eslatmalari

Loyiha Claude sessiya tarixidan tiklangan: Write/Edit/Read yozuvlari **va Bash buyruqlari** (`cat > fayl <<EOF`, python/node/sed
tuzatish skriptlari, vaqtincha skriptlar) yopiq sandbox'da qayta ijro etilgan. Qo'shimcha manba: `Desktop\faceumumiy` (eski nusxa).
Fayl boshida "DIQQAT" izohi bor fayllar to'liq tiklanmagan yoki qayta yozilgan.

## Ishga tushirish
- Backend: `cd backend && npm run dev` (port 5050, `.env` dagi MONGO_URI). Rejim: `APP_MODE=district` (standart) yoki `region`.
- Frontend: `cd frontend && npm run dev` (`frontend/.env`: VITE_BASE_URL=http://localhost:5050). `npm run build` xatosiz o'tadi.
- AI odam sanash: `backend/ai/models/yolox_s.onnx` va `backend/ai/fonts/NotoSans-Bold.ttf` ochiq manbalardan qayta yuklab olingan.

## Haqiqiy ma'lumot bilan tekshirilgan (faqat o'qish so'rovlari)
Hik akkaunti va 38 kamera, 12-maktab: 12 sinf, sinfxona tahlili (ball, omillar, dars soatlari 8–18), aqlli kuzatuv (bugun 67 lahza,
16 muhim hodisa), monitor (37 maktab), hisobot markazi (21 tur), grade/district/federatsiya, setup holati.
Hik bulutiga tegadigan so'rovlar (jonli ko'rish, kadr olish) tekshirilmadi.

## Hali to'liq emas (tekshirib chiqing)
- `services/user.service.js` — eski nusxa (`faceumumiy`) asosida, ko'p-maktab (schoolId) tuzatishlari qo'lda; asl nusxaning boshi yo'q
- `services/school.service.js` — asl nusxa, lekin oxiri (admin boshqaruvi, impersonation loglari, findByRawToken) qayta yozilgan
- `pages/monitor/monitorKit.jsx` — asl boshi + kesilgan qismdagi komponentlar qayta yozilgan
- Stub: `PlatformStatistics`, `AdminAdmins`, `MonitorClassroomAnalysis`, `BrandLogo`, `GlobalPhotoViewer`, `PersonPhotoPreview`
- `AdminUserEntryExit`, `AdminUserUpdate`, `AdminUsers`, `AdminSidebar`, `GlobalCommentModal` — eski nusxa bilan birlashtirilgan
- `monitor.route.js`: `person/search/districts/schools-compare/dashboard` kodi tiklanmagan bo'lishi mumkin — tekshiring
- Yo'q: `uploads/` (rasmlar), `frontend/public/` (logo, PWA ikonkalari), `locales/uz-cyrl.json` (avtomatik transliteratsiya ishlaydi)

Eski qo'lda tuzatilgan variant: `E:\Maktab\faceid-restored-manual` (zaxira).
