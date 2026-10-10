						// DIQQAT: "xodim kelmadi" ta'rifi 3 xil: (1) overview.staffAbsent = total - came - SABABLI (sababli ta'tilda/safar/kasal xodimlar chiqariladi);
						// (2) people/peopleAll (summary.absent) = kelish yozuvi yo'q hamma xodim (sababli ham kiradi, excuse bayrog'i bilan alohida);
						// (3) region/* (stats.*Absent asosida) = overview bilan bir xil (1). Shuning uchun sababli xodim bor maktabda (1) < (2).
// 'monitor' roli (va superadmin) uchun barcha maktablar bo'yicha FAQAT O'QISH
// hisobotlari. Hech qanday yozish amali yo'q. "Kelgan" = kunlik davomat
// yozuvi 'kelmagan' bo'lmagan (ishda yoki tashqarida), "ichkarida" = hozir 'ishda'.
const mongoose = require('mongoose')
const { publicCode } = require('../utils/publicCode')
const schoolModel = require('../models/school.model')
const userModel = require('../models/user.model')
const studentModel = require('../models/student.model')
const sinfModel = require('../models/sinf.model')
const cameraModel = require('../models/camera.model')
const hikFaceEventModel = require('../models/hik.event.model')
const hikCameraModel = require('../models/hik.camera.model')
const settingsModel = require('../models/settings.model')
const attendanceModel = require('../models/attandance.model')
const studentAttendanceModel = require('../models/student.attandance.model')
const attendanceLogModel = require('../models/attandance.log.model')
const studentAttendanceLogModel = require('../models/student.attandance.log.model')

const TZ = 'Asia/Tashkent'
const STAFF_ROLES = ['viewer', 'leader']
const CAME = ['ishda', 'tashqarida']
const MAX_RANGE_DAYS = 92

const todayString = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const { isDate } = require('../utils/dateStr')
const oid = (id) => new mongoose.Types.ObjectId(String(id))
const toMap = (rows, key = 'total') => new Map(rows.map(r => [String(r._id), r[key]]))

// from/to (YYYY-MM-DD) ni tekshiradi; berilmasa oxirgi 30 kun. Juda uzun oraliq cheklanadi
function resolveRange(from, to) {
	const end = isDate(to) ? to : todayString()
	let start = isDate(from) ? from : null
	if (!start) {
		const d = new Date(`${end}T00:00:00Z`)
		d.setUTCDate(d.getUTCDate() - 29)
		start = d.toISOString().slice(0, 10)
	}
	if (start > end) start = end
	const days = Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000) + 1
	if (days > MAX_RANGE_DAYS) {
		const d = new Date(`${end}T00:00:00Z`)
		d.setUTCDate(d.getUTCDate() - (MAX_RANGE_DAYS - 1))
		start = d.toISOString().slice(0, 10)
	}
	return { from: start, to: end }
}

function eachDate(from, to) {
	const list = []
	const d = new Date(`${from}T00:00:00Z`)
	const end = new Date(`${to}T00:00:00Z`)
	while (d <= end) {
		list.push(d.toISOString().slice(0, 10))
		d.setUTCDate(d.getUTCDate() + 1)
	}
	return list
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0)

// ---------- Shaxs darajasidagi (o'quvchi / xodim) ko'rinish — FAQAT o'qish ----------
const PERSON = {
	student: { model: studentModel, att: studentAttendanceModel, log: studentAttendanceLogModel, field: 'student' },
	staff: { model: userModel, att: attendanceModel, log: attendanceLogModel, field: 'user' }
}
const escapeRx = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const HHMM_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const hhmm = (d) => (d ? HHMM_FMT.format(new Date(d)) : null)
const minutesOf = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null }

async function workStart(schoolId) {
	const st = await settingsModel.findOne({ schoolId }).select('workStartTime').lean()
	return /^([01]\d|2[0-3]):([0-5]\d)$/.test(st?.workStartTime) ? st.workStartTime : '09:00'
}

// Bir kunlik kirish/chiqish: shaxs bo'yicha birinchi kirish va oxirgi chiqish vaqti
async function dayLogs(kind, schoolId, dateString, ids) {
	const P = PERSON[kind]
	const rows = await P.log.aggregate([
		{ $match: { schoolId, dateString, [P.field]: { $in: ids } } },
		{ $group: { _id: '$' + P.field, firstIn: { $min: '$checkInTime' }, lastOut: { $max: '$checkOutTime' } } }
	])
	return new Map(rows.map(r => [String(r._id), r]))
}

// Ko'p maktab bo'yicha so'rovlarni cheklangan parallellik bilan bajaradi
const poolRun = async (items, fn, n = 6) => {
	const out = new Array(items.length)
	let i = 0
	await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) } }))
	return out
}

