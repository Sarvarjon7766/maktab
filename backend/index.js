const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const path = require('path')
const multer = require('multer')
const startCronJobs = require("./middlewares/cronjob")
const { MODE, isRegion } = require('./config/mode')
const fs = require('fs')

dotenv.config()

// JWT_SECRET majburiy: bo'sh/qisqa kalit bilan token imzolash xavfsiz emas (va Hik kalitlari shifrlash kaliti ham undan olinadi)
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error("JWT_SECRET .env faylida o'rnatilmagan yoki juda qisqa (kamida 16 belgi kerak). Server ishga tushmaydi.")
  process.exit(1)
}

// Kutilmagan promise rad etilishi/xato serverni butunlay yiqitib
// qo'ymasligi uchun — bir joydagi xato (masalan e'tiborsiz qoldirilgan
// await) butun tizimni to'xtatib qo'ymasin, faqat log qilinsin.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
})

const app = express()
app.disable('x-powered-by')
// Nginx/yuk balansi ortida haqiqiy mijoz IP'sini bilish uchun (TRUST_PROXY=1): federatsiya IP ro'yxati va tezlik cheklovi shunga tayanadi
if (process.env.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY)
const PORT = process.env.PORT || 5000
const connectMainDB = require('./config/db')
const mongoose = require('mongoose')

// CORS cheklovi olib tashlandi — barcha manzillardan so'rovga ruxsat
// beriladi (dev/LAN muhitida turli portlar/mobil ilova bilan ishlash
// qulayligi uchun). DIQQAT: tizim ochiq internetga chiqarilsa (public
// domen/HTTPS), bu qaytadan FRONTEND_URL asosida cheklanishi kerak.
app.use(cors())
app.use(require('compression')())
app.use(express.json())
app.use(require('./utils/i18n').langMiddleware)

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '1h', setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }))


const { userrouter, sinfrouter, graderouter, schoolstatsrouter, viewerstatsrouter, eventroute, camerarouter, commentrouter, employeesyncrouter, settingsrouter, schoolrouter, schoolmerouter, studentrouter, platformsettingsrouter, monitorrouter, hikrouter, monitoruserrouter, parentrouter, reportcenterrouter, districtrouter } = require('./routes/index')
app.use('/api/user', userrouter)
if (!isRegion) app.use('/api/sinf', sinfrouter)
if (!isRegion) app.use('/api/grades', graderouter)
if (!isRegion) app.use('/api/school-stats', schoolstatsrouter)
if (!isRegion) app.use('/api/viewer-stats', viewerstatsrouter)
if (!isRegion) app.use('/api/events', eventroute)
if (!isRegion) app.use('/api/camera', camerarouter)
if (!isRegion) app.use('/api/comment', commentrouter)
if (!isRegion) app.use('/api/employees', employeesyncrouter)
if (!isRegion) app.use('/api/settings', settingsrouter)
if (!isRegion) app.use('/api/schools', schoolrouter)
if (!isRegion) app.use('/api/school', schoolmerouter)
if (!isRegion) app.use('/api/student', studentrouter)
app.use('/api/platform-settings', platformsettingsrouter)
app.use('/api/monitor', isRegion ? require('./routes/region.monitor.route') : monitorrouter)
app.use('/api/hik', isRegion ? require('./routes/region.hik.route') : hikrouter)
app.use('/api/monitor-users', monitoruserrouter)
if (!isRegion) app.use('/api/parents', parentrouter)
if (!isRegion) app.use('/api/report-center', reportcenterrouter)
app.use('/api/districts', districtrouter)

// Login-oldi, auth talab qilmaydigan PLATFORMA (bitta maktab EMAS)
// brendingi — login-keyingi maktabga xos ma'lumot uchun GET /api/school/me
// ishlatiladi (school.controller.js'ning me() metodi). Endi bazadan
// (PlatformSettings) o'qiydi — superadmin tahrirlashi mumkin, .env faqat
// birinchi marta hujjat yaratilganda standart qiymat sifatida ishlatiladi
// Rejimga xos yo'llar
if (isRegion) {
  app.use('/api/federation-admin', require('./routes/federation.admin.route')) // viloyat: tumanlar reestri
} else {
  app.use('/api/federation/v1', require('./routes/federation.route')) // tuman: viloyat uchun faqat o'qish API
  app.use('/api/federation-keys', require('./routes/federation.keys.route')) // tuman superadmini: kalitlarni boshqarish
}

