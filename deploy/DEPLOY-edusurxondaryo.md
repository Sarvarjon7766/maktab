# edusurxondaryo.uz: serverga to'liq yuklash ketma-ketligi

Server: Ubuntu 22.04, i5-14400F (16 oqim), 62 GB RAM, RTX 5060 Ti 16 GB (`glm-vllm` ~8 GB band qilgan), Docker + Compose + NVIDIA runtime, nginx 80/443 da.
Tizim: `docker compose` (mongo + backend + web). Tashqaridan kirish: **domen → server nginx (HTTPS) → 127.0.0.1:8088 (web konteyner) → backend**.

Har qadamdan keyin «Tekshirish» bandini bajaring, o'tmasa keyingisiga o'tmang.

---
## 0. Boshlashdan oldin (serverda, bir marta)
```bash
# DNS: domen shu serverning ommaviy IP manziliga qaraydimi?
curl -s https://api.ipify.org; echo
getent hosts edusurxondaryo.uz www.edusurxondaryo.uz     # ikkalasi ham yuqoridagi IP chiqishi kerak (dig o'rnatilgan bo'lsa: dig +short ...)
# nginx va certbot
sudo nginx -t && systemctl is-active nginx
which certbot || sudo apt-get install -y certbot python3-certbot-nginx
# portlar (8088 va 5050 bo'sh bo'lsin)
ss -ltnp | grep -E ':(8088|5050)\b' || echo "bo'sh"
# GPU va Docker
nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv
docker compose version
```
**Tekshirish:** DNS to'g'ri IP ko'rsatadi, `nginx -t` OK, 8088/5050 bo'sh, `nvidia-smi` ishlaydi.
Server NAT/router ortida bo'lsa, 80 va 443 portlar shu serverga yo'naltirilgan bo'lishi kerak (sertifikat olish uchun ham).

## 1. Kodni olish
```bash
cd ~ && git clone -b feature/hikconnect-platform-overhaul https://github.com/Sarvarjon7766/maktab.git maktab
cd maktab && git log --oneline -1
```
Repo yopiq bo'lsa autentifikatsiya so'raydi: **parolni emas**, GitHub token yoki SSH deploy kalitdan foydalaning.
**Tekshirish:** `ls backend/ai/models` da `face_detection_yunet_2023mar.onnx` va `face_recognition_sface_2021dec.onnx` bor.

## 2. Sozlamalar (.env)
```bash
cp deploy/env.deploy.example .env
openssl rand -hex 32            # JWT_SECRET uchun
nano .env
```
`.env`:
```
JWT_SECRET=<yuqoridagi qiymat>
HIK_SECRETS_KEY=                         # bo'sh: JWT_SECRET ishlatiladi. Eski bazadan Hik akkauntlarni ko'chirsangiz, eski serverdagi qiymat bilan BIR XIL
FRONTEND_URL=https://edusurxondaryo.uz,https://www.edusurxondaryo.uz
WEB_PORT=8088
AI_PROVIDER=cuda,cpu
AI_WORKERS=3
AI_THREADS=2
UV_THREADPOOL_SIZE=8
BACKEND_MEM_LIMIT=12g
```
`.env` ni hech qachon git'ga qo'shmang (`.gitignore` da bor). `FRONTEND_URL` aniq `https://` bilan bo'lishi shart: production'da CORS faqat shu manzillarga ruxsat beradi.

## 3. Ishga tushirish
```bash
docker compose up -d --build           # birinchi build 10–20 daqiqa (CUDA image ~3 GB + kutubxonalar)
docker compose ps                      # mongo va backend: healthy, web: Up
docker compose logs --tail 40 backend  # «MongoDB ulandi», «Server http://localhost:5050 da ishga tushdi»
```
**Tekshirish:**
```bash
curl -s http://127.0.0.1:8088/api/health        # {"ok":true,...}
curl -sI http://127.0.0.1:8088/ | head -1        # HTTP/1.1 200
```
Ochiq HTTP (8088) tashqariga chiqmaydi: faqat 127.0.0.1 da tinglaydi (kerak bo'lsa `WEB_BIND=0.0.0.0`).

## 4. GPU va AI tekshiruvi
```bash
docker compose exec backend node scripts/faceCheck.js
nvidia-smi        # «node» jarayoni GPU xotirasida ko'rinishi kerak (bizniki ~1–3 GB, glm-vllm ~8 GB)
```
**Tekshirish:** `faceCheck` da XATO yo'q (ogohlantirish: bo'sh baza, darvoza kamerasi, qamrov: hozircha normal). Tezlik: SFace ~ bir necha ms/yuz bo'lsa GPU ishlayapti; CPU darajasida (~20+ ms) bo'lsa jarayon `nvidia-smi` da ko'rinmaydi: CUDA yuklanmagan va jimgina CPUga o'tgan (RTX 5060 Ti bilan moslik sinalmagan).

