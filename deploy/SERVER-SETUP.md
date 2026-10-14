# Serverga o'rnatish (GPU, Docker, ngrok) — qadamma-qadam

Maqsad: loyihani GPU'li Linux serverga ko'chirish, bazadagi ma'lumotlar bilan ishga tushirish va ngrok orqali tashqaridan ochish.
Hamma buyruqlarni **siz** bajarasiz; chiqqan natijani menga yuborsangiz, xatolarni birga tuzatamiz.

> **Xavfsizlik:** serverga **SSH kalit** bilan kiring (`ssh-keygen` + `ssh-copy-id`), parolni chatda yubormang. Chatda yozilgan parolni almashtiring.
> Server boshqa tizim (`visitor-counter`) bilan band — ularning konteynerlariga tegmaymiz, bizniki `faceid` nomli alohida Docker loyihasida ishlaydi.

## 0. Serverni tekshirish (SSH bilan kirgach)
```bash
nvidia-smi                     # GPU ko'rinyaptimi (RTX 5060, drayver >= 570 bo'lishi kerak)
docker --version && docker compose version
nproc && free -h && df -h /var/lib/docker
docker info | grep -i runtimes # "nvidia" bo'lsa GPU konteynerda ishlaydi
ss -ltnp | grep -E ':(8088|5050|27017)\b'   # 8088 bo'sh bo'lishi kerak (boshqasini WEB_PORT bilan o'zgartiring)
```
`nvidia` runtime yo'q bo'lsa — NVIDIA Container Toolkit o'rnating:
```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker
```
(Bu `visitor-counter` GPU'dan foydalanishiga ta'sir qilmaydi, lekin docker qayta ishga tushadi: ish vaqtida bajarmang.)

## 1. Kodni serverga olib chiqish (o'z kompyuteringizda, PowerShell)
```powershell
cd E:\Maktab
git archive --format=tar.gz -o $env:TEMP\faceid.tar.gz HEAD      # faqat commit qilingan fayllar
scp $env:TEMP\faceid.tar.gz anasxon@192.168.8.55:/home/anasxon/
```
Serverda:
```bash
mkdir -p ~/faceid && tar -xzf ~/faceid.tar.gz -C ~/faceid && cd ~/faceid
```