// Har bir maktabdagi joriy (faol) xodim/o'quvchi/sinf sonlari
async function currentTotals(schoolIds) {
	const match = { schoolId: { $in: schoolIds } }
	const [staff, students, classes, admins] = await Promise.all([
		userModel.aggregate([{ $match: { ...match, role: { $in: STAFF_ROLES }, isActive: { $ne: false } } }, { $group: { _id: '$schoolId', total: { $sum: 1 } } }]),
		studentModel.aggregate([{ $match: { ...match, isActive: { $ne: false } } }, { $group: { _id: '$schoolId', total: { $sum: 1 } } }]),
		sinfModel.aggregate([{ $match: match }, { $group: { _id: '$schoolId', total: { $sum: 1 } } }]),
		userModel.aggregate([{ $match: { ...match, role: 'user', isActive: { $ne: false } } }, { $group: { _id: '$schoolId', total: { $sum: 1 } } }])
	])
	return { staff: toMap(staff), students: toMap(students), classes: toMap(classes), admins: toMap(admins) }
}

// Kunlik yig'indi: [{schoolId, dateString, staffCame, staffInside, studentCame, studentInside}]
async function dailyCounts(from, to, schoolIds) {
	// maktabma-maktab (indeks prefiksi schoolId) va bir nechta oqimda: bitta katta $in so'rovi bitta yadroda ketma-ket ishlaydi
	const group = {
		_id: { s: '$schoolId', d: '$dateString' },
		came: { $sum: { $cond: [{ $in: ['$status', CAME] }, 1, 0] } },
		inside: { $sum: { $cond: [{ $eq: ['$status', 'ishda'] }, 1, 0] } }
	}
	const perSchool = async (model) => (await poolRun(schoolIds, (id) => model.aggregate([{ $match: { schoolId: id, dateString: { $gte: from, $lte: to } } }, { $group: group }]), 6)).flat()
	const [staff, students] = await Promise.all([perSchool(attendanceModel), perSchool(studentAttendanceModel)])
	const rows = new Map()
	const row = (s, d) => {
		const key = `${s}|${d}`
		if (!rows.has(key)) rows.set(key, { schoolId: String(s), dateString: d, staffCame: 0, staffInside: 0, studentCame: 0, studentInside: 0 })
		return rows.get(key)
	}
	staff.forEach(r => { const x = row(r._id.s, r._id.d); x.staffCame = r.came; x.staffInside = r.inside })
	students.forEach(r => { const x = row(r._id.s, r._id.d); x.studentCame = r.came; x.studentInside = r.inside })
	return [...rows.values()]
}

// Kech qolganlar: kunning birinchi kirishi maktabning workStartTime'idan keyin
async function lateCounts(dateString, schoolIds) {
	const settings = await settingsModel.find({ schoolId: { $in: schoolIds } }).select('schoolId workStartTime').lean()
	const startMap = new Map(settings.map(s => [String(s.schoolId), /^([01]\d|2[0-3]):([0-5]\d)$/.test(s.workStartTime) ? s.workStartTime : '09:00']))
	const first = (model, field) => model.aggregate([
		{ $match: { schoolId: { $in: schoolIds }, dateString, checkin: true, checkInTime: { $ne: null } } },
		{ $group: { _id: { s: '$schoolId', p: `$${field}` }, t: { $min: '$checkInTime' } } },
		{ $project: { s: '$_id.s', hhmm: { $dateToString: { date: { $add: ['$t', 18000000] }, format: '%H:%M' } } } }
	])
	const [staff, students] = await Promise.all([first(attendanceLogModel, 'user'), first(studentAttendanceLogModel, 'student')])
	const count = (rows) => {
		const map = new Map()
		for (const r of rows) {
			const limit = startMap.get(String(r.s)) || '09:00'
			if (r.hhmm > limit) map.set(String(r.s), (map.get(String(r.s)) || 0) + 1)
		}
		return map
	}
	return { staff: count(staff), students: count(students), startMap }
}

class MonitorService {
	// Barcha maktablar — tanlangan sana (default: bugun) bo'yicha holat
	async overview(date) {
		const dateString = isDate(date) ? date : todayString()
		const schools = await schoolModel.find().sort({ name: 1 }).lean()
		const ids = schools.map(s => s._id)
		const [totals, daily, late, cameras, hik] = await Promise.all([
			currentTotals(ids),
			dailyCounts(dateString, dateString, ids),
			lateCounts(dateString, ids),
			cameraModel.aggregate([
				{ $match: { schoolId: { $in: ids } } },
				{ $group: {
					_id: '$schoolId', total: { $sum: 1 },
					online: { $sum: { $cond: [{ $eq: ['$online', true] }, 1, 0] } },
					offline: { $sum: { $cond: [{ $eq: ['$online', false] }, 1, 0] } },
					lastSeenAt: { $max: '$lastSeenAt' }
				} }
			]),
			hikCameraModel.aggregate([
				{ $match: { schoolId: { $in: ids }, inCloud: true } },
				{ $group: {
					_id: '$schoolId', total: { $sum: 1 },
					online: { $sum: { $cond: [{ $eq: ['$online', true] }, 1, 0] } },
					offline: { $sum: { $cond: [{ $eq: ['$online', false] }, 1, 0] } }
				} }
			])
		])
		const dayMap = new Map(daily.map(r => [r.schoolId, r]))
		const camMap = new Map(cameras.map(r => [String(r._id), r]))
		const hikMap = new Map(hik.map(r => [String(r._id), r]))
		return {
			success: true,
			dateString,
			schools: schools.map(s => {
				const id = String(s._id)
				const d = dayMap.get(id) || {}
				const cam = camMap.get(id) || {}
				const hk = hikMap.get(id) || {}
				const staffTotal = totals.staff.get(id) || 0
				const studentTotal = totals.students.get(id) || 0
				return {
					_id: s._id, name: s.name, code: s.code, region: s.region, district: s.district,
					phone: s.phone, isActive: s.isActive, location: s.location?.lat != null ? { lat: s.location.lat, lng: s.location.lng, address: s.location.address || '' } : null,
					stats: {
						staffTotal, staffCame: d.staffCame || 0, staffInside: d.staffInside || 0,
						staffAbsent: Math.max(0, staffTotal - (d.staffCame || 0)), staffLate: late.staff.get(id) || 0,
						studentTotal, studentCame: d.studentCame || 0, studentInside: d.studentInside || 0,
						studentAbsent: Math.max(0, studentTotal - (d.studentCame || 0)), studentLate: late.students.get(id) || 0,
						classTotal: totals.classes.get(id) || 0, adminTotal: totals.admins.get(id) || 0,
						cameraTotal: (cam.total || 0) + (hk.total || 0), cameraOnline: (cam.online || 0) + (hk.online || 0), cameraOffline: (cam.offline || 0) + (hk.offline || 0),
						hikTotal: hk.total || 0, hikOnline: hk.online || 0,
						cameraLastSeenAt: cam.lastSeenAt || null,
						workStartTime: late.startMap.get(id) || '09:00'
					}
				}
			})
		}
	}

