import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'pwa-192x192.png', 'favicon.png', 'favicon-32.png', 'logo.png', 'logo-256.png'],
      workbox: {
        // Standart 2 MiB chegara — recharts kabi kutubxonalar qo'shilgach
        // asosiy bundle shundan oshib qoldi, service-worker precache
        // bosqichi xato berardi.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      // Telefonga "ilova" sifatida o'rnatiladi (Chrome: ⋮ → Ilovani o'rnatish; iPhone: Ulashish → Asosiy ekranga)
      manifest: {
        name: 'School Supervision: maktab davomati va aqlli kuzatuv',
        short_name: 'School Supervision',
        description: "Maktab davomati, sinfxonalar tahlili va aqlli kuzatuv",
        lang: 'uz',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        // Katta kutubxonalar alohida, uzoq keshlanadigan chunklarga ajratiladi.
        // exceljs / ezuikit-js ataylab bu yerda yo'q: ular dynamic import orqali kech yuklanadi.
        manualChunks(id) {
          // Vite yordamchilari (preload helper, commonjs helpers) entry'dan ham kerak:
          // ularni og'ir 'export'/'charts' chunklariga tushib qolishdan saqlaymiz.
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers') || id.includes('vite/modulepreload-polyfill')) return 'react'
          if (!id.includes('node_modules')) return
          if (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|clsx)[\\/]/.test(id)) return 'react'
          if (/node_modules[\\/](recharts|recharts-scale|victory-vendor|d3-[^\\/]+|internmap)[\\/]/.test(id)) return 'charts'
          if (/node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/.test(id)) return 'maps'
          if (/node_modules[\\/](jspdf|jspdf-autotable|html2canvas|xlsx-js-style|xlsx)[\\/]/.test(id)) return 'export'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://admininteractive.ssuv.uz',
        changeOrigin: true,
        secure: false
      }
    }
  }
})

