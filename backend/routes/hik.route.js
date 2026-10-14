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
const { monitorScopeMiddleware, inScope } = require('../utils/monitorScope')
const hikCameraModel = require('../models/hik.camera.model')
const hikCameraEventModel = require('../models/hik.cameraevent.model')
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

// Monitor (tuman/viloyat nazoratchisi) faqat o'z hududidagi maktab, kamera va hodisalarni ko'radi:
// hudud ALS'ga qo'yiladi, so'rovdagi schoolId / kamera / hodisa shu hududga kirmasa — 403
const outOfScope = (res) => res.status(403).json({ success: false, message: "Bu maktab sizning hududingizga kirmaydi" })
const monitorGuard = (target) => async (req, res, next) => {
	if (req.user?.role !== 'monitor') return next()
	try {
		if (req.query.schoolId && !inScope(req.query.schoolId)) return outOfScope(res)
		if (target) {
			const id = req.params[target.param]
			if (!/^[a-f\d]{24}$/i.test(String(id || ''))) return res.status(400).json({ success: false, message: "Id noto'g'ri" })
			const doc = target.kind === 'event'
				? await hikCameraEventModel.findById(id).select('schoolId').lean()
				: await hikCameraModel.findById(id).select('schoolId').lean()
			if (!doc || !doc.schoolId || !inScope(doc.schoolId)) return outOfScope(res)
		}
		return next()
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
}
const scoped = (target) => [verifyToken, monitorScopeMiddleware, monitorGuard(target)]
const CAM = { kind: 'camera', param: 'id' }
const EVT = { kind: 'event', param: 'id' }

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
// Hik-Connect shaxslar sinxronizatsiyasi (xodim/o'quvchilarni bulutga yuborish): holat va "hammasini yuborish"
const HikPersons = require('../services/hik.person.service')
router.get('/persons/status', verifyToken, requireRole('user', 'admin'), handle(req => HikPersons.status(req.user.school)))
router.post('/persons/sync', verifyToken, requireRole('user', 'admin'), handle(async (req) => ({ success: true, ...(await HikPersons.enqueueAll(req.user.school)) })))
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
router.get('/cameras/:id/snapshot', ...scoped(CAM), requireRole('superadmin', 'monitor', 'user', 'admin'), handle(req => HikService.snapshot(req.params.id, req.user)))

// Sinfxonaning to'liq tahlili: maktab admini o'z maktabi, monitor/tizim egasi istalgan maktab (schoolId bilan)
router.get('/classroom-detail', ...scoped(), requireRole('superadmin', 'monitor', 'user', 'admin'), handle(req => {
	const school = ['user', 'admin'].includes(req.user.role) ? req.user.school : req.query.schoolId
	const date = require('../utils/dateStr').isDate(req.query.date) ? req.query.date : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
	return Classroom.detail(school, req.query.sinfId, date)
}))

// Odam sanash (kadr bo'yicha, yuz tanilmaydi): jonli son, kun bo'yicha soatlik tarix va oxirgi tahlil kadri.
// Maktab admini o'z maktabi, monitor/tizim egasi istalgan maktab (schoolId bilan)
const visionSchool = (req) => ['user', 'admin'].includes(req.user.role) ? req.user.school : req.query.schoolId
const visionRoles = requireRole('superadmin', 'monitor', 'user', 'admin')
router.get('/vision/live', ...scoped(), visionRoles, handle(fresh(SHORT_MS, req => {
	const school = visionSchool(req)
	if (!school) return { success: false, message: 'Maktab tanlanmagan' }
	return Vision.live(school)
}, req => `vlive|${visionSchool(req)}`)))
router.get('/vision/day', ...scoped(), visionRoles, handle(req => {
	const school = visionSchool(req)
	if (!school) return { success: false, message: 'Maktab tanlanmagan' }
	const date = require('../utils/dateStr').isDate(req.query.date) ? req.query.date : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
	return Vision.day(school, date, req.query.sinfId || null)
}))
router.get('/vision/overview', ...scoped(), visionRoles, handle(fresh(SHORT_MS, req => {
	const school = visionSchool(req)
	if (!school) return { success: false, message: 'Maktab tanlanmagan' }
	return Vision.overview(school, require('../utils/dateStr').isDate(req.query.date) ? req.query.date : null)
}, req => `vover|${visionSchool(req)}|${req.query.date || ''}`)))
router.get('/vision/evidence', ...scoped(), visionRoles, handle(req => {
	const school = visionSchool(req)
	if (!school) return { success: false, message: 'Maktab tanlanmagan' }
	return Vision.evidence(school, { date: req.query.date, sinfId: req.query.sinfId || null, group: req.query.group, page: req.query.page })
}))
// Yuz tanish (sinfxona kameralari, ixtiyoriy): holat, o'quvchi suratlaridan yuz izlarini olish, "ko'rindi" dalillari (davomat EMAS)
const Faces = require('../services/face.service')
const faceAdmin = requireRole('user', 'admin')
router.get('/faces/status', verifyToken, faceAdmin, handle(req => Faces.status(req.user.school)))
router.post('/faces/enroll', verifyToken, faceAdmin, handle(req => Faces.enrollSchool(req.user.school, { force: req.body?.force === true })))
router.get('/faces/presence', verifyToken, faceAdmin, handle(req => Faces.presence(req.user.school, { sinfId: req.query.sinfId, date: isDate(req.query.date) ? req.query.date : null })))
// Qo'shimcha yuz suratlari (bir o'quvchiga 3–5 ta): sifat tekshiriladi, rad etilgani sababi bilan qaytadi
const faceUpload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 5 } })
const studentOf = (req) => require('../models/student.model').findOne({ _id: req.params.id, schoolId: req.user.school, isActive: { $ne: false } }).select('_id schoolId sinf').lean()
// Xodimlar (o'qituvchi va boshqalar): yuz suratlari va kamerada ko'ringanlari
const staffOf = (req) => require('../models/user.model').findOne({ _id: req.params.id, schoolId: req.user.school, isActive: { $ne: false }, hodimID: { $nin: [null, ''] } }).select('_id schoolId').lean()
router.get('/faces/staff/:id/photos', verifyToken, faceAdmin, handle(async req => (await staffOf(req)) ? Faces.listPhotos(req.params.id) : { success: false, message: "Xodim topilmadi yoki xodim ID raqami yo'q" }))
router.post('/faces/staff/:id/photos', verifyToken, faceAdmin, (req, res, next) => faceUpload.array('images', 5)(req, res, (err) => err ? res.status(400).json({ success: false, message: "Rasm hajmi 8 MB dan oshmasin, bir vaqtda 5 tagacha" }) : next()), async (req, res) => {
	try {
		const person = await staffOf(req)
		if (!person) return res.status(404).json({ success: false, message: "Xodim topilmadi yoki xodim ID raqami yo'q" })
		const results = []
		for (const f of req.files || []) results.push({ name: f.originalname, ...(await Faces.addPhoto(person, f.buffer, 'staff')) })
		return res.json({ success: true, results, ...(await Faces.listPhotos(req.params.id)) })
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
})
router.get('/faces/staff-presence', verifyToken, faceAdmin, handle(req => Faces.staffPresence(req.user.school, { date: isDate(req.query.date) ? req.query.date : null })))
router.get('/faces/students/:id/photos', verifyToken, faceAdmin, handle(async req => (await studentOf(req)) ? Faces.listPhotos(req.params.id) : { success: false, message: "O'quvchi topilmadi" }))
router.post('/faces/students/:id/photos', verifyToken, faceAdmin, (req, res, next) => faceUpload.array('images', 5)(req, res, (err) => err ? res.status(400).json({ success: false, message: "Rasm hajmi 8 MB dan oshmasin, bir vaqtda 5 tagacha" }) : next()), async (req, res) => {
	try {
		const student = await studentOf(req)
		if (!student) return res.status(404).json({ success: false, message: "O'quvchi topilmadi" })
		const results = []
		for (const f of req.files || []) results.push({ name: f.originalname, ...(await Faces.addPhoto(student, f.buffer)) })
		return res.json({ success: true, results, ...(await Faces.listPhotos(req.params.id)) })
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
})
router.get('/faces/students', verifyToken, faceAdmin, handle(req => require('../services/face.diagnose').searchStudents(req.user.school, req.query.q)))
// Real vaqt: brauzer jonli videodan olgan kadrni yuboradi (Hik'dan kadr olinmaydi), javobda ramkalar koordinatasi
router.post('/faces/frame', verifyToken, faceAdmin, (req, res, next) => faceUpload.single('image')(req, res, (err) => err ? res.status(400).json({ success: false, message: 'Kadr hajmi 8 MB dan oshmasin' }) : next()), async (req, res) => {
	try {
		if (!req.file) return res.status(400).json({ success: false, message: 'Kadr yuborilmadi' })
		// Yuklama chegarasi: jonli yo'lakda navbat to'lib qolsa yangi kadr qabul qilinmaydi (ko'p foydalanuvchi bir vaqtda ochsa server bosimga tushmasin)
		if (require('../ai/aiPool').queueSize('live') >= (Number(process.env.AI_LIVE_QUEUE_MAX) || 6)) return res.status(429).json({ success: false, message: 'Server band, keyingi kadrda qayta uriniladi' })
		return res.json(await require('../services/face.diagnose').diagnose(req.user.school, { cameraId: req.body?.cameraId, studentId: req.body?.studentId || null, buffer: req.file.buffer }))
	} catch (error) {
		console.log(error.message)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
})
router.post('/faces/diagnose', verifyToken, faceAdmin, handle(req => require('../services/face.diagnose').diagnose(req.user.school, { cameraId: req.body?.cameraId, studentId: req.body?.studentId || null, sinfId: req.body?.sinfId || null })))
router.delete('/faces/templates/:id', verifyToken, faceAdmin, handle(req => Faces.removeTemplate(req.params.id, req.user.school)))
router.put('/faces/presence/:id/verdict', verifyToken, faceAdmin, handle(req => Faces.setVerdict(req.user.school, req.params.id, req.body?.verdict ?? null)))
router.delete('/faces', verifyToken, requireRole('user'), handle(async req => ({ success: true, ...(await Faces.purgeSchool(req.user.school)) })))
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
router.get('/vision/retention', ...scoped(), visionRoles, handle(() => require('../services/retention.service').info()))
router.get('/vision/summary', ...scoped(), visionRoles, handle(req => {
	const school = visionSchool(req)
	if (!school) return { success: false, message: 'Maktab tanlanmagan' }
	return Vision.summary(school, req.query.date)
}))
router.get('/vision/recent', ...scoped(), visionRoles, handle(req => {
	const school = visionSchool(req)
	if (!school) return { success: false, message: 'Maktab tanlanmagan' }
	return Vision.evidenceRecent(school, { date: req.query.date, per: req.query.per })
}))
router.get('/vision/frame/:cameraId', ...scoped({ kind: 'camera', param: 'cameraId' }), visionRoles, async (req, res) => {
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
router.post('/cameras/:id/capture', ...scoped(CAM), requireRole('superadmin', 'monitor', 'user', 'admin'), handle(req => Snapshots.capture(req.params.id, req.user)))
// Sun'iy intellekt isboti: qisqa lavha (animatsiyali WebP)
router.get('/events/:id/clip', ...scoped(EVT), requireRole('superadmin', 'monitor', 'user', 'admin'), async (req, res) => {
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
router.get('/events/:id/snapshot', ...scoped(EVT), requireRole('superadmin', 'monitor', 'user', 'admin'), async (req, res) => {
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
router.get('/cameras/:id/live', ...scoped(CAM), requireRole('superadmin', 'monitor', 'user', 'admin'), handle(req => HikService.live(req.params.id, req.user, { fresh: req.query.fresh === '1' })))

module.exports = router