	// Kunlik dinamika (barcha maktablar yoki bitta maktab)
	async trend({ from, to, schoolId }) {
		const range = resolveRange(from, to)
		const schools = await schoolModel.find(schoolId ? { _id: oid(schoolId) } : {}).select('_id').lean()
		const ids = schools.map(s => s._id)
		const [totals, daily] = await Promise.all([currentTotals(ids), dailyCounts(range.from, range.to, ids)])
		const staffTotal = [...totals.staff.values()].reduce((a, b) => a + b, 0)
		const studentTotal = [...totals.students.values()].reduce((a, b) => a + b, 0)
		const byDate = new Map(eachDate(range.from, range.to).map(d => [d, { dateString: d, staffCame: 0, staffInside: 0, studentCame: 0, studentInside: 0 }]))
		daily.forEach(r => {
			const x = byDate.get(r.dateString)
			if (!x) return
			x.staffCame += r.staffCame; x.staffInside += r.staffInside
			x.studentCame += r.studentCame; x.studentInside += r.studentInside
		})
		const days = [...byDate.values()].map(x => ({
			...x, staffTotal, studentTotal,
			staffPercent: pct(x.staffCame, staffTotal), studentPercent: pct(x.studentCame, studentTotal),
			weekday: new Date(`${x.dateString}T00:00:00Z`).getUTCDay()
		}))
		return { success: true, ...range, staffTotal, studentTotal, days }
	}

	// Davr bo'yicha maktablar reytingi/hisoboti. Yakshanba va ma'lumotsiz kunlar
	// (hech kim kelmagan) o'quv kuni hisoblanmaydi
	async schoolsReport({ from, to }) {
		const range = resolveRange(from, to)
		const schools = await schoolModel.find().sort({ name: 1 }).lean()
		const ids = schools.map(s => s._id)
		const [totals, daily] = await Promise.all([currentTotals(ids), dailyCounts(range.from, range.to, ids)])
		const per = new Map()
		daily.forEach(r => {
			if (new Date(`${r.dateString}T00:00:00Z`).getUTCDay() === 0) return
			if (!r.staffCame && !r.studentCame) return
			if (!per.has(r.schoolId)) per.set(r.schoolId, { days: 0, staffCame: 0, studentCame: 0, best: null, worst: null })
			const x = per.get(r.schoolId)
			x.days += 1; x.staffCame += r.staffCame; x.studentCame += r.studentCame
			const total = totals.students.get(r.schoolId) || 0
			const p = pct(r.studentCame, total)
			if (!x.best || p > x.best.percent) x.best = { dateString: r.dateString, percent: p }
			if (!x.worst || p < x.worst.percent) x.worst = { dateString: r.dateString, percent: p }
		})
		return {
			success: true, ...range,
			schools: schools.map(s => {
				const id = String(s._id)
				const x = per.get(id) || { days: 0, staffCame: 0, studentCame: 0, best: null, worst: null }
				const staffTotal = totals.staff.get(id) || 0
				const studentTotal = totals.students.get(id) || 0
				return {
					_id: s._id, name: s.name, code: s.code, region: s.region, district: s.district, isActive: s.isActive,
					staffTotal, studentTotal, schoolDays: x.days,
					staffAvgCame: x.days ? Math.round(x.staffCame / x.days) : 0,
					studentAvgCame: x.days ? Math.round(x.studentCame / x.days) : 0,
					staffPercent: pct(x.staffCame, staffTotal * x.days),
					studentPercent: pct(x.studentCame, studentTotal * x.days),
					studentAbsentDays: Math.max(0, studentTotal * x.days - x.studentCame),
					best: x.best, worst: x.worst
				}
			})
		}
	}

