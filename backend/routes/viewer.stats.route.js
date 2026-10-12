const express = require('express')
const mongoose = require('mongoose')
const router = express.Router()
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const MonitorService = require('../services/monitor.service')
const Analytics = require('../services/monitor.analytics.service')
const sinfModel = require('../models/sinf.model')
const studentModel = require('../models/student.model')
const userModel = require('../models/user.model')

// O'qituvchi (viewer) paneli: o'zining davomati va (sinf rahbari bo'lsa) o'z sinflari statistikasi. Faqat o'qish.
// Foydalanuvchi va maktab HAR DOIM tokendan olinadi; sinf rahbarligi bazadan tekshiriladi (Sinf.head)
router.use(verifyToken, requireRole('viewer'))
// URL da foydalanuvchi ID si ko'rinmasligi uchun: /person/staff/me — tokendagi foydalanuvchi
router.param('id', (req, res, next, val) => { if (val === 'me') req.params.id = String(req.user.userId || req.user.id || ''); next() })

const q = (req) => req.query
const handle = (fn) => async (req, res) => {
	try {
		const userId = String(req.user.userId || req.user.id || '')
		const school = String(req.user.school || '')
		if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(school)) return res.status(403).json({ success: false, message: 'Foydalanuvchi aniqlanmadi' })
		const classes = await sinfModel.find({ schoolId: school, head: userId }).select('name grade letter').sort({ grade: 1, letter: 1, name: 1 }).lean()
		const result = await fn(req, { userId, school, classes, sinfIds: classes.map(c => String(c._id)) })
		if (result.success) return res.json(result)
		const { status, ...body } = result
		return res.status(status || 404).json(body)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Hisobotni yuklashda xatolik' })
	}
}

// shaxs o'zi yoki o'z sinfi o'quvchisi ekanini tekshiradi
const allowed = async (kind, id, c) => {
	if (!mongoose.isValidObjectId(id)) return false
	if (kind === 'staff') return String(id) === c.userId
	if (kind === 'student') return c.sinfIds.length > 0 && !!(await studentModel.exists({ _id: id, schoolId: c.school, sinf: { $in: c.sinfIds } }))
	return false
}
const empty = { success: true, people: [], students: [], grades: [], classes: [], total: 0, totalLatePeople: 0, overall: null, classCount: 0 }

// Bosh sahifa ma'lumoti: shaxsiy ma'lumot, bugungi holat, 30 kunlik davomat, sinflar (bugungi holat, kelmaganlar)
router.get('/dashboard', handle(async (req, c) => {
	const user = await userModel.findById(c.userId).select('fullName position photo phone_personal phone_work createdAt').lean()
	const date = q(req).date
	const [today, stats, overview] = await Promise.all([
		MonitorService.personDay({ kind: 'staff', id: c.userId, date }),
		MonitorService.person({ kind: 'staff', id: c.userId, from: q(req).from, to: q(req).to }),
		c.classes.length ? MonitorService.classes({ schoolId: c.school, date }) : Promise.resolve({ classes: [] })
	])
	const mine = (overview.classes || []).filter(x => c.sinfIds.includes(String(x._id)))
	const classes = await Promise.all(mine.map(async (x) => {
		const absent = await MonitorService.absentStudents({ schoolId: c.school, date, sinfId: String(x._id) })
		const meta = c.classes.find(k => String(k._id) === String(x._id))
		return { ...x, grade: meta?.grade || null, absentList: (absent.students || []).slice(0, 12), absentTotal: absent.total || 0 }
	}))
	return { success: true, user, today: today.success ? today : null, stats: stats.success ? stats.stats : null, recent: stats.success ? (stats.days || []).slice(-14) : [], workStartTime: stats.workStartTime || null, statsRange: { from: stats.from, to: stats.to }, classes }
}))
router.get('/me', handle(async (req, c) => ({ success: true, userId: c.userId, classes: c.classes })))
// sinf rahbari paneli bitta maktabga bog'langan: umumiy sahifalar maktab ro'yxatini so'raganda bo'sh ro'yxat qaytadi
router.get('/overview', handle(async () => ({ success: true, schools: [] })))

// sinf rahbari: faqat o'z sinfi o'quvchilarining sababli kelmagan kunlari (xodim sabablari ko'rsatilmaydi)
router.get('/leaves', handle(async (req, c) => {
	const r = await Analytics.leaves({ from: q(req).from, to: q(req).to, schoolId: c.school })
	const names = new Set(c.classes.map(x => x.name))
	const studentLeaves = (r.studentLeaves || []).filter(x => names.has(x.sinf))
	return { ...r, leaves: [], total: 0, active: 0, byType: {}, studentLeaves }
}))
router.get('/grades', handle(async (req, c) => (c.sinfIds.length ? Analytics.gradesReport({ from: q(req).from, to: q(req).to, grade: q(req).grade, schoolId: c.school, sinfIds: c.sinfIds }) : empty)))
router.get('/grade-class', handle((req, c) => Analytics.gradeClassDetail({ sinfId: q(req).sinfId, from: q(req).from, to: q(req).to, schoolId: c.school, sinfIds: c.sinfIds })))
router.get('/late-people', handle(async (req, c) => (c.sinfIds.length ? Analytics.latePeople({ kind: 'student', from: q(req).from, to: q(req).to, schoolId: c.school, limit: q(req).limit, sinfIds: c.sinfIds }) : empty)))
router.get('/at-risk', handle(async (req, c) => (c.sinfIds.length ? Analytics.atRisk({ from: q(req).from, to: q(req).to, schoolId: c.school, minStreak: q(req).minStreak, limit: q(req).limit, sinfIds: c.sinfIds }) : empty)))
router.get('/person/:kind/:id', handle(async (req, c) => ((await allowed(req.params.kind, req.params.id, c)) ? MonitorService.person({ kind: req.params.kind, id: req.params.id, from: q(req).from, to: q(req).to }) : { success: false, message: 'Topilmadi' })))
router.get('/person-day/:kind/:id', handle(async (req, c) => ((await allowed(req.params.kind, req.params.id, c)) ? MonitorService.personDay({ kind: req.params.kind, id: req.params.id, date: q(req).date }) : { success: false, message: 'Topilmadi' })))

module.exports = router
