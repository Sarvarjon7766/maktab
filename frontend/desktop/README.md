# FaceControl — desktop mijoz (Electron)

Web tizimni (frontend) alohida oynada ochadigan Windows ilovasi: server manzili va token shifrlangan holda saqlanadi, yangilanish `version.json` orqali tekshiriladi.

Bu papka frontend'ning bir qismi, lekin `src/` va Vite build'iga kirmaydi (alohida `package.json`).

```bash
cd frontend/desktop
npm install
npm start        # ishga tushirish
npm run build    # Windows o'rnatuvchi (NSIS) -> dist/
```

- `main.js` — asosiy jarayon, `preload.js` / `settings-preload.js` — xavfsiz ko'prik, `settings.html` — sozlamalar oynasi.
- `version.json` — joriy versiya va yuklab olish manzili.
