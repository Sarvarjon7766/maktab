// Bitta sinfxonaning to'liq tahlili: dars holati bali, davomat, xona faolligi (soatlik, 7 kunlik issiqlik xaritasi,
// odatiy holat bilan), sinflar orasidagi o'rni, kamera hodisalari va kadrlar galereyasi.
const mongoose = require('mongoose')
const { publicCode } = require('../utils/publicCode')
const studentModel = require('../models/student.model')
const sinfModel = require('../models/sinf.model')
const settingsModel = require('../models/settings.model')
const hikCameraEventModel = require('../models/hik.cameraevent.model')
const visionMetricModel = require('../models/hik.visionmetric.model')
const studentAttendanceModel = require('../models/student.attandance.model')
const studentAttendanceLogModel = require('../models/student.attandance.log.model')
const HikService = require('./hikconnect.service')

const TZ = 'Asia/Tashkent'
const CAME = ['ishda', 'tashqarida']
const { LESSON_START, LESSON_END } = require('../utils/lessonHours')
const LESSON = [LESSON_START, LESSON_END]
const SIGNALS = ['density', 'people']
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0)
const shift = (dateStr, days) => { const d = new Date(`${dateStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const hhmm = (d) => (d ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d)) : null)
const minutesOf = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null }

class HikClassroomService {
	async detail(schoolId, sinfId, dateString) {
		if (!mongoose.isValidObjectId(schoolId) || !mongoose.isValidObjectId(sinfId)) return { success: false, message: "Identifikator noto'g'ri" }
		const school = new mongoose.Types.ObjectId(String(schoolId))
		const sinf = new mongoose.Types.ObjectId(String(sinfId))
		const overview = await HikService.classrooms(schoolId, dateString, { all: true, sinfId })
		const cls = overview.classes.find(c => String(c._id) === String(sinfId))
		if (!cls) return { success: false, message: 'Sinf topilmadi' }

		const camIds = cls.cameras.map(c => c._id)
		const from = shift(dateString, -13)
		const heatFrom = shift(dateString, -6)
		const from30 = shift(dateString, -29)
		const from56 = shift(dateString, -55)
		const [students, settings, allSinfs, rosters, cameInSchool] = await Promise.all([
			studentModel.find({ schoolId: school, sinf, isActive: { $ne: false } }).select('fullName studentIdNumber').sort({ fullName: 1 }).lean(),
			settingsModel.findOne({ schoolId: school }).select('workStartTime').lean(),
			sinfModel.find({ schoolId: school }).select('name').lean(),
			studentModel.aggregate([{ $match: { schoolId: school, isActive: { $ne: false } } }, { $group: { _id: '$sinf', total: { $sum: 1 } } }]),
			studentAttendanceModel.aggregate([
				{ $match: { schoolId: school, dateString, status: { $in: CAME } } },
				{ $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 's' } }, { $unwind: '$s' },
				{ $group: { _id: '$s.sinf', came: { $sum: 1 } } }
			])
		])
		const ids = students.map(s => s._id)
		const start = /^([01]\d|2[0-3]):([0-5]\d)$/.test(settings?.workStartTime) ? settings.workStartTime : '09:00'
		const limitMin = minutesOf(start)

		const [atts, firstIns, trendRows, events, heat, kindRows, gallery, daily56, perStudent, lateRows] = await Promise.all([
			studentAttendanceModel.find({ schoolId: school, dateString, student: { $in: ids } }).select('student status totalTime').lean(),
			studentAttendanceLogModel.aggregate([
				{ $match: { schoolId: school, dateString, student: { $in: ids }, checkin: true, checkInTime: { $ne: null } } },
				{ $group: { _id: '$student', first: { $min: '$checkInTime' } } }
			]),
			studentAttendanceModel.aggregate([
				{ $match: { schoolId: school, dateString: { $gte: from, $lte: dateString }, student: { $in: ids }, status: { $in: CAME } } },
				{ $group: { _id: '$dateString', came: { $sum: 1 } } }
			]),
			hikCameraEventModel.find({ schoolId: school, camera: { $in: camIds }, dateString: { $gte: heatFrom, $lte: dateString } }).sort({ time: -1 }).limit(60).populate('camera', 'name').select('kind time hour dateString camera snapshot').lean(),
			hikCameraEventModel.aggregate([
				{ $match: { schoolId: school, camera: { $in: camIds }, dateString: { $gte: heatFrom, $lte: dateString }, kind: { $nin: SIGNALS.concat(['manual']), $not: /^vision_/ } } },
				{ $group: { _id: { d: '$dateString', h: '$hour' }, n: { $sum: 1 } } }
			]),
			hikCameraEventModel.aggregate([
				{ $match: { schoolId: school, camera: { $in: camIds }, dateString: { $gte: heatFrom, $lte: dateString }, kind: { $ne: 'manual' } } },
				{ $group: { _id: '$kind', n: { $sum: 1 } } }
			]),
			hikCameraEventModel.find({ schoolId: school, camera: { $in: camIds }, snapshot: { $ne: null } }).sort({ time: -1 }).limit(36).populate('camera', 'name').select('kind time camera title detail count clip').lean(),
			studentAttendanceModel.aggregate([
				{ $match: { schoolId: school, dateString: { $gte: from56, $lte: dateString }, student: { $in: ids }, status: { $in: CAME } } },
				{ $group: { _id: '$dateString', came: { $sum: 1 } } }
			]),
			studentAttendanceModel.aggregate([
				{ $match: { schoolId: school, dateString: { $gte: from30, $lte: dateString }, student: { $in: ids }, status: { $in: CAME } } },
				{ $group: { _id: '$student', present: { $sum: 1 } } }
			]),
			studentAttendanceLogModel.aggregate([
				{ $match: { schoolId: school, dateString: { $gte: from30, $lte: dateString }, student: { $in: ids }, checkin: true, checkInTime: { $ne: null } } },
				{ $group: { _id: { s: '$student', d: '$dateString' }, first: { $min: '$checkInTime' } } },
				{ $project: { s: '$_id.s', hm: { $dateToString: { date: '$first', format: '%H:%M', timezone: TZ } } } },
				{ $group: { _id: '$s', days: { $sum: 1 }, lateDays: { $sum: { $cond: [{ $gt: ['$hm', start] }, 1, 0] } } } }
			])
		])

		// --- davomat ro'yxatlari ---
		const attMap = new Map(atts.map(a => [String(a.student), a]))
		const firstMap = new Map(firstIns.map(f => [String(f._id), f.first]))
		const absent = [], late = []
		let inside = 0
		for (const s of students) {
			const a = attMap.get(String(s._id))
			const came = !!a && CAME.includes(a.status)
			if (!came) { absent.push({ _id: s._id, fullName: s.fullName, code: publicCode(s.studentIdNumber) }); continue }
			if (a.status === 'ishda') inside++
			const first = hhmm(firstMap.get(String(s._id)))
			if (first && limitMin !== null && minutesOf(first) > limitMin) late.push({ _id: s._id, fullName: s.fullName, code: publicCode(s.studentIdNumber), firstIn: first, minutesLate: minutesOf(first) - limitMin })
		}
		late.sort((a, b) => b.minutesLate - a.minutesLate)
		const total = students.length, came = total - absent.length

		// --- kirish egri chizig'i (soat bo'yicha to'plangan) va o'rtacha kelish ---
		const arrivalHours = Array(24).fill(0)
		let arrivalSum = 0, arrivalN = 0
		for (const f of firstIns) {
			const hm = hhmm(f.first); const m = minutesOf(hm)
			arrivalHours[Math.floor(m / 60)]++; arrivalSum += m; arrivalN++
		}
		let acc = 0
		const arrivalCurve = arrivalHours.map(n => (acc += n))
		const avg = arrivalN ? Math.round(arrivalSum / arrivalN) : null

		// --- 14 kunlik davomat ---
		const trendMap = new Map(trendRows.map(r => [r._id, r.came]))
		const attendanceTrend = []
		for (let i = 13; i >= 0; i--) { const d = shift(dateString, -i); if (new Date(`${d}T00:00:00Z`).getUTCDay() === 0) continue; attendanceTrend.push({ date: d, came: trendMap.get(d) || 0, percent: pct(trendMap.get(d) || 0, total) }) }

		// --- 7 kunlik soatlik issiqlik xaritasi ---
		// Aqlli kuzatuv (kameradagi harakat, %) bor bo'lsa xarita shu asosda, aks holda kamera hodisalari soni bo'yicha
		const visHeatRows = await visionMetricModel.aggregate([
			{ $match: { schoolId: school, camera: { $in: camIds }, dateString: { $gte: heatFrom, $lte: dateString }, count: { $gt: 0 } } },
			{ $group: { _id: { d: '$dateString', h: '$hour' }, sum: { $sum: { $cond: [{ $isNumber: '$activity' }, '$activity', 0] } }, n: { $sum: { $cond: [{ $isNumber: '$activity' }, 1, 0] } } } }
		])
		const visHeat = new Map(visHeatRows.filter(r => r.n > 0).map(r => [`${r._id.d}|${r._id.h}`, Math.round(r.sum / r.n * 1000) / 10]))
		const heatSource = visHeat.size ? 'vision' : 'events'
		const heatMap = heatSource === 'vision' ? visHeat : new Map(heat.map(r => [`${r._id.d}|${r._id.h}`, r.n]))
		const heatmap = []
		for (let i = 6; i >= 0; i--) {
			const d = shift(dateString, -i)
			if (new Date(`${d}T00:00:00Z`).getUTCDay() === 0) continue
			heatmap.push({ date: d, hours: Array.from({ length: 24 }, (_, h) => heatMap.get(`${d}|${h}`) || 0) })
		}

		// --- sinflar orasidagi o'rni ---
		const rosterMap = new Map(rosters.map(r => [String(r._id), r.total]))
		const cameMap = new Map(cameInSchool.map(r => [String(r._id), r.came]))
		const ranking = allSinfs.map(s => ({ _id: s._id, name: s.name, total: rosterMap.get(String(s._id)) || 0, came: cameMap.get(String(s._id)) || 0 }))
			.filter(s => s.total > 0).map(s => ({ ...s, percent: pct(s.came, s.total) })).sort((a, b) => b.percent - a.percent)
		const schoolAvg = pct(ranking.reduce((a, s) => a + s.came, 0), ranking.reduce((a, s) => a + s.total, 0))
		const myPercent = pct(came, total)

		// --- hodisalar tahlili ---
		const hours = cls.hours, act = cls.actHours
		const lessonHours = act.slice(LESSON[0], LESSON[1])
		const peakHour = act.reduce((best, n, h) => (n > act[best] ? h : best), 0)
		const quietHour = lessonHours.length ? LESSON[0] + lessonHours.reduce((best, n, i) => (n < lessonHours[best] ? i : best), 0) : null
		const kinds = Object.fromEntries(kindRows.map(r => [r._id, r.n]))

		// --- kameraga bog'liq bo'lmagan tahlillar (faqat davomat asosida) ---
		const dailyMap = new Map(daily56.map(r => [r._id, r.came]))
		const schoolDays = [...dailyMap.keys()].filter(d => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0 && dailyMap.get(d) > 0).sort()
		const WD = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']
		const wdAcc = new Map(), weekAcc = new Map()
		for (const d of schoolDays) {
			const p = pct(dailyMap.get(d), total)
			const wd = new Date(`${d}T00:00:00Z`).getUTCDay()
			const w = wdAcc.get(wd) || { sum: 0, n: 0 }; w.sum += p; w.n++; wdAcc.set(wd, w)
			const monday = shift(d, -((wd + 6) % 7))
			const k = weekAcc.get(monday) || { sum: 0, n: 0 }; k.sum += p; k.n++; weekAcc.set(monday, k)
		}
		const days30 = schoolDays.filter(d => d >= from30).length
		const presentMap = new Map(perStudent.map(r => [String(r._id), r.present]))
		const lateMap = new Map(lateRows.map(r => [String(r._id), r]))
		const per = students.map(st => ({ _id: st._id, fullName: st.fullName, code: publicCode(st.studentIdNumber), present: presentMap.get(String(st._id)) || 0, days: days30, lateDays: lateMap.get(String(st._id))?.lateDays || 0 }))
			.map(x => ({ ...x, percent: pct(x.present, x.days) }))
		const insights = {
			days30,
			weekday: [1, 2, 3, 4, 5, 6].filter(wd => wdAcc.has(wd)).map(wd => ({ day: WD[wd], percent: Math.round((wdAcc.get(wd).sum / wdAcc.get(wd).n) * 10) / 10, days: wdAcc.get(wd).n })),
			weekly: [...weekAcc.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, v]) => ({ week, percent: Math.round((v.sum / v.n) * 10) / 10 })),
			lowest: days30 >= 3 ? [...per].sort((a, b) => a.percent - b.percent || a.fullName.localeCompare(b.fullName)).slice(0, 8) : [],
			mostLate: [...per].filter(x => x.lateDays > 0).sort((a, b) => b.lateDays - a.lateDays).slice(0, 8),
			avg30: days30 ? Math.round(per.reduce((a, x) => a + x.percent, 0) / Math.max(per.length, 1) * 10) / 10 : 0
		}

		return {
			success: true, dateString, lessonHours: LESSON, workStartTime: start, hasCamera: camIds.length > 0, insights,
			class: { _id: cls._id, name: cls.name, head: cls.head, description: cls.description },
			school: { _id: schoolId },
			analysis: cls.analysis, cameras: cls.cameras, hours, actHours: act, baseline: cls.baseline, daily: cls.daily, eventsToday: cls.events,
			attendance: { total, came, inside, absent: absent.length, late: late.length, percent: myPercent, avgArrival: avg === null ? null : `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`, firstArrival: arrivalHours.findIndex(n => n > 0) },
			absentList: absent, lateList: late.slice(0, 30),
			arrivalCurve: arrivalCurve.slice(5, 16).map((n, i) => ({ hour: i + 5, students: n })),
			attendanceTrend, heatmap, heatSource,
			comparison: { schoolAvg, diff: Math.round((myPercent - schoolAvg) * 10) / 10, rank: ranking.findIndex(s => String(s._id) === String(sinfId)) + 1, of: ranking.length, classes: ranking },
			activity: { total: act.reduce((a, b) => a + b, 0), peakHour: act[peakHour] > 0 ? peakHour : null, quietHour, signalsTotal: SIGNALS.reduce((a, k) => a + (cls.events[k] || 0), 0), week: kinds },
			events: events.map(e => ({ _id: e._id, kind: e.kind, time: e.time, camera: e.camera?.name || '', hasSnapshot: !!e.snapshot })),
			gallery: gallery.map(e => ({ _id: e._id, kind: e.kind, time: e.time, camera: e.camera?.name || '', title: e.title || '', detail: e.detail || '', count: e.count ?? null, hasClip: !!e.clip }))
		}
	}
}

module.exports = new HikClassroomService()