app.get('/api/config', async (req, res) => {
  try {
    const platformSettingsService = require('./services/platform.settings.service')
    const settings = await platformSettingsService.getOrCreate()
    res.json({
      platformName: settings.platformName,
      supportPhone: settings.supportPhone,
      mode: MODE
    })
  } catch (error) {
    console.error(error)
    res.json({
      platformName: process.env.PLATFORM_NAME || 'FaceID',
      supportPhone: process.env.SUPPORT_PHONE || ''
    })
  }
})

// Noma'lum /api/* yo'llar uchun JSON 404 (xato ishlovchisidan oldin)
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Topilmadi' }))

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: 'Fayl yuklashda xatolik: ' + err.message
    })
  }
  // upload.js/uploadExcel.js'dagi fileFilter noto'g'ri fayl turida oddiy
  // Error tashlaydi (MulterError emas) — shuni ham to'g'ri 400+JSON bilan
  // qaytaramiz
  const message = String(err && err.message)
  if (message.startsWith('Faqat rasm fayllarini yuklash mumkin!') || message === 'Faqat .xlsx formatidagi fayllarni yuklash mumkin!') {
    return res.status(400).json({ success: false, message })
  }
  // body-parser va boshqa 4xx xatolar (noto'g'ri JSON, juda katta so'rov va h.k.)
  const status = Number(err && (err.status || err.statusCode))
  if (status >= 400 && status < 500) {
    return res.status(status).json({ success: false, message: status === 413 ? "So'rov hajmi juda katta" : "So'rov noto'g'ri" })
  }
  console.error(err && err.stack || err)
  res.status(500).json({ success: false, message: 'Serverda xatolik yuz berdi!' })
})
const uploadDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir)
  console.log('Uploads papkasi yaratildi')
}

let server = null
let cronHandle = null
let shuttingDown = false

// Markaziy to'xtatish: cron/pollerlar, HTTP server, MongoDB — keyin chiqish (10s da majburan).
// Boshqa joylarda (parent.service) o'rnatilgan once-handlerlar standart chiqishni to'xtatadi, shuning uchun process.exit shu yerda
const shutdown = async (signal) => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} qabul qilindi, to'xtatilmoqda...`)
  const force = setTimeout(() => { console.error('To\'xtatish vaqti tugadi, majburan chiqilmoqda'); process.exit(1) }, 10000)
  try {
    try { cronHandle && cronHandle.stop && cronHandle.stop() } catch (e) { console.error('Cron to\'xtatish xatosi:', e.message) }
    if (server) await new Promise((resolve) => { server.close(() => resolve()); server.closeIdleConnections && server.closeIdleConnections() })
    await mongoose.connection.close()
  } catch (e) {
    console.error('To\'xtatishda xatolik:', e.message)
  } finally {
    clearTimeout(force)
    process.exit(0)
  }
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

const bootstrap = async () => {
  try {
    await connectMainDB()
  } catch (err) {
    console.error('❌ MongoDB ga ulanib bo\'lmadi, chiqilmoqda:', err.message)
    process.exit(1)
  }
  server = app.listen(PORT, () => {
    console.log(`🚀 Server http://localhost:${PORT} da ishga tushdi`)
  })
  // Fon vazifalari (kamera so'rovi, AI, bot, hisobotlar) faqat TUMAN rejimida; DISABLE_BACKGROUND=1 — sinov uchun o'chirish
  if (!isRegion && process.env.DISABLE_BACKGROUND !== '1') cronHandle = startCronJobs()
  console.log(`Rejim: ${MODE}${process.env.DISABLE_BACKGROUND === '1' ? ' (fon vazifalari o\'chiq)' : ''}`)
}
bootstrap()
