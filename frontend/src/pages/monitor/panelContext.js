// Panel konteksti ALOHIDA va kichik modul: u deyarli o'zgarmaydi, shuning uchun Vite dev serverida (HMR) uning ikki nusxasi paydo bo'lmaydi.
// Avval u monitorKit.jsx ichida edi; monitorKit tahrirlanganda Provider (SchoolStatsShell) eski nusxani, sahifalar yangisini import qilib,
// kontekst yo'qolardi va sahifalar noto'g'ri /api/monitor ga murojaat qilib "Ma'lumotni yuklab bo'lmadi" chiqarardi.
import { createContext, useContext } from 'react'

// api — so'rov prefiksi (/api/<api>/...): monitor (butun tizim), school-stats (maktab paneli) yoki viewer-stats (o'qituvchi/rahbar)
// base — havolalar prefiksi (/monitor, /user, /admin, /platform/schools/:id), scoped — bitta maktab rejimi
export const PanelContext = createContext({ api: 'monitor', base: '/monitor', scoped: false, viewer: false })
export const usePanel = () => useContext(PanelContext)
