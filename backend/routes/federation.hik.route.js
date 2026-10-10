// Federatsiya: Hik-Connect kameralari va AI dalillari (FAQAT o'qish). Viloyat serveri shu yo'llar orqali tuman kameralarini
// jonli ko'radi: tuman serveri Hik bulutidan oqim tokenini oladi va viloyatga beradi, video esa brauzerdan to'g'ridan-to'g'ri Hik bulutiga boradi
// (video tuman va viloyat serverlari orqali o'tmaydi). Hudud cheklovi (FEDERATION_DISTRICTS) monitorScope orqali amal qiladi.
const express = require('express')
const { inScope } = require('../utils/monitorScope')
const HikService = require('../services/hikconnect.service')
const Snapshots = require('../services/hik.snapshot.service')
const Classroom = require('../services/hik.classroom.service')
const Vision = require('../services/vision.service')
const { isDate } = require('../utils/dateStr')

const router = express.Router()
// Federatsiya "foydalanuvchisi": monitor roli — xizmatlar uni hudud (inScope) bo'yicha tekshiradi
const user = { role: 'monitor', userId: 'federation', id: 'federation' }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
const day = (d) => (isDate(d) ? d : today())

const handle = (fn) => async (req, res) => {
	try {
		const result = await fn(req)
		return res.status(result.success ? 200 : 400).json(result)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
}
const school = (req) => (inScope(req.query.schoolId) ? req.query.schoolId : null)
const noSchool = { success: false, message: 'Maktab tanlanmagan' }

router.get('/cameras/:id/live', handle((req) => HikService.live(req.params.id, user)))
router.get('/cameras/:id/snapshot', handle((req) => HikService.snapshot(req.params.id, user)))
router.get('/classroom-detail', handle((req) => { const s = school(req); return s ? Classroom.detail(s, req.query.sinfId, day(req.query.date)) : noSchool }))
router.get('/vision/live', handle((req) => { const s = school(req); return s ? Vision.live(s) : noSchool }))
router.get('/vision/day', handle((req) => { const s = school(req); return s ? Vision.day(s, day(req.query.date), req.query.sinfId || null) : noSchool }))
router.get('/vision/evidence', handle((req) => { const s = school(req); return s ? Vision.evidence(s, { date: req.query.date, sinfId: req.query.sinfId || null, group: req.query.group, page: req.query.page }) : noSchool }))
router.get('/vision/summary', handle((req) => { const s = school(req); return s ? Vision.summary(s, req.query.date) : noSchool }))
router.get('/vision/recent', handle((req) => { const s = school(req); return s ? Vision.evidenceRecent(s, { date: req.query.date, per: req.query.per }) : noSchool }))
router.get('/vision/retention', handle(() => require('../services/retention.service').info()))

const file = (get, cache) => async (req, res) => {
	try {
		const f = await get(req)
		if (!f) return res.status(404).json({ success: false, message: 'Topilmadi' })
		res.setHeader('Cache-Control', cache)
		return res.sendFile(f)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
}
router.get('/vision/frame/:cameraId', file((req) => Vision.frameFor(req.params.cameraId, user), 'private, no-store'))
router.get('/events/:id/clip', file((req) => Vision.clipFor(req.params.id, user), 'private, max-age=3600'))
router.get('/events/:id/frame/:idx', file((req) => Vision.imageFor(req.params.id, Number(req.params.idx), user), 'private, max-age=3600'))
router.get('/events/:id/snapshot', file((req) => Snapshots.fileFor(req.params.id, user), 'private, max-age=3600'))

module.exports = router
