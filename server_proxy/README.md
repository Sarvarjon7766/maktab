# server_proxy — ko'p maktabli joylashtirish

Backend endi bitta tashkilot uchun emas, **ko'plab maktablarga xizmat
ko'rsatadigan platforma**. `server_proxy`ning o'zida bironta ham kod
o'zgarishi shart emas — u har doimgidek `config.json`dagi
`backend.base_url` va `backend.token` orqali ishlaydi. O'zgargan narsa
faqat **joylashtirish modeli**:

## Asosiy qoida

- **`backend.base_url`** — barcha maktablar uchun **bir xil**, umumiy
  serverga ishora qiladi (masalan `https://faceid.sizning-domeningiz.uz`).
- **`backend.token`** — har bir maktabning **o'zining alohida** tokeni.
  Bitta `server_proxy` nusxasi (bitta kompyuter/tarmoq) — bitta maktab.
  Boshqa maktabning tokenini shu yerga qo'ysangiz, backend hech qanday
  xodim/o'quvchi ma'lumotini qaytarmaydi (404 "topilmadi") — bu ataylab
  shunday: bir maktabning kameralari boshqa maktabning ma'lumotiga
  umuman kira olmasligi kerak.

## Yangi maktab uchun sozlash

1. Platforma egasi (superadmin) `/platform` panelida yangi maktab
   yaratadi (yoki mavjud maktab uchun "Tokenni yangilash" tugmasini
   bosadi).
2. Ekranda ko'rsatilgan token **faqat bir marta** ko'rinadi — darhol
   nusxalab, shu maktabning `server_proxy/config.json` fayliga
   yozing:
   ```json
   "backend": {
     "base_url": "https://faceid.sizning-domeningiz.uz",
     "token": "<platform panelidan olingan token>"
   }
   ```
3. `devices` ro'yxatiga faqat shu maktabning kameralarini kiriting
   (yoki admin panelidan kameralarni qo'shib, `GET /api/camera/devices`
   orqali avtomatik olinishini kutib turing).
4. `server_proxy`ni odatdagidek ishga tushiring — kod o'zgarishi shart
   emas.

## Eslatma

- Token yo'qolib qolsa yoki buzilgan deb gumon qilinsa, platforma
  panelidan "Tokenni yangilash" bosiladi — eski token SHU ZAHOTI
  ishlamay qoladi, yangisi `config.json`ga qo'lda yozilishi kerak.
- Bitta jismoniy kompyuter bir nechta maktabga xizmat qilishi kerak
  bo'lsa (masalan bitta IT markazi bir nechta maktabni boshqarsa),
  har bir maktab uchun **alohida** `server_proxy` jarayoni (alohida
  `config.json`, alohida port) ishga tushiriladi.