	// Bitta maktab: sinflar kesimida o'quvchilar davomati (tanlangan sana)
	async classes({ schoolId, date }) {
		const dateString = isDate(date) ? date : todayString()
		const sid = oid(schoolId)
		const [classes, students, present] = await Promise.all([
			sinfModel.find({ schoolId: sid }).populate('head', 'fullName').sort({ name: 1 }).lean(),
			studentModel.aggregate([{ $match: { schoolId: sid, isActive: { $ne: false } } }, { $group: { _id: '$sinf', total: { $sum: 1 } } }]),
			studentAttendanceModel.aggregate([
				{ $match: { schoolId: sid, dateString, status: { $in: CAME } } },
				{ $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 's' } },
				{ $unwind: '$s' },
				{ $group: { _id: '$s.sinf', came: { $sum: 1 }, inside: { $sum: { $cond: [{ $eq: ['$status', 'ishda'] }, 1, 0] } } } }
			])
		])
		const totalMap = toMap(students)
		const camMap = new Map(present.map(r => [String(r._id), r]))
		return {
			success: true, dateString,
			classes: classes.map(c => {
				const total = totalMap.get(String(c._id)) || 0
				const came = camMap.get(String(c._id))?.came || 0
				return {
					_id: c._id, name: c.name, description: c.description, head: c.head?.fullName || null,
					total, came, inside: camMap.get(String(c._id))?.inside || 0,
					absent: Math.max(0, total - came), percent: pct(came, total)
				}
			})
		}
	}

	// Kelmagan o'quvchilar ro'yxati (bitta maktab, bir sana). Ota-ona telefoni ATAYLAB berilmaydi
	async absentStudents({ schoolId, date, sinfId }) {
		const dateString = isDate(date) ? date : todayString()
		const sid = oid(schoolId)
		const filter = { schoolId: sid, isActive: { $ne: false } }
		if (sinfId) filter.sinf = oid(sinfId)
		const came = await studentAttendanceModel.find({ schoolId: sid, dateString, status: { $in: CAME } }).select('student').lean()
		filter._id = { $nin: came.map(r => r.student) }
		const [list, total] = await Promise.all([
			studentModel.find(filter).select('fullName sinf gender').populate('sinf', 'name').sort({ fullName: 1 }).limit(1000).lean(),
			studentModel.countDocuments(filter)
		])
		return {
			success: true, dateString, total, truncated: total > list.length,
			students: list.map(s => ({ _id: s._id, fullName: s.fullName, sinf: s.sinf?.name || '', gender: s.gender }))
		}
	}

	// Kameralar holati (IP/parol chiqarilmaydi)
	async cameras() {
		const [schools, cameras, hik] = await Promise.all([
			schoolModel.find().select('name region district').sort({ name: 1 }).lean(),
			cameraModel.find().select('schoolId name qayer where joy online lastSeenAt lastStatusError').lean(),
			hikCameraModel.find({ inCloud: true, schoolId: { $ne: null } }).select('schoolId cameraId serial name areaName online lastSeenAt role sinfId').populate('sinfId', 'name').lean()
		])
		const map = new Map(schools.map(s => [String(s._id), { ...s, cameras: [] }]))
		cameras.forEach(c => map.get(String(c.schoolId))?.cameras.push({
			_id: c._id, name: c.name, place: c.qayer || c.where || c.joy || '',
			online: c.online, lastSeenAt: c.lastSeenAt, error: c.lastStatusError
		}))
		hik.forEach(d => map.get(String(d.schoolId))?.cameras.push({
			_id: d._id, name: d.name || d.serial, place: d.areaName || '', source: 'hikconnect', hikId: d._id, serial: d.serial, role: d.role || 'monitor', sinf: d.sinfId?.name || '',
			online: d.online, lastSeenAt: d.lastSeenAt, error: null
		}))
		return { success: true, schools: [...map.values()] }
	}

	// Bitta maktab profili — bugungi holat, dinamika, sinflar, kameralar
	async school({ schoolId, from, to }) {
		const school = await schoolModel.findById(schoolId).lean()
		if (!school) return { success: false, message: 'Maktab topilmadi' }
		const [overview, trend, classes, cameras, hik] = await Promise.all([
			this.overview(),
			this.trend({ from, to, schoolId }),
			this.classes({ schoolId }),
			cameraModel.find({ schoolId: school._id }).select('name qayer where joy online lastSeenAt lastStatusError').lean(),
			hikCameraModel.find({ schoolId: school._id, inCloud: true }).select('cameraId serial name areaName online lastSeenAt role sinfId').populate('sinfId', 'name').lean()
		])
		const item = overview.schools.find(s => String(s._id) === String(school._id))
		return {
			success: true, dateString: overview.dateString,
			school: { _id: school._id, name: school.name, code: school.code, region: school.region, district: school.district, phone: school.phone, itCenter: school.itCenter, isActive: school.isActive, createdAt: school.createdAt, location: school.location?.lat != null && school.location?.lng != null ? { lat: school.location.lat, lng: school.location.lng } : null },
			today: item?.stats || {}, trend, classes: classes.classes,
			cameras: cameras.map(c => ({ _id: c._id, name: c.name, place: c.qayer || c.where || c.joy || '', online: c.online, lastSeenAt: c.lastSeenAt, error: c.lastStatusError })).concat(hik.map(d => ({ _id: d._id, name: d.name || d.serial, place: d.areaName || '', source: 'hikconnect', hikId: d._id, serial: d.serial, role: d.role || 'monitor', sinf: d.sinfId?.name || '', online: d.online, lastSeenAt: d.lastSeenAt, error: null })))
		}
	}


	// Umumiy qidiruv: maktab, o'quvchi va xodimlar bo'yicha (ism, ID, lavozim, hudud)
	// Umumiy qidiruv: maktab, sinf, o'quvchi, xodim. So'zlar tartibi muhim emas ("Aziza Umarova" = "Umarova Aziza"),
	// apostrof turlari farqi hisobga olinmaydi ("Ulug‘bek" = "Ulugbek" = "Ulug'bek"), sinf "5-A", "5 a", "5a" ko'rinishida topiladi
	async search(q) {
		const text = String(q || '').trim()
		if (text.length < 2) return { success: true, schools: [], classes: [], students: [], staff: [] }
		const APOS = /['‘’ʻʼ`´]/g
		const rxOf = (t) => new RegExp(escapeRx(t.replace(APOS, "'")).replace(/'/g, "['‘’ʻʼ`´]?"), 'i')
		const tokens = text.split(/\s+/).filter(Boolean).slice(0, 5)
		const all = (fields) => ({ $and: tokens.map(t => ({ $or: fields.map(f => ({ [f]: rxOf(t) })) })) })

		// sinf: "5", "5-A", "5 a", "5a" yoki nom bo'yicha
		const cm = /^(\d{1,2})\s*[-–—.]?\s*(\p{L}{0,3})$/u.exec(text)
		const classFilter = cm ? { grade: Number(cm[1]), ...(cm[2] ? { letter: new RegExp('^' + escapeRx(cm[2]) + '$', 'i') } : {}) } : { name: rxOf(text) }

		const [schools, classes, students, staff] = await Promise.all([
			schoolModel.find(all(['name', 'code', 'region', 'district'])).select('name code region district isActive').limit(6).lean(),
			sinfModel.find(classFilter).select('name grade schoolId').sort({ grade: 1, letter: 1 }).limit(8).lean(),
			studentModel.find({ isActive: { $ne: false }, ...all(['fullName', 'studentIdNumber']) }).select('fullName studentIdNumber sinf schoolId photo').populate('sinf', 'name').limit(12).lean(),
			userModel.find({ role: { $in: STAFF_ROLES }, isActive: { $ne: false }, schoolId: { $ne: null }, ...all(['fullName', 'hodimID', 'position']) }).select('fullName hodimID position schoolId photo').limit(12).lean()
		])
		const ids = [...new Set([...students, ...staff, ...classes].map(x => String(x.schoolId)))]
		const names = new Map((await schoolModel.find({ _id: { $in: ids } }).select('name').lean()).map(x => [String(x._id), x.name]))
		return {
			success: true, schools,
			classes: classes.map(x => ({ _id: x._id, name: x.name, grade: x.grade, schoolId: x.schoolId, schoolName: names.get(String(x.schoolId)) || '' })),
			students: students.map(x => ({ _id: x._id, fullName: x.fullName, photo: x.photo || null, studentIdNumber: x.studentIdNumber, sinf: x.sinf?.name || '', schoolId: x.schoolId, schoolName: names.get(String(x.schoolId)) || '' })),
			staff: staff.map(x => ({ _id: x._id, fullName: x.fullName, photo: x.photo || null, hodimID: x.hodimID, position: x.position, schoolId: x.schoolId, schoolName: names.get(String(x.schoolId)) || '' }))
		}
	}

	// Maktab xodimlari yoki o'quvchilari ro'yxati: tanlangan kundagi holat bilan (kelgan / ichkarida /
	// kech qolgan / kelmagan), qidiruv, sinf va holat filtrlari, sahifalash
	async people({ kind, schoolId, q, sinfId, status, date, page, limit }) {
		const P = PERSON[kind]
		if (!P) return { success: false, status: 400, message: "Tur noto'g'ri" }
		const sid = oid(schoolId)
		const dateString = isDate(date) ? date : todayString()
		const filter = kind === 'staff' ? { schoolId: sid, role: { $in: STAFF_ROLES }, isActive: { $ne: false } } : { schoolId: sid, isActive: { $ne: false } }
		if (sinfId) filter.sinf = oid(sinfId)
		const text = String(q || '').trim()
		if (text) { const rx = new RegExp(escapeRx(text), 'i'); filter.$or = kind === 'staff' ? [{ fullName: rx }, { hodimID: rx }, { position: rx }] : [{ fullName: rx }, { studentIdNumber: rx }] }
		const select = kind === 'staff' ? 'fullName hodimID position role sinf photo' : 'fullName studentIdNumber sinf gender photo'
		const [people, start] = await Promise.all([
			P.model.find(filter).select(select).populate('sinf', 'name').sort({ fullName: 1 }).limit(5000).lean(),
			workStart(sid)
		])
		const ids = people.map(p => p._id)
		const [atts, logs] = await Promise.all([
			P.att.find({ schoolId: sid, dateString, [P.field]: { $in: ids } }).select(P.field + ' status totalTime').lean(),
			dayLogs(kind, sid, dateString, ids)
		])
		const attMap = new Map(atts.map(a => [String(a[P.field]), a]))
		const limitMin = minutesOf(start)
		const rows = people.map(p => {
			const a = attMap.get(String(p._id))
			const lg = logs.get(String(p._id))
			const came = !!a && CAME.includes(a.status)
			const firstIn = hhmm(lg?.firstIn)
			const late = came && firstIn && limitMin !== null && minutesOf(firstIn) > limitMin
			return {
				_id: p._id, fullName: p.fullName, code: kind === 'staff' ? publicCode(p.hodimID) : publicCode(p.studentIdNumber), position: p.position || '', sinf: p.sinf?.name || '', gender: p.gender || null,
				status: !came ? 'absent' : a.status === 'ishda' ? 'inside' : 'out', late: !!late, firstIn, lastOut: hhmm(lg?.lastOut), totalTime: a?.totalTime || null
			}
		})
		const summary = { total: rows.length, came: rows.filter(r => r.status !== 'absent').length, inside: rows.filter(r => r.status === 'inside').length, absent: rows.filter(r => r.status === 'absent').length, late: rows.filter(r => r.late).length }
		const wanted = { came: r => r.status !== 'absent', inside: r => r.status === 'inside', out: r => r.status === 'out', absent: r => r.status === 'absent', late: r => r.late }[status]
		const filtered = wanted ? rows.filter(wanted) : rows
		const size = Math.min(Math.max(Number(limit) || 50, 10), 200)
		const pages = Math.max(1, Math.ceil(filtered.length / size))
		const current = Math.min(Math.max(Number(page) || 1, 1), pages)
		return { success: true, dateString, workStartTime: start, summary, total: filtered.length, page: current, pages, people: filtered.slice((current - 1) * size, current * size) }
	}

	// Bitta o'quvchi yoki xodimning to'liq statistikasi (tanlangan davr): kunlar bo'yicha holat, kechikishlar,
	// o'rtacha kelish/ketish vaqti, jami vaqt. "O'quv kuni" — maktabda kamida bitta odam qayd etilgan kun
	async person({ kind, id, from, to }) {
		const P = PERSON[kind]
		if (!P) return { success: false, status: 400, message: "Tur noto'g'ri" }
		const person = await P.model.findById(id).populate('sinf', 'name').lean()
		if (!person || (kind === 'staff' && !STAFF_ROLES.includes(person.role))) return { success: false, message: 'Topilmadi' }
		const range = resolveRange(from, to)
		const school = await schoolModel.findById(person.schoolId).select('name region district').lean()
		const start = await workStart(person.schoolId)
		const [atts, logs, schoolDays] = await Promise.all([
			P.att.find({ [P.field]: person._id, dateString: { $gte: range.from, $lte: range.to } }).select('dateString status totalTime totalEntries').lean(),
			P.log.aggregate([
				{ $match: { [P.field]: person._id, dateString: { $gte: range.from, $lte: range.to } } },
				{ $group: { _id: '$dateString', firstIn: { $min: '$checkInTime' }, lastOut: { $max: '$checkOutTime' }, entries: { $sum: { $cond: ['$checkin', 1, 0] } } } }
			]),
			P.att.distinct('dateString', { schoolId: person.schoolId, dateString: { $gte: range.from, $lte: range.to } })
		])
		const attMap = new Map(atts.map(a => [a.dateString, a]))
		const logMap = new Map(logs.map(l => [l._id, l]))
		const open = new Set(schoolDays)
		const limitMin = minutesOf(start)
		let present = 0, late = 0, arrivalSum = 0, arrivalN = 0, minutes = 0
		const days = eachDate(range.from, range.to).map(dateString => {
			const a = attMap.get(dateString)
			const lg = logMap.get(dateString)
			const weekday = new Date(`${dateString}T00:00:00Z`).getUTCDay()
			const came = !!a && CAME.includes(a.status)
			const isSchoolDay = open.has(dateString) && weekday !== 0
			const firstIn = hhmm(lg?.firstIn)
			const isLate = came && firstIn && limitMin !== null && minutesOf(firstIn) > limitMin
			if (came) {
				present++
				if (isLate) late++
				if (firstIn) { arrivalSum += minutesOf(firstIn); arrivalN++ }
				const t = /^(\d+):(\d{2})$/.exec(a.totalTime || ''); if (t) minutes += Number(t[1]) * 60 + Number(t[2])
			}
			return { dateString, weekday, schoolDay: isSchoolDay, status: came ? 'present' : isSchoolDay ? 'absent' : 'off', late: !!isLate, firstIn, lastOut: hhmm(lg?.lastOut), entries: lg?.entries || 0, totalTime: a?.totalTime || null }
		})
		const days_ = days.filter(d => d.schoolDay || d.status === 'present').length
		const avg = arrivalN ? Math.round(arrivalSum / arrivalN) : null
		return {
			success: true, ...range, kind, workStartTime: start,
			person: {
				_id: person._id, fullName: person.fullName, photo: person.photo || null, sinf: person.sinf?.name || '', gender: person.gender || null, birthday: person.birthday || null,
				code: kind === 'staff' ? publicCode(person.hodimID) : publicCode(person.studentIdNumber), position: person.position || '', role: person.role || null,
				phone: kind === 'staff' ? (person.phone_personal || person.phone_work || '') : (person.parentPhone || ''), parentName: person.parentName || '',
				isActive: person.isActive !== false, createdAt: person.createdAt
			},
			school: school ? { _id: person.schoolId, name: school.name, region: school.region, district: school.district } : null,
			stats: {
				schoolDays: days_, present, absent: Math.max(0, days_ - present), late, percent: pct(present, days_),
				avgArrival: avg === null ? null : `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`,
				totalHours: Math.round((minutes / 60) * 10) / 10
			},
			days
		}
	}


	// Bitta shaxsning bitta kuni: kirish-chiqishlar (har bir tashrif), kamera aniqlashlari, umumiy holat va sinf/maktab bilan solishtirish
	async personDay({ kind, id, date }) {
		const P = PERSON[kind]
		if (!P) return { success: false, status: 400, message: "Tur noto'g'ri" }
		const dateString = isDate(date) ? date : todayString()
		const person = await P.model.findById(id).select('fullName sinf schoolId role').lean()
		if (!person || (kind === 'staff' && !STAFF_ROLES.includes(person.role))) return { success: false, message: 'Topilmadi' }
		const start = await workStart(person.schoolId)
		const limitMin = minutesOf(start)
		const [att, logs, faceEvents, openDays] = await Promise.all([
			P.att.findOne({ [P.field]: person._id, dateString }).lean(),
			P.log.find({ [P.field]: person._id, dateString }).sort({ checkInTime: 1, date: 1 }).lean(),
			hikFaceEventModel.find({ [kind === 'student' ? 'student' : 'user']: person._id, dateString }).sort({ time: 1 }).populate('camera', 'name').lean(),
			P.att.countDocuments({ schoolId: person.schoolId, dateString, status: { $in: CAME } })
		])
		const weekday = new Date(`${dateString}T00:00:00Z`).getUTCDay()
		const came = !!att && CAME.includes(att.status)
		const isSchoolDay = openDays > 0 && weekday !== 0

		const mins = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null)
		const visits = logs.filter(l => l.checkInTime || l.checkOutTime).map((l, i) => ({ _id: l._id, n: i + 1, in: hhmm(l.checkInTime), out: hhmm(l.checkOutTime), inAt: l.checkInTime || null, outAt: l.checkOutTime || null, minutes: mins(l.checkInTime, l.checkOutTime), open: !!l.checkInTime && !l.checkOutTime, comment: l.comment || '' }))
		const firstIn = visits.find(v => v.in)?.in || null
		const lastOut = [...visits].reverse().find(v => v.out)?.out || null
		let inside = 0, outside = 0
		visits.forEach((v, i) => {
			if (v.minutes) inside += v.minutes
			const next = visits[i + 1]
			if (next && v.outAt && next.inAt) outside += mins(v.outAt, next.inAt) || 0
		})
		const lateBy = came && firstIn && limitMin !== null ? Math.max(0, minutesOf(firstIn) - limitMin) : 0

		// solishtirish: shu kuni sinf (o'quvchi) yoki maktab xodimlari
		const peerFilter = kind === 'student' ? (person.sinf ? { sinf: person.sinf } : null) : { schoolId: person.schoolId, role: { $in: STAFF_ROLES } }
		let peers = null
		if (peerFilter) {
			const peerIds = (await P.model.find({ ...peerFilter, isActive: { $ne: false } }).select('_id').lean()).map(x => x._id)
			const [cameCount, firstIns] = await Promise.all([
				P.att.countDocuments({ [P.field]: { $in: peerIds }, dateString, status: { $in: CAME } }),
				P.log.aggregate([
					{ $match: { [P.field]: { $in: peerIds }, dateString, checkin: true, checkInTime: { $ne: null } } },
					{ $group: { _id: '$' + P.field, t: { $min: '$checkInTime' } } },
					{ $project: { hm: { $dateToString: { date: { $add: ['$t', 18000000] }, format: '%H:%M' } } } }
				])
			])
			const arr = firstIns.map(r => minutesOf(r.hm)).filter(v => v !== null)
			const avg = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null
			const fmt = (m) => (m === null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
			peers = {
				label: kind === 'student' ? 'Sinf' : 'Maktab xodimlari', total: peerIds.length, came: cameCount, percent: pct(cameCount, peerIds.length),
				avgArrival: fmt(avg), diffMinutes: avg !== null && firstIn ? minutesOf(firstIn) - avg : null, late: arr.filter(v => limitMin !== null && v > limitMin).length
			}
		}

		return {
			success: true, dateString, weekday, workStartTime: start,
			status: came ? (lateBy > 0 ? 'late' : 'present') : isSchoolDay ? 'absent' : 'off',
			summary: { firstIn, lastOut, entries: visits.filter(v => v.in).length, totalTime: att?.totalTime || null, insideMinutes: inside, outsideMinutes: outside, lateBy, insideNow: att?.status === 'ishda' },
			visits,
			faceEvents: faceEvents.map(e => ({ _id: e._id, time: hhmm(e.time), direction: e.direction, camera: e.camera?.name || '', similarity: e.similarity, threshold: e.threshold, recorded: e.recorded, note: e.note || '' })),
			peers
		}
	}

	// Maktablarni bir-biri bilan solishtirish: davr bo'yicha davomat, bugungi kechikish, kamera, dinamika,
	// umumiy ball, har bir ko'rsatkich bo'yicha o'rin va o'rtacha bilan farqdan kelib chiqqan kuchli/zaif tomonlar
	async schoolsCompare({ from, to }) {
		const range = resolveRange(from, to)
		const [overview, daily] = await Promise.all([this.overview(), (async () => {
			const schools = await schoolModel.find().select('_id').lean()
			return dailyCounts(range.from, range.to, schools.map(x => x._id))
		})()])
		const byDay = new Map()
		for (const r of daily) {
			if (new Date(`${r.dateString}T00:00:00Z`).getUTCDay() === 0 || (!r.studentCame && !r.staffCame)) continue
			if (!byDay.has(r.schoolId)) byDay.set(r.schoolId, [])
			byDay.get(r.schoolId).push(r)
		}
		const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)
		const round = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10)
		const rows = overview.schools.filter(x => x.isActive !== false).map(sc => {
			const st = sc.stats, days = (byDay.get(String(sc._id)) || []).sort((a, b) => a.dateString.localeCompare(b.dateString))
			const stuP = days.map(d => pct(d.studentCame, st.studentTotal)), staP = days.map(d => pct(d.staffCame, st.staffTotal))
			const last = stuP.slice(-7), prev = stuP.slice(-14, -7)
			const came = st.studentCame + st.staffCame
			const cameraTotal = st.cameraTotal
			return {
				_id: sc._id, name: sc.name, region: sc.region, district: sc.district,
				students: st.studentTotal, staff: st.staffTotal, classes: st.classTotal, schoolDays: days.length,
				studentPercent: st.studentTotal && days.length ? round(avg(stuP)) : null,
				staffPercent: st.staffTotal && days.length ? round(avg(staP)) : null,
				latePercent: came ? round(((st.studentLate + st.staffLate) / came) * 100) : null,
				trend: last.length >= 3 && prev.length >= 3 ? round(avg(last) - avg(prev)) : null,
				cameraPercent: cameraTotal ? round((st.cameraOnline / cameraTotal) * 100) : null,
				cameraTotal, cameraOnline: st.cameraOnline,
				today: { student: pct(st.studentCame, st.studentTotal), staff: pct(st.staffCame, st.staffTotal), late: st.studentLate + st.staffLate }
			}
		})
		// umumiy ball: o'quvchilar 60%, xodimlar 25%, o'z vaqtida kelish 15%
		for (const r of rows) {
			if (r.studentPercent === null) { r.score = null; continue }
			const punctual = r.latePercent === null ? 100 : Math.max(0, 100 - r.latePercent * 2)
			r.score = round(r.studentPercent * 0.6 + (r.staffPercent ?? r.studentPercent) * 0.25 + punctual * 0.15)
		}
		const METRICS = [
			{ key: 'studentPercent', label: "O'quvchilar davomati", higher: true },
			{ key: 'staffPercent', label: 'Xodimlar davomati', higher: true },
			{ key: 'latePercent', label: 'Kech qolish', higher: false },
			{ key: 'trend', label: 'Davomat dinamikasi', higher: true },
			{ key: 'cameraPercent', label: 'Kameralar ishlashi', higher: true }
		]
		const averages = {}, ranks = {}
		for (const m of [...METRICS, { key: 'score', higher: true }]) {
			const vals = rows.map(r => r[m.key]).filter(v => v !== null)
			averages[m.key] = round(avg(vals))
			const sorted = [...rows].filter(r => r[m.key] !== null).sort((a, b) => (m.higher ? b[m.key] - a[m.key] : a[m.key] - b[m.key]))
			sorted.forEach((r, i) => { (ranks[String(r._id)] ||= {})[m.key] = i + 1 })
			ranks._of = ranks._of || {}; ranks._of[m.key] = sorted.length
		}
		const ranksOf = ranks._of; delete ranks._of
		const gap = { studentPercent: 3, staffPercent: 3, latePercent: 3, trend: 2, cameraPercent: 10 }
		for (const r of rows) {
			const diffs = METRICS.filter(m => r[m.key] !== null && averages[m.key] !== null)
				.map(m => ({ key: m.key, label: m.label, diff: round((r[m.key] - averages[m.key]) * (m.higher ? 1 : -1)), value: r[m.key], avg: averages[m.key] }))
				.filter(d => Math.abs(d.diff) >= gap[d.key])
			r.strengths = diffs.filter(d => d.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 3)
			r.weaknesses = diffs.filter(d => d.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 3)
			r.rank = ranks[String(r._id)] || {}
		}
		rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name))
		return { success: true, ...range, metrics: METRICS, averages, ranksOf, schools: rows }
	}

}

module.exports = new MonitorService()
