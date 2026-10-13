const express = require('express')
const mongoose = require('mongoose')
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const MonitorService = require('../services/monitor.service')
const Analytics = require('../services/monitor.analytics.service')
const { cached, byUrlAndSchool } = require('../utils/ttlCache')
const { monitorScopeMiddleware, excludeInactiveSchools, loadScope, scopeIds, scopeLevel, inScope } = require('../utils/monitorScope')
const schoolModel = require('../models/school.model')




// Hudud tekshiruvi: so'rovdagi maktab (`schoolId`, `/school/:id`) yoki shaxs (`/person/:kind/:id`) monitor hududiga kirmasa — rad etiladi.
// (Ro'yxat/hisobotlar maktablarni hudud bo'yicha o'zi cheklaydi; bu qatlam id bilan to'g'ridan-to'g'ri so'rashni yopadi)
const SCHOOL_PATH = /^\/school\/([a-f\d]{24})(\/|$)/i
const PERSON_PATH = /^\/person(?:-day)?\/(student|staff)\/([a-f\d]{24})$/i
const scopeGuard = async (req, res, next) => {
	try {
		const sid = req.query.schoolId
		const m = SCHOOL_PATH.exec(req.path)
		if ((sid && mongoose.isValidObjectId(sid) && !inScope(sid)) || (m && !inScope(m[1]))) return res.status(403).json({ success: false, message: "Bu maktab sizning hududingizga kirmaydi" })
		const p = PERSON_PATH.exec(req.path)
		if (p) {
			const model = p[1] === 'student' ? require('../models/student.model') : require('../models/user.model')
			const doc = await model.findById(p[2]).select('schoolId').lean()
			if (!doc || !inScope(doc.schoolId)) return res.status(404).json({ success: false, message: 'Topilmadi' })
		}
		return next()
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Hisobotni yuklashda xatolik' })
	}
}

