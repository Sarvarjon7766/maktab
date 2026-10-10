# ai/ — sinfxonada odam sanash

Kadrdagi odamlar sonini sanaydi (YOLOX-s, ONNX, CPU). **Yuz tanilmaydi**, faqat son.

- Model: `ai/models/yolox_s.onnx` (Megvii YOLOX, Apache-2.0, ~36 MB). Yo'q bo'lsa yuklab oling:
  `https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx`
- Zanjir: `services/vision.service.js` har `VISION_INTERVAL_SEC` (60) soniyada `visionEnabled` kameralardan
  Hik-Connect `capturePic` kadrini oladi -> `personDetector.detectPeople` -> `HikVisionMetric`.
- Kamerada yoqish: maktab admini Kameralar sahifasida kamerani sinfga biriktirib, "odamlar sonini sanash"ni belgilaydi.
- Sozlamalar (.env, ixtiyoriy): `VISION_ENABLED=0` (butunlay o'chirish), `VISION_INTERVAL_SEC`,
  `PERSON_SCORE` (0.35, ishonch chegarasi), `PERSON_CONTAINED` (0.7, ikki karra sanashni yo'qotish), `PERSON_MODEL_PATH`.
- Tezlik: 1 kadr ~1 s (CPU, 5 ta bo'lak: butun kadr + 4 ta burchak). Faqat 06:00–20:00 (Toshkent) da ishlaydi.
- Kadr: kameraning faqat oxirgi tahlil kadri `private/hik-vision/<cameraId>.jpg` da saqlanadi (ustiga yoziladi), `/api/hik/vision/frame/:id` orqali ruxsat tekshiruvi bilan beriladi.
- Metrikalar 60 kundan keyin avtomatik o'chadi.
