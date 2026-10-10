const express = require('express')
const mongoose = require('mongoose')
const router = express.Router()
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const MonitorService = require('../services/monitor.service')
const Analytics = require('../services/monitor.analytics.service')
const { cached, byUrlAndSchool } = require('../utils/ttlCache')
const studentModel = require('../models/student.model')
const userModel = require('../models/user.model')

// Maktab paneli statistikasi: monitor hisobotlarining bitta maktabga cheklangan ko'rinishi (faqat o'qish).
// Maktab har doim tokendan olinadi — so'rovdagi schoolId e'tiborga olinmaydi, shuning uchun boshqa maktab ma'lumoti ko'rinmaydi
router.use(verifyToken, requireRole('user', 'admin'))

const handle = (fn) => async (req, res) => {
	try {
		if (!mongoose.isValidObjectId(req.user.school)) return res.status(403).json({ success: false, message: 'Maktab aniqlanmadi' })
		const result = await fn(req, String(req.user.school))
		if (result.success) return res.json(result)
		const { status, ...body } = result
		return res.status(status || 404).json(body)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Hisobotni yuklashda xatolik' })
	}
}
const q = (req) => req.query

// shaxs shu maktabniki ekanini tekshiradi
const ownPerson = (kind, id, school) => {
	if (!mongoose.isValidObjectId(id)) return Promise.resolve(false)
	const model = kind === 'staff' ? userModel : studentModel
	return model.exists({ _id: id, schoolId: school }).then(Boolean)
}

router.get('/school', handle((req, school) => MonitorService.school({ schoolId: school, from: q(req).from, to: q(req).to })))
router.get('/trend', handle(cached(60000, (req, school) => MonitorService.trend({ from: q(req).from, to: q(req).to, schoolId: school }), byUrlAndSchool)))
router.get('/grades', handle(cached(45000, (req, school) => Analytics.gradesReport({ from: q(req).from, to: q(req).to, grade: q(req).grade, schoolId: school }), byUrlAndSchool)))
router.get('/grade-class', handle((req, school) => Analytics.gradeClassDetail({ sinfId: q(req).sinfId, from: q(req).from, to: q(req).to, schoolId: school })))
router.get('/late-people', handle(cached(60000, (req, school) => Analytics.latePeople({ kind: q(req).kind, from: q(req).from, to: q(req).to, schoolId: school, limit: q(req).limit }), byUrlAndSchool)))
router.get('/at-risk', handle(cached(60000, (req, school) => Analytics.atRisk({ from: q(req).from, to: q(req).to, schoolId: school, minStreak: q(req).minStreak, limit: q(req).limit }), byUrlAndSchool)))
router.get('/alerts', handle(cached(45000, (req, school) => Analytics.alerts({ date: q(req).date, schoolId: school }), byUrlAndSchool)))
// DIQQAT: quyidagi 2 ta marshrut sessiya tarixidan tiklanmagan — frontend (MonitorLate/MonitorRisk/MonitorLeaves/SchoolDashboard) ishlatishiga qarab qayta yozilgan
// Umumiy ko'rsatkichlar: faqat shu maktab (monitor /overview ning bitta maktabga cheklangan ko'rinishi)
router.get('/overview', handle(cached(30000, async (req, school) => {
	const r = await MonitorService.overview(q(req).date)
	return { ...r, schools: (r.schools || []).filter(s => String(s._id) === school) }
}, byUrlAndSchool)))
// Sababli kelmagan xodimlar (ta'til, safar, kasallik)
router.get('/leaves', handle(cached(45000, (req, school) => Analytics.leaves({ date: q(req).date, from: q(req).from, to: q(req).to, schoolId: school, type: q(req).type }), byUrlAndSchool)))
router.get('/person/:kind/:id', handle(async (req, school) => (await ownPerson(req.params.kind, req.params.id, school)
	? MonitorService.person({ kind: req.params.kind, id: req.params.id, from: q(req).from, to: q(req).to }) : { success: false, message: 'Topilmadi' })))
router.get('/person-day/:kind/:id', handle(async (req, school) => (await ownPerson(req.params.kind, req.params.id, school)
	? MonitorService.personDay({ kind: req.params.kind, id: req.params.id, date: q(req).date }) : { success: false, message: 'Topilmadi' })))

module.exports = router