## 2. Bazani va rasmlarni tayyorlash (o'z kompyuteringizda)
> **MUHIM:** bazada o'quvchi/xodim shaxsiy ma'lumotlari va rasmlari bor. ngrok orqali ochilgan tizimda ular internetga chiqadi. Sinov uchun to'liq nusxa kerak bo'lmasa, avval ngrok'ni parol bilan himoyalang (7-qadam).
```powershell
cd E:\Maktab\backend
node scripts/dbExport.js $env:TEMP\faceid-db           # ~190 MB, turlar saqlanadi
Compress-Archive -Path $env:TEMP\faceid-db -DestinationPath $env:TEMP\faceid-db.zip -Force
Compress-Archive -Path uploads,private -DestinationPath $env:TEMP\faceid-files.zip -Force
scp $env:TEMP\faceid-db.zip $env:TEMP\faceid-files.zip anasxon@192.168.8.55:/home/anasxon/
```
**Shu kompyuterdagi backend'ni (nodemon) to'xtating** (yoki Hik akkauntini o'chiring): bir xil Hik-Connect akkauntini ikki joydan bir vaqtda o'qisa, hodisalar bo'linib ketadi.

## 3. Sozlamalar (serverda)
```bash
cd ~/faceid && cp deploy/env.deploy.example .env && nano .env
```
- `JWT_SECRET` — **hozirgi `backend/.env` dagi qiymat bilan bir xil** bo'lsin. Aks holda Hik akkauntlari kalitlari (shifrlangan) ochilmaydi va hamma token yaroqsiz bo'ladi.
- `HIK_SECRETS_KEY` — `backend/.env` da bor bo'lsa shuni, yo'q bo'lsa bo'sh qoldiring.
- `AI_PROVIDER=cuda,cpu`

## 4. Ishga tushirish
```bash
docker compose up -d --build
docker compose ps                  # mongo, backend (healthy), web
```

## 5. Ma'lumotlarni ko'chirish
```bash
cd ~ && unzip -o faceid-db.zip && unzip -o faceid-files.zip -d ~/faceid-files
cd ~/faceid
# baza: backend konteyneri ichidan tiklaymiz
docker cp ~/faceid-db faceid-backend-1:/tmp/db
docker compose exec backend node scripts/dbImport.js /tmp/db
# rasmlar va dalil kadrlari: nomlangan volume'larga
docker run --rm -v faceid_uploads:/u -v ~/faceid-files/uploads:/src alpine sh -c "cp -a /src/. /u/"
docker run --rm -v faceid_private:/p -v ~/faceid-files/private:/src alpine sh -c "cp -a /src/. /p/"
docker compose restart backend
```

## 6. Tekshirish
```bash
curl -s localhost:8088/api/health        # {"ok":true,...,"leader":true}
docker compose logs backend | tail -30   # "Vision:" va "MongoDB ulandi" qatorlari
docker compose exec backend nvidia-smi   # GPU konteyner ichida ko'rinyaptimi
```
GPU ishlayaptimi — AI tahlil vaqtini solishtiring (`hikvisionmetrics` dagi `ms`, yoki tizim egasi bosh sahifasidagi "AI tahlil"). CUDA ishlamasa tizim o'zi protsessorga o'tadi (jurnalda xato ko'rinadi); shunda menga jurnalni yuboring.

## 7. ngrok (himoyalangan)
```bash
ngrok http 8088 --basic-auth "login:kuchli-parol-12+belgi"
```
- Chiqqan `https://....ngrok-free.app` manzilini `.env` dagi `FRONTEND_URL` ga yozing va `docker compose up -d` qiling.
- `--basic-auth` — saytni ochishdan oldin so'raladigan qo'shimcha parol (tizimning o'z login'idan tashqari).
- Sinov tugagach ngrok'ni to'xtating.

## 8. Yuz tanishni tayyorlash va tekshirish
Yuz tanish sukut bo'yicha **o'chiq**. Biometrik ma'lumot: yoqishdan oldin ota-ona roziligi va saqlash qoidalari hal qilingan bo'lishi kerak (lex.uz'da tekshirilsin).

**Nima ko'chirilishi kerak** (aks holda server bo'sh yuz bazasi bilan ishga tushadi):
- `backend/ai/models/` ichidagi **YuNet** (`face_detection_yunet_2023mar.onnx`) va **SFace** (`face_recognition_sface_2021dec.onnx`). Git'ga qo'shilganini tekshiring (`git ls-files backend/ai/models`).
- Ixtiyoriy kuchli model (faqat GPU serverda): `face_recognition_arcface_r100.onnx` (~250 MB, git'ga kirmaydi, qo'lda nusxalanadi; `AI sozlamalari → Yuz izi modeli`).
- **Baza** (`dbExport.js`/`dbImport.js` hamma kolleksiyani, jumladan `facetemplates`, `classroompresences`, `staffpresences` ni ko'chiradi) **va `uploads/` papkasi** (yuz suratlari: o'quvchi/xodim asosiy va qo'shimcha suratlari, `face-*.jpg`). Bazani ko'chirib, uploads'ni ko'chirmasangiz izlar ishlaydi, lekin «Qaytadan olish» surat topolmaydi.

**GPU:** `.env` da `AI_PROVIDER=cuda,cpu` (Linux) yoki `dml,cpu` (Windows). Ishlaganini `faceCheck` ko'rsatadi (tezlik).

**Tayyorlik tekshiruvi** (serverda, backend papkasida yoki konteyner ichida):
```bash
node scripts/faceCheck.js
```
U tekshiradi: model fayllari va yuklanishi (tezlik), baza va indekslar, uploads'dagi suratlar, **bazadagi izlar shu serverdagi model bilan mosligi** (suratdan qayta hisoblab solishtiradi; ≥0.90), sozlamalar, sinflar qamrovi (izi bor o'quvchilar ≥80%), kameralar (darvoza belgilanganmi), xotira bahosi. XATO bo'lsa chiqish kodi 1.

**Ishga tushirish tartibi:**
1. `node scripts/faceCheck.js` — XATO yo'qligini tasdiqlang.
2. O'quvchi/xodimlarga 3–5 tadan aniq rasm yuklang (o'quvchi kartasi yoki `node scripts/faceImport.js <maktabId> <papka>`), «Yuz tanish» sahifasida **«Suratlardan baza yaratish»**.
3. **AI sozlamalari → Yuz tanishni yoqish** (davomat hali o'chiq qoladi).
4. Bitta kamerada **«Jonli sinov»** sahifasida tekshiring: kadr o'lchami, yuz pikseli (≥60 px yaxshi), o'xshashlik.
5. Bir necha kun «Yuz tanish» jadvalidagi ✓/✗ bilan aniqlikni o'lchang. Faqat shundan keyin kichik sinfda **«Yuz tanilganda «kirdi» yozish»** ni yoqing.
6. Darvoza kamerasi: zal kamerasi → «Chiqish (darvoza)». Eslatma: bulut snapshoti (10–15 s) tez o'tgan odamni ushlamasligi mumkin, ishonchli chiqish uchun FaceControl terminali tavsiya etiladi.

## 9. AI yukini cheklash (backend bosim ostida qolmasligi uchun)
AI hisob-kitoblari alohida ish oqimlarida (worker thread) ishlaydi, shuning uchun backend so'rovlarini **bloklamaydi**, lekin **bir xil CPU'ni bo'lishadi** (4 yadroli sinovda og'ir AI yukida login 319→423 ms, fayl o'qish p99 1.7→62 ms). Tavsiyalar:
- `AI_THREADS` — bitta AI sessiyasi uchun yadrolar (standart: yadrolarning yarmi). Backend sekinlashsa kamaytiring.
- `UV_THREADPOOL_SIZE=8` (yoki 16) — Node ichki oqimlar puli (sharp, bcrypt, fayl). Standart 4, bu AI bilan band bo'lib login'ni sekinlashtirishi mumkin.
- `AI_LIVE_QUEUE_MAX=6` — «Jonli sinov» navbati shundan oshsa yangi kadr 429 bilan rad etiladi (ko'p foydalanuvchi bir vaqtda ochsa).
- `AI_TIMEOUT_MS` — AI so'rovi shuncha kutilgach (standart 90 s) bekor qilinadi, ketma-ket 2 marta bo'lsa AI oqimi qayta ishga tushadi.
- Docker: backend konteyneriga `cpus` va `mem_limit` bering (docker-compose.yml), eng yaxshisi AI bor serverni alohida konteyner/serverda ishlating.
- Tahlil tezligi: `intervalSec` va `deviceParallel` (AI sozlamalari). Tahlil sikli ketma-ket ishlaydi, shuning uchun navbat to'planib ketmaydi, faqat sikl uzayadi.
- `AI_WORKERS` — fon tahlili uchun AI ishchi oqimlar soni (standart 1), `AI_LIVE_WORKERS` — jonli sinov uchun (standart 1). Modelning o'zi GPU'da tez, lekin rasmni dekod qilish/qirqish CPU'da va bitta ishchi oqimda ketma-ket bajariladi: GPU serverda `AI_WORKERS`ni yadrolar soniga yaqin qiling (CPU'da 4 yadroli sinov: yuz tanish 1.63 → 2.35 kadr/s, 2 ishchi bilan). `AI_THREADS` ni shunga mos kamaytiring (yadrolar / ishchilar). Holatni `ai/aiPool.stats()` ko'rsatadi.
- **GPU haqiqatan ishlayaptimi:** Linux'da `npm ci` (Dockerfile ichida) `onnxruntime-node` ning CUDA 12 kutubxonalarini (`libonnxruntime_providers_cuda.so`) NuGet'dan o'zi yuklaydi: build vaqtida internet kerak. `AI_PROVIDER=cuda,cpu` da CUDA yuklanmasa **jimgina CPU'ga o'tadi**. Tekshirish: konteynerda `nvidia-smi` ni ishlatib turib `node scripts/faceCheck.js` yurgizing, jarayon GPU xotirasida ko'rinishi va yuz tanish tezligi CPU'dagidan ancha yuqori bo'lishi kerak. RTX 5060 (Blackwell) bilan mosligi bu kompyuterda sinalmagan.

## 10. Katta tizim uchun tahlil rejasi (kamera turi bo'yicha)
**Platforma → AI sozlamalari** da (0 = umumiy `intervalSec`, ya'ni sozlanmasa xatti-harakat o'zgarmaydi):
- `gateIntervalSec` — darvoza (chiqish) kamerasi, tavsiya **15–30 s**; darvoza kameralari har siklda birinchi navbatda tahlil qilinadi.
- `classIntervalSec` — sinfxona kamerasi, katta tizimda tavsiya **180–300 s**.
- `hallIntervalSec` — zal/koridor kamerasi.
- `poseEveryN` — skeletni har N-tahlilda hisoblash (tavsiya 3–5: CPU ~30–40% tejaladi).
- `shedLagMs` (standart 300) — backend (event loop) kechikishi shundan oshsa, darvozadan boshqa kameralar tahlili vaqtincha to'xtaydi, sikl o'zi tiklanadi (jurnalda «Vision: yuklama yuqori»). `GET /api/health` da `eventLoopMs` ni ko'rishingiz mumkin.
- Bir vaqtdagi qurilmalar: `deviceParallel`. Hik bulutining so'rov limitini avval sinab ko'ring, so'ng oshiring.
