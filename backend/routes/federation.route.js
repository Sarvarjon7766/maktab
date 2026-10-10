// TUMAN serveri → VILOYAT serveri: federatsiya API (v1). FAQAT O'QISH (GET), kalit bilan (middlewares/federationAuth).
//   /ping, /schools                — ulanishni tekshirish va maktablar ro'yxati
//   /monitor/*                     — monitor hisobotlari (viloyat monitorining hamma sahifalari shu API'dan ma'lumot oladi), maxfiy maydonlar olib tashlanadi
//   /hik/*                         — jonli kamera tokeni, kadr, AI dalillari (rasm/lavha) — viloyat bevosita ko'rishi uchun
const express = require('express')
const { federationAuth } = require('../middlewares/federationAuth')
const { runWithScope, excludeInactiveSchools } = require('../utils/monitorScope')
const { servedDistricts } = require('../config/mode')
const { scrub } = require('../utils/scrub')
const schoolModel = require('../models/school.model')
const pkg = require('../package.json')

const router = express.Router()
const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Shu serverdan federatsiyaga beriladigan faol maktablar (FEDERATION_DISTRICTS bo'lsa faqat shu tumanlar). 60 soniya keshlanadi
let cache = null
async function servedSchools() {
	if (cache && Date.now() - cache.at < 60000) return cache.rows
	const filter = { isActive: { $ne: false } }
	const names = servedDistricts()
	if (names.length) filter.$or = names.map((n) => ({ district: new RegExp('^\\s*' + esc(n) + '\\s*$', 'i') }))
	const rows = await schoolModel.find(filter).select('name code region district isActive location').lean()
	cache = { at: Date.now(), rows }
	return rows
}

router.use(federationAuth)
router.use(async (req, res, next) => {
	try {
		let rows = await servedSchools()
		// ?district=Nom — viloyat serveri bitta tumanni so'rasa (bir serverda bir nechta tuman bo'lganda), javob shu tuman bilan cheklanadi
		const narrow = String(req.query?.district || '').trim()
		if (narrow) rows = rows.filter((s) => String(s.district || '').trim().toLowerCase() === narrow.toLowerCase())
		// hudud: serverdagi hamma maktab (region darajasi: /districts, /region/* ishlaydi)
		runWithScope({ region: '', district: '', schoolIds: rows.map((s) => s._id), federation: true, ...(narrow ? { narrow } : {}) }, next)
	} catch (error) {
		console.error('Federatsiya hududi xatosi:', error.message)
		res.status(500).json({ success: false, message: 'Server xatosi' })
	}
})

router.get('/ping', async (req, res) => {
	const rows = await servedSchools()
	res.json({ success: true, mode: 'district', version: pkg.version || '1', time: new Date().toISOString(), schools: rows.length, districts: [...new Set(rows.map((s) => s.district).filter(Boolean))] })
})

router.get('/schools', async (req, res) => {
	const rows = await servedSchools()
	res.json({ success: true, schools: rows.map((s) => ({ _id: s._id, name: s.name, code: s.code, region: s.region || '', district: s.district || '', location: s.location?.lat != null ? { lat: s.location.lat, lng: s.location.lng } : null })) })
})

// Monitor hisobotlari: javobdan maxfiy maydonlar chuqur olib tashlanadi
const monitor = express.Router()
monitor.use(excludeInactiveSchools)
monitor.use((req, res, next) => {
	const json = res.json.bind(res)
	res.json = (body) => json(scrub(body))
	next()
})
require('./monitor.route').register(monitor, { federation: true })
router.use('/monitor', monitor)

router.use('/hik', require('./federation.hik.route'))

router.use((req, res) => res.status(404).json({ success: false, message: 'Topilmadi' }))

module.exports = router