// Monitor hisobotlari yo'llari bitta joyda: ikkita router ulanadi — oddiy monitor/superadmin (JWT, hudud bo'yicha) va
// federatsiya (viloyat serveri kaliti bilan, serverdagi hamma maktab). Federatsiyada /me yo'q (u foydalanuvchiga bog'liq).
function register(router, { federation = false } = {}) {
	router.use(scopeGuard)
	const handle = (fn) => async (req, res) => {
		try {
			const result = await fn(req)
			if (result.success) return res.json(result)
			const { status, ...body } = result
			return res.status(status || 404).json(body)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: 'Hisobotni yuklashda xatolik' })
		}
	}

	// schoolId noto'g'ri bo'lsa 400 qaytaradi
	const needSchool = (getId) => (req, res, next) => {
		if (!mongoose.isValidObjectId(getId(req))) return res.status(400).json({ success: false, message: "schoolId noto'g'ri" })
		next()
	}

	// Monitorning o'z hududi (panel sarlavhasi uchun): viloyat/tuman va shu hududdagi maktablar soni
	if (!federation) router.get('/me', handle(async (req) => {
		const scope = req.user.role === 'monitor' ? await loadScope(req.user.userId || req.user.id) : null
		if (!scope) return { success: true, scoped: false, region: '', district: '', schools: await schoolModel.countDocuments() }
		return { success: true, scoped: true, level: scope.district ? 'district' : 'region', region: scope.region, district: scope.district, schools: (scopeIds() || scope.schoolIds).length }
	}))
	// Xarita: tuman chegaralari va maktablar bo'yicha bugungi statistika (monitor o'z tumani bilan cheklanadi)
	router.get('/map', handle(cached(30000, req => require('../services/map.service').overview(req.query.date))))
	// Viloyat paneli: tumanlar kesimida solishtirish
	router.get('/districts', handle(async (req) => {
		// faqat viloyat monitori va tizim egasi uchun; tuman monitoriga yopiq
		if (scopeLevel() === 'district') return { success: false, status: 403, message: "Bu bo'lim faqat viloyat monitori uchun" }
		return cached(60000, r => require('../services/map.service').districts.report({ from: r.query.from, to: r.query.to }))(req)
	}))
	// Aqlli kuzatuv (AI): tuman/maktab jamlanmasi va hodisalar (kadr, qisqa lavha) hudud bo'yicha
	router.get('/ai', handle(cached(30000, req => require('../services/monitor.ai.service').overview({ date: req.query.date }))))
	router.get('/ai-evidence', handle(req => require('../services/monitor.ai.service').evidence({ date: req.query.date, district: req.query.district, schoolId: req.query.schoolId, group: req.query.group, page: req.query.page })))
	router.get('/district-names', handle(() => require('../services/map.service').names.names()))
	// Viloyat darajasidagi tahlillar (tumanlar kesimida): late, risk, leaves, alerts, cameras, staff, students, classrooms, trend
	router.get('/region/:metric', handle(async (req) => {
		if (scopeLevel() === 'district') return { success: false, status: 403, message: "Bu bo'lim faqat viloyat monitori uchun" }
		return cached(60000, r => require('../services/region.service').run(r.params.metric, r.query))(req)
	}))
	router.get('/overview', handle(cached(15000, req => MonitorService.overview(req.query.date))))
	router.get('/trend', handle(cached(60000, req => MonitorService.trend({ from: req.query.from, to: req.query.to, schoolId: mongoose.isValidObjectId(req.query.schoolId) ? req.query.schoolId : null }))))
	router.get('/schools-report', handle(cached(60000, req => MonitorService.schoolsReport({ from: req.query.from, to: req.query.to }))))
	router.get('/schools-compare', handle(cached(60000, req => MonitorService.schoolsCompare({ from: req.query.from, to: req.query.to }))))
	router.get('/cameras', handle(() => MonitorService.cameras()))
	router.get('/classes', needSchool(req => req.query.schoolId), handle(req => MonitorService.classes({ schoolId: req.query.schoolId, date: req.query.date })))
	router.get('/absent-students', needSchool(req => req.query.schoolId), handle(req => MonitorService.absentStudents({
		schoolId: req.query.schoolId, date: req.query.date, sinfId: mongoose.isValidObjectId(req.query.sinfId) ? req.query.sinfId : null
	})))
	// Qidiruv va shaxs darajasidagi ko'rinish (faqat o'qish)
	router.get('/search', handle(req => MonitorService.search(req.query.q)))
	const peopleQuery = (kind) => (req) => MonitorService.people({ kind, schoolId: req.params.id, q: req.query.q, sinfId: mongoose.isValidObjectId(req.query.sinfId) ? req.query.sinfId : null, status: req.query.status, date: req.query.date, page: req.query.page, limit: req.query.limit })
	router.get('/school/:id/staff', needSchool(req => req.params.id), handle(peopleQuery('staff')))
	router.get('/school/:id/students', needSchool(req => req.params.id), handle(peopleQuery('student')))
	router.get('/person-day/:kind/:id', needSchool(req => req.params.id), handle(req => MonitorService.personDay({ kind: req.params.kind, id: req.params.id, date: req.query.date })))
	router.get('/person/:kind/:id', needSchool(req => req.params.id), handle(req => MonitorService.person({ kind: req.params.kind, id: req.params.id, from: req.query.from, to: req.query.to })))
	// Chuqur tahlillar (tafsilotli): butun tizim bo'yicha ro'yxatlar va reytinglar
	const q = (req) => req.query
	router.get('/people-all', handle(cached(30000, req => Analytics.peopleAll({ kind: q(req).kind, status: q(req).status, date: q(req).date, schoolId: q(req).schoolId, sinfId: q(req).sinfId, q: q(req).q, page: q(req).page, limit: q(req).limit }))))
	// Sababli kelmaganlar (ta'til, safar, kasallik; o'quvchilar uchun sinf rahbari kiritgan sabablar)
	router.get('/leaves', handle(cached(45000, req => Analytics.leaves({ date: q(req).date, from: q(req).from, to: q(req).to, schoolId: q(req).schoolId, type: q(req).type }))))
	router.get('/late-people', handle(cached(60000, req => Analytics.latePeople({ kind: q(req).kind, from: q(req).from, to: q(req).to, schoolId: q(req).schoolId, limit: q(req).limit, page: q(req).page, pageSize: q(req).pageSize, q: q(req).q, group: q(req).group, sort: q(req).sort, all: q(req).all }))))
	router.get('/at-risk', handle(cached(60000, req => Analytics.atRisk({ from: q(req).from, to: q(req).to, schoolId: q(req).schoolId, minStreak: q(req).minStreak, limit: q(req).limit }))))
	router.get('/classes-all', handle(cached(60000, req => Analytics.classesAll({ date: q(req).date, schoolId: q(req).schoolId }))))
	router.get('/arrival', handle(cached(120000, req => Analytics.arrival({ from: q(req).from, to: q(req).to, schoolId: q(req).schoolId }))))
	router.get('/camera-events', handle(cached(30000, req => Analytics.cameraEvents({ schoolId: q(req).schoolId, kind: q(req).kind, from: q(req).from, to: q(req).to, page: q(req).page, limit: q(req).limit }))))
	router.get('/classrooms-all', handle(cached(30000, req => Analytics.classroomsAll({ date: q(req).date, schoolId: q(req).schoolId }))))
	router.get('/grades', handle(cached(45000, req => Analytics.gradesReport({ from: q(req).from, to: q(req).to, grade: q(req).grade }))))
	router.get('/grade-class', handle(req => Analytics.gradeClassDetail({ sinfId: q(req).sinfId, from: q(req).from, to: q(req).to })))
	router.get('/alerts', handle(cached(45000, req => Analytics.alerts({ date: q(req).date }))))
	router.get('/live', handle(cached(15000, () => Analytics.live())))
	router.get('/camera-health', handle(() => Analytics.cameraHealth()))
	router.get('/school/:id', needSchool(req => req.params.id), handle(cached(45000, req => MonitorService.school({ schoolId: req.params.id, from: req.query.from, to: req.query.to }))))

}

// Umumiy nazorat hisobotlari — FAQAT o'qish (GET), 'monitor' va 'superadmin'
const router = express.Router()
router.use(verifyToken, requireRole('monitor', 'superadmin'), monitorScopeMiddleware, excludeInactiveSchools)
register(router)

module.exports = router
module.exports.register = register
