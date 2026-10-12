const express = require('express')
const router = express.Router()
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const HikService = require('../services/hikconnect.service')
const HikEvents = require('../services/hikevents.service')
const Snapshots = require('../services/hik.snapshot.service')
const Classroom = require('../services/hik.classroom.service')
const Vision = require('../services/vision.service')
const { isDate } = require('../utils/dateStr')
const { fresh } = require('../utils/ttlCache')
// Bir maktabning bir nechta admini bir xil sahifani ochib tursa (har 15-20 soniyada so'raladi) hisob-kitob 5 soniya ichida BIR marta bajariladi
const SHORT_MS = 5000

const handle = (fn) => async (req, res) => {
	try {
		const result = await fn(req)
		return res.status(result.success ? 200 : 400).json(result)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
}
const owner = [verifyToken, requireRole('superadmin')]

// Tizim egasi: Hik akkauntlari (bir nechta bo'lishi mumkin)
router.get('/accounts', ...owner, handle(() => HikService.accountsOverview()))
router.post('/accounts', ...owner, handle(async (req) => {
	const saved = await HikService.saveAccount(req.body || {})
	if (!saved.success) return saved
	const sync = await HikService.sync(saved.accountId)
	return { ...saved, sync }
}))
router.put('/accounts/:id', ...owner, handle(async (req) => {
	const saved = await HikService.saveAccount({ ...(req.body || {}), id: req.params.id })
	if (!saved.success) return saved
	const sync = await HikService.sync(saved.accountId)
	return { ...saved, sync }
}))
router.delete('/accounts/:id', ...owner, handle(req => HikService.deleteAccount(req.params.id)))
router.post('/accounts/:id/test', ...owner, handle(req => HikService.test(req.params.id)))
router.post('/accounts/:id/sync', ...owner, handle(req => HikService.sync(req.params.id)))

// Tizim egasi: barcha kameralar (qaysi maktabga biriktirilgani bilan) va maktabga biriktirish
router.get('/schools-summary', ...owner, handle(() => HikService.schoolsSummary()))
router.get('/cameras', ...owner, handle(() => HikService.listCameras()))
router.post('/cameras/detach', ...owner, handle(req => HikService.detachCameras(req.body?.ids)))
router.put('/schools/:schoolId/assignment', ...owner, handle(req => HikService.saveAssignment(req.params.schoolId, req.body?.assignments || req.body?.cameraIds, req.user.userId, req.body?.kind === 'facecontrol' ? 'facecontrol' : 'monitor')))

// Maktab admini: faqat o'z maktabiga biriktirilgan kameralar (faqat o'qish)
router.get('/my-cameras', verifyToken, requireRole('user', 'admin'), handle(req => HikService.listForSchool(req.user.school)))

// Maktab admini: kamerani sinfga bog'lash, vazifasini (monitor | in | out) va avto-davomatni belgilash
router.put('/my-cameras-bulk', verifyToken, requireRole('user', 'admin'), handle(req => HikService.bulkUpdateCameras(req.user.school, req.body?.ids, req.body || {})))
router.put('/my-cameras/:id', verifyToken, requireRole('user', 'admin'), handle(req => HikService.updateCameraSettings(req.user.school, req.params.id, req.body || {})))

// FaceControl sahifasi: kirish/chiqish kameralari, kun hodisalari va sanoq
router.get('/facecontrol', verifyToken, requireRole('user', 'admin'), handle(async (req) => {
	const date = require('../utils/dateStr').isDate(req.query.date) ? req.query.date : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
	const data = await HikService.facecontrol(req.user.school, date)
	return { ...data, poller: await HikEvents.statusForSchool(req.user.school) }
}))

// Sinfxonalar tahlili (sinfga biriktirilgan kameralar) va kamera kadri
router.get('/classrooms', verifyToken, requireRole('user', 'admin'), handle(req => {
	const date = require('../utils/dateStr').isDate(req.query.date) ? req.query.date : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
	return HikService.classrooms(req.user.school, date, { all: true })
}))
router.get('/cameras/:id/snapshot', verifyToken, requireRole('superadmin', 'monitor', 'user', 'admin'), handle(req => HikService.snapshot(req.params.id, req.user)))

// Sinfxonaning to'liq tahlili: maktab admini o'z maktabi, monitor/tizim egasi istalgan maktab (schoolId bilan)
router.get('/classroom-detail', verifyToken, requireRole('superadmin', 'monitor', 'user', 'admin'), handle(req => {
	const school = ['user', 'admin'].includes(req.user.role) ? req.user.school : req.query.schoolId
	const date = require('../utils/dateStr').isDate(req.query.date) ? req.query.date : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
	return Classroom.detail(school, req.query.sinfId, date)
}))

// Odam sanash (kadr bo'yicha, yuz tanilmaydi): jonli son, kun bo'yicha soatlik tarix va oxirgi tahlil kadri.
// Maktab admini o'z maktabi, monitor/tizim egasi istalgan maktab (schoolId bilan)
const visionSchool = (req) => ['user', 'admin'].includes(req.user.role) ? req.user.school : req.query.schoolId
const visionRoles = requireRole('superadmin', 'monitor', 'user', 'admin')
router.get('/vision/live', verifyToken, visionRoles, handle(fresh(SHORT_MS, req => {
	const school = visionSchool(req)
	if (!school) return { success: false, message: 'Maktab tanlanmagan' }
	return Vision.live(school)
}, req => `vlive|${visionSchool(req)}`)))
router.get('/vision/day', verifyToken, visionRoles, handle(req => {
	const school = visionSchool(req)
	if (!school) return { success: false, message: 'Maktab tanlanmagan' }
	const date = require('../utils/dateStr').isDate(req.query.date) ? req.query.date : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
	return Vision.day(school, date, req.query.sinfId || null)
}))
router.get('/vision/overview', verifyToken, visionRoles, handle(fresh(SHORT_MS, req => {
	const school = visionSchool(req)
	if (!school) return { success: false, message: 'Maktab tanlanmagan' }
	return Vision.overview(school, require('../utils/dateStr').isDate(req.query.date) ? req.query.date : null)
}, req => `vover|${visionSchool(req)}|${req.query.date || ''}`)))
router.get('/vision/evidence', verifyToken, visionRoles, handle(req => {
	const school = visionSchool(req)
	if (!school) return { success: false, message: 'Maktab tanlanmagan' }
	return Vision.evidence(school, { date: req.query.date, sinfId: req.query.sinfId || null, group: req.query.group, page: req.query.page })
}))
// Aqlli kuzatuv hisobotlari (Excel): arxiv, qo'lda yaratish, yuklab olish. Har kuni 18:30 va shanba 18:45 avtomatik yaratiladi
const Reports = require('../services/report.service')
const reportRoles = requireRole('user', 'admin', 'leader')
router.get('/reports', verifyToken, reportRoles, handle(req => Reports.list(req.user.school)))
router.post('/reports/generate', verifyToken, reportRoles, handle(req => Reports.generate(req.user.school, req.body?.from, req.body?.to, 'davr', req.lang)))
router.get('/reports/download/:name', verifyToken, reportRoles, async (req, res) => {
	try {
		const file = await Reports.fileFor(req.user.school, req.params.name)
		if (!file) return res.status(404).json({ success: false, message: 'Hisobot topilmadi' })
		return res.download(file, req.params.name)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
})

// Maktabni ishga tushirish bosqichlari (bosh sahifadagi "Tizimni sozlash" kartasi)
router.get('/setup', verifyToken, requireRole('user', 'admin'), handle(req => require('../services/setup.service').status(req.user.school)))
// Dalillar necha kun saqlanishi (sahifalarda izoh uchun)
router.get('/vision/retention', verifyToken, visionRoles, handle(() => require('../services/retention.service').info()))
router.get('/vision/summary', verifyToken, visionRoles, handle(req => {
	const school = visionSchool(req)
	if (!school) return { success: false, message: 'Maktab tanlanmagan' }
	return Vision.summary(school, req.query.date)
}))
router.get('/vision/recent', verifyToken, visionRoles, handle(req => {
	const school = visionSchool(req)
	if (!school) return { success: false, message: 'Maktab tanlanmagan' }
	return Vision.evidenceRecent(school, { date: req.query.date, per: req.query.per })
}))
router.get('/vision/frame/:cameraId', verifyToken, visionRoles, async (req, res) => {
	try {
		const file = await Vision.frameFor(req.params.cameraId, req.user)
		if (!file) return res.status(404).json({ success: false, message: 'Kadr topilmadi' })
		res.setHeader('Cache-Control', 'private, no-store')
		return res.sendFile(file)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
})

// Kadrlar: hozirgi kadrni galereyaga saqlash va saqlangan kadrni (faqat huquqi borga) olish
router.post('/cameras/:id/capture', verifyToken, requireRole('superadmin', 'monitor', 'user', 'admin'), handle(req => Snapshots.capture(req.params.id, req.user)))
// Sun'iy intellekt isboti: qisqa lavha (animatsiyali WebP)
router.get('/events/:id/clip', verifyToken, requireRole('superadmin', 'monitor', 'user', 'admin'), async (req, res) => {
	try {
		const file = await Vision.clipFor(req.params.id, req.user)
		if (!file) return res.status(404).json({ success: false, message: 'Lavha topilmadi' })
		res.setHeader('Cache-Control', 'private, max-age=3600')
		return res.sendFile(file)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
})
router.get('/events/:id/snapshot', verifyToken, requireRole('superadmin', 'monitor', 'user', 'admin'), async (req, res) => {
	try {
		const file = await Snapshots.fileFor(req.params.id, req.user)
		if (!file) return res.status(404).json({ success: false, message: 'Kadr topilmadi' })
		res.setHeader('Cache-Control', 'private, max-age=3600')
		return res.sendFile(file)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
})

// Jonli ko'rish — tizim egasi va monitor istalgan kamerani, maktab admini faqat o'zinikini
router.get('/cameras/:id/live', verifyToken, requireRole('superadmin', 'monitor', 'user', 'admin'), handle(req => HikService.live(req.params.id, req.user, { fresh: req.query.fresh === '1' })))

module.exports = router