## 5. Domen va HTTPS (server nginx)
```bash
sudo cp deploy/nginx-edusurxondaryo.conf /etc/nginx/sites-available/edusurxondaryo.uz
sudo ln -s /etc/nginx/sites-available/edusurxondaryo.uz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
curl -sI http://edusurxondaryo.uz/ | head -1          # 200
sudo certbot --nginx -d edusurxondaryo.uz -d www.edusurxondaryo.uz     # email so'raydi, HTTP→HTTPS yo'naltirishni tanlang
sudo systemctl status certbot.timer                    # avtomatik yangilanish
```
**Tekshirish:** brauzerda `https://edusurxondaryo.uz` ochiladi (login sahifasi), qulf belgisi bor. `curl -s https://edusurxondaryo.uz/api/health` ishlaydi.
Boshqa saytlar (shu nginx'da) ishlashda davom etadi: bizning blok faqat shu `server_name` uchun.

## 6. Birinchi kirish
```bash
docker compose exec backend node scripts/createPlatformOwner.js platform-owner
```
Parol **bir marta** chiqadi, darhol yozib oling (saqlang, chatga yubormang). Login: `platform-owner`. Kirgach parolni o'zingiznikiga almashtiring.
Keyin (panel orqali): **Hik-Connect akkauntlar** qo'shing → kameralar sinxronlanadi → maktablar, sinflar, o'quvchi/xodimlarni (Excel import) kiriting.
**Dev bazadagi sinov ma'lumotni (MOCK/seed) ko'chirmang**: toza baza bilan boshlang.

## 7. Yuz tanishni bosqichma-bosqich yoqish (xavfsiz tartib)
`deploy/SERVER-SETUP.md` 8–10-bo'limlar. Qisqa:
1. O'quvchi/xodimlarga 3–5 tadan aniq rasm yuklang → «Yuz tanish» sahifasida **«Suratlardan baza yaratish»**.
2. **Platforma → AI sozlamalari → Yuz tanishni yoqish** (davomat o'chiq).
3. **Jonli sinov** sahifasida bitta kamerada tekshiring (yuz ≥ 60 px, o'xshashlik).
4. Bir necha kun ✓/✗ bilan aniqlikni o'lchang. Faqat shundan keyin kichik sinfda **davomatga yozish**ni yoqing.
5. Darvoza kamerasi: Kamera sozlamalari → zal kamerasi → «Chiqish (darvoza)». Katta tizim uchun tahlil oraliqlari (SERVER-SETUP 10-bo'lim).
Biometrik ma'lumot va ota-ona roziligi masalasi lex.uz'da tekshirilishi kerak (men tekshirmaganman).

## 8. Zaxira nusxa (kunlik, cron)
```bash
mkdir -p ~/backups
cat > ~/backups/backup.sh <<'EOF'
#!/bin/bash
set -e
D=$(date +%F); cd ~/maktab
docker compose exec -T mongo mongodump --archive --gzip --db faceid > ~/backups/faceid-$D.archive.gz
docker run --rm -v faceid_uploads:/u -v ~/backups:/b alpine tar czf /b/uploads-$D.tgz -C /u .
find ~/backups -type f -mtime +14 -delete
EOF
chmod +x ~/backups/backup.sh && ~/backups/backup.sh && ls -la ~/backups     # birinchi marta qo'lda sinang
( crontab -l 2>/dev/null; echo "30 3 * * * ~/backups/backup.sh >> ~/backups/backup.log 2>&1" ) | crontab -
```
Zaxirada o'quvchi/xodim rasmlari va yuz izlari bor (shaxsiy ma'lumot): papkaga faqat o'zingiz kira oling (`chmod 700 ~/backups`), kerak bo'lsa boshqa serverga ham nusxalang.
Tiklash: `docker compose exec -T mongo mongorestore --archive --gzip --drop < faceid-YYYY-MM-DD.archive.gz`.

## 9. Kuzatuv
```bash
docker compose ps
docker compose logs -f --tail 50 backend       # xatolar
curl -s https://edusurxondaryo.uz/api/health   # rssMB, eventLoopMs (p99 < 100 ms bo'lsa yaxshi)
docker stats --no-stream                       # CPU/xotira (backend 12g chegarasi)
nvidia-smi                                     # GPU xotirasi (glm-vllm bilan bo'lishiladi)
```

## 10. Yangilash va orqaga qaytarish
```bash
cd ~/maktab && git pull && docker compose up -d --build
# muammo bo'lsa: oldingi commitga qaytish
git log --oneline -5 && git checkout <oldingi-commit> && docker compose up -d --build
```
Yangilashdan oldin `~/backups/backup.sh` ni ishga tushiring.

## Tez-tez uchraydigan muammolar
| Alomat | Sabab / yechim |
|---|---|
| Sahifa ochiladi, lekin login «Network Error» | `FRONTEND_URL` aniq `https://edusurxondaryo.uz` bilan bo'lmagan (CORS). `.env` ni tuzatib `docker compose up -d` |
| 502 Bad Gateway | web konteyner ishlamayapti yoki port boshqa: `docker compose ps`, `curl 127.0.0.1:8088` |
| 413 Request Entity Too Large | server nginx blokida `client_max_body_size 25m` yo'q |
| Barcha foydalanuvchilar «So'rovlar juda ko'p» (429) | `X-Forwarded-For` to'g'ri uzatilmagan: nginx blokidagi `proxy_set_header` satrlari va `TRUST_PROXY=2` ni tekshiring |
| Jonli video ochilmaydi | Hik akkaunt/kamera online emasmi; sahifa HTTPS'dami; `docker compose logs backend` da «Hik live xatosi» |
| `faceCheck`: tezlik CPU darajasida | CUDA yuklanmagan: `docker compose logs backend`, `nvidia-smi` da jarayon yo'q. GPU sozlamasi: `docker-compose.yml` `deploy.resources.reservations.devices` |
| Konteyner o'ladi (OOM) | `BACKEND_MEM_LIMIT` ni oshiring yoki `AI_WORKERS` ni kamaytiring |
