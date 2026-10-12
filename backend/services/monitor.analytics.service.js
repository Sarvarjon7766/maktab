// 'monitor' roli uchun chuqur tahlillar — FAQAT o'qish. Har bir natija "tafsilot"li: qaysi maktab, sinf, shaxs yoki
// hodisadan kelib chiqqani identifikatorlari bilan qaytariladi, shunda UI har bir raqamdan manbaga o'ta oladi.
const mongoose = require('mongoose')
const { pageLate, MAX_ALL } = require('../utils/listPaging')
const lateCache = new Map() // sahifalangan kech qolganlar reytingi: kalit -> { t, entries } (60 soniya)
const { publicCode } = require('../utils/publicCode')
const schoolModel = require('../models/school.model')
const userModel = require('../models/user.model')
const studentModel = require('../models/student.model')
const sinfModel = require('../models/sinf.model')
const settingsModel = require('../models/settings.model')
const cameraModel = require('../models/camera.model')
const hikCameraModel = require('../models/hik.camera.model')
const hikCameraEventModel = require('../models/hik.cameraevent.model')
const studentExcuseModel = require('../models/student.excuse.model')
const StudentExcuseService = require('./student.excuse.service')
const attendanceModel = require('../models/attandance.model')
const studentAttendanceModel = require('../models/student.attandance.model')
const attendanceLogModel = require('../models/attandance.log.model')
const studentAttendanceLogModel = require('../models/student.attandance.log.model')
const MonitorService = require('./monitor.service')
const HikService = require('./hikconnect.service')
const ExcuseService = require('./excuse.service')
const employeeCommentModel = require('../models/employee.comment.model')
const { schoolFilter, schoolCond, inScope, scopeKey } = require('../utils/monitorScope')

const TZ = 'Asia/Tashkent'
const STAFF_ROLES = ['viewer', 'leader']
const CAME = ['ishda', 'tashqarida']
const MAX_RANGE_DAYS = 62

const PERSON = {
	student: { model: studentModel, att: studentAttendanceModel, log: studentAttendanceLogModel, field: 'student' },
	staff: { model: userModel, att: attendanceModel, log: attendanceLogModel, field: 'user' }
}

// Ko'p maktab bo'yicha so'rovlarni cheklangan parallellik bilan bajaradi (baza yuklanmasligi uchun)
const pool = async (items, fn, n = 8) => {
	const out = new Array(items.length)
	let i = 0
	await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) } }))
	return out
}

const todayString = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const { isDate, cleanQ } = require('../utils/dateStr')
const oid = (id) => new mongoose.Types.ObjectId(String(id))
const validId = (id) => mongoose.isValidObjectId(id)
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0)
const escapeRx = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const HHMM_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const hhmm = (d) => (d ? HHMM_FMT.format(new Date(d)) : null)
const minutesOf = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const shift = (dateStr, days) => { const d = new Date(`${dateStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }

function resolveRange(from, to) {
	const end = isDate(to) ? to : todayString()
	let start = isDate(from) ? from : shift(end, -29)
	if (start > end) start = end
	const days = Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000) + 1
	if (days > MAX_RANGE_DAYS) start = shift(end, -(MAX_RANGE_DAYS - 1))
	return { from: start, to: end }
}

const PEOPLE_CAP = 200000

// Maktab nomlari va ish boshlanish vaqti (daqiqada)
async function schoolMaps() {
	const sc = schoolCond()
	const [schools, settings] = await Promise.all([schoolModel.find(schoolFilter()).select('name region district isActive').lean(), settingsModel.find(sc ? { schoolId: sc } : {}).select('schoolId workStartTime').lean()])
	const names = new Map(schools.map(s => [String(s._id), s.name]))
	const start = new Map()
	for (const s of schools) start.set(String(s._id), '09:00')
	for (const st of settings) if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(st.workStartTime)) start.set(String(st.schoolId), st.workStartTime)
	return { schools, names, start }
}

class MonitorAnalyticsService {
	// ---------- 1) Butun tizim bo'yicha shaxslar ro'yxati (kelmaganlar, kech qolganlar, ...) ----------
	async peopleAll({ kind, status, date, schoolId, sinfId, q, page, limit }) {
		const P = PERSON[kind]
		if (!P) return { success: false, status: 400, message: "Tur noto'g'ri" }
		const dateString = isDate(date) ? date : todayString()
		const { names, start } = await schoolMaps()
		const filter = kind === 'staff' ? { schoolId: { $ne: null }, role: { $in: STAFF_ROLES }, isActive: { $ne: false } } : { isActive: { $ne: false } }
		const sc = schoolCond(validId(schoolId) ? schoolId : null)
		if (sc) filter.schoolId = sc
		if (validId(sinfId)) filter.sinf = oid(sinfId)
		const text = cleanQ(q)
		if (text) { const rx = new RegExp(escapeRx(text), 'i'); filter.$or = kind === 'staff' ? [{ fullName: rx }, { hodimID: rx }, { position: rx }] : [{ fullName: rx }, { studentIdNumber: rx }] }
		const select = kind === 'staff' ? 'fullName hodimID position sinf schoolId photo' : 'fullName studentIdNumber sinf schoolId photo'
		// schoolId har doim beriladi: indeks (schoolId, dateString, ...) shundagina ishlaydi, aks holda butun jadval skanerlanadi
		const dayMatch = { dateString, schoolId: sc && validId(schoolId) ? sc : { $in: [...names.keys()].map(oid) } }
		const [people, sinfRows] = await Promise.all([
			P.model.find(filter).select(select).sort({ fullName: 1 }).limit(PEOPLE_CAP).lean(),
			sinfModel.find(sc ? { schoolId: sc } : {}).select('name').lean()
		])
		const sinfNames = new Map(sinfRows.map(x => [String(x._id), x.name]))
		const [atts, logs] = await Promise.all([
			P.att.find(dayMatch).select(`${P.field} status totalTime`).lean(),
			P.log.aggregate([
				{ $match: dayMatch },
				{ $group: { _id: '$' + P.field, firstIn: { $min: '$checkInTime' }, lastOut: { $max: '$checkOutTime' } } }
			])
		])
		const truncated = people.length >= PEOPLE_CAP
		if (truncated) console.warn('peopleAll: ' + PEOPLE_CAP + ' ta yozuv chegarasiga yetildi, natija kesilgan (kind=' + kind + ')')
		const attMap = new Map(atts.map(a => [String(a[P.field]), a]))
		const logMap = new Map(logs.map(l => [String(l._id), l]))
		const rows = people.map(p => {
			const a = attMap.get(String(p._id)); const lg = logMap.get(String(p._id))
			const came = !!a && CAME.includes(a.status)
			const firstIn = hhmm(lg?.firstIn)
			const limit = minutesOf(start.get(String(p.schoolId)))
			return {
				_id: p._id, fullName: p.fullName, photo: p.photo || null, code: kind === 'staff' ? publicCode(p.hodimID) : publicCode(p.studentIdNumber), position: p.position || '', sinf: sinfNames.get(String(p.sinf)) || '',
				schoolId: p.schoolId, schoolName: names.get(String(p.schoolId)) || '',
				status: !came ? 'absent' : a.status === 'ishda' ? 'inside' : 'out', late: !!(came && firstIn && limit !== null && minutesOf(firstIn) > limit),
				firstIn, lastOut: hhmm(lg?.lastOut), totalTime: a?.totalTime || null
			}
		})
		const summary = { total: rows.length, came: rows.filter(r => r.status !== 'absent').length, inside: rows.filter(r => r.status === 'inside').length, absent: rows.filter(r => r.status === 'absent').length, late: rows.filter(r => r.late).length }
		const wanted = { came: r => r.status !== 'absent', inside: r => r.status === 'inside', out: r => r.status === 'out', absent: r => r.status === 'absent', late: r => r.late }[status]
		const filtered = wanted ? rows.filter(wanted) : rows
		const size = Math.min(Math.max(Number(limit) || 50, 10), 200)
		const pages = Math.max(1, Math.ceil(filtered.length / size))
		const current = Math.min(Math.max(Number(page) || 1, 1), pages)
		// maktablar kesimi (tafsilot: qaysi maktabdan nechtasi)
		const bySchool = new Map()
		for (const r of filtered) { const k = String(r.schoolId); bySchool.set(k, (bySchool.get(k) || 0) + 1) }
		return {
			success: true, dateString, summary, ...(truncated ? { truncated: true } : {}), total: filtered.length, page: current, pages,
			bySchool: [...bySchool.entries()].map(([id, n]) => ({ schoolId: id, schoolName: names.get(id) || '', n })).sort((a, b) => b.n - a.n).slice(0, 15),
			people: filtered.slice((current - 1) * size, current * size)
		}
	}

	// ---------- 2) Eng ko'p kech qolganlar (shaxslar reytingi) ----------
	// page berilsa (yoki all=1) — sahifalangan rejim: hamma kech qolganlar hisoblanadi (keshlanadi), qidiruv/filtr/saralash/sahifa
	// serverda bajariladi. page bo'lmasa avvalgi xatti-harakat: eng ko'p kech qolgan `limit` ta (hisobotlar, bosh sahifa kartalari)
	async latePeople({ kind, from, to, schoolId, limit, sinfIds, page, pageSize, q, group, sort, all }) {
		const P = PERSON[kind]
		if (!P) return { success: false, status: 400, message: "Tur noto'g'ri" }
		const range = resolveRange(from, to)
		const paged = page !== undefined || (all !== undefined && all !== '' && all !== '0')
		const cacheKey = paged ? `${scopeKey()}|${kind}|${range.from}|${range.to}|${schoolId || ''}|${Array.isArray(sinfIds) ? sinfIds.join(',') : ''}` : null
		if (cacheKey) {
			const hit = lateCache.get(cacheKey)
			if (hit && Date.now() - hit.t < 60000) return { success: true, ...range, kind, totalLatePeople: hit.entries.length, ...pageLate(hit.entries, kind, { q, group, sort, page, pageSize, all }) }
		}
		// sinf rahbari: faqat o'z sinflari o'quvchilari
		let only = {}
		if (Array.isArray(sinfIds)) only = { [P.field]: { $in: (await studentModel.find({ sinf: { $in: sinfIds.map(oid) } }).select('_id').lean()).map(x => x._id) } }
		const { schools, names, start } = await schoolMaps()
		const targets = validId(schoolId) ? schools.filter(s => String(s._id) === String(schoolId)) : schools
		const rows = []
		await pool(targets, async (school) => {
			const limitStr = start.get(String(school._id))
			const agg = await P.log.aggregate([
				{ $match: { schoolId: school._id, dateString: { $gte: range.from, $lte: range.to }, checkin: true, checkInTime: { $ne: null }, ...only } },
				{ $group: { _id: { p: '$' + P.field, d: '$dateString' }, first: { $min: '$checkInTime' } } },
				{ $project: { p: '$_id.p', d: '$_id.d', hm: { $dateToString: { date: { $add: ['$first', 18000000] }, format: '%H:%M' } } } },
				{ $group: { _id: '$p', days: { $sum: 1 }, lateDays: { $sum: { $cond: [{ $gt: ['$hm', limitStr] }, 1, 0] } }, worst: { $max: '$hm' } } },
				{ $match: { lateDays: { $gt: 0 } } },
				{ $sort: { lateDays: -1 } }, { $limit: paged ? 5000 : 300 }
			])
			agg.forEach(r => rows.push({ ...r, schoolId: school._id, limitStr }))
		})
		rows.sort((a, b) => b.lateDays - a.lateDays || pct(b.lateDays, b.days) - pct(a.lateDays, a.days))
		const top = paged ? rows.slice(0, MAX_ALL) : rows.slice(0, Math.min(Number(limit) || 100, 300))
		const people = await P.model.find({ _id: { $in: top.map(r => r._id) } }).select('fullName hodimID studentIdNumber position sinf photo').populate('sinf', 'name').lean()
		const map = new Map(people.map(p => [String(p._id), p]))
		const entries = top.map(r => {
			const p = map.get(String(r._id)) || {}
			return {
				_id: r._id, fullName: p.fullName || '—', photo: p.photo || '', code: kind === 'staff' ? publicCode(p.hodimID) : publicCode(p.studentIdNumber), position: p.position || '', sinf: p.sinf?.name || '',
				schoolId: r.schoolId, schoolName: names.get(String(r.schoolId)) || '', days: r.days, lateDays: r.lateDays, percent: pct(r.lateDays, r.days), worst: r.worst, limit: r.limitStr
			}
		})
		if (paged) {
			lateCache.set(cacheKey, { t: Date.now(), entries })
			if (lateCache.size > 40) lateCache.delete(lateCache.keys().next().value)
			return { success: true, ...range, kind, totalLatePeople: rows.length, ...pageLate(entries, kind, { q, group, sort, page, pageSize, all }) }
		}
		return { success: true, ...range, kind, totalLatePeople: rows.length, people: entries }
	}

	// ---------- 3) Xavf guruhi: tez-tez kelmaydigan yoki ketma-ket kelmayotgan o'quvchilar ----------
	async atRisk({ from, to, schoolId, minStreak, limit, sinfIds }) {
		const range = resolveRange(from, to)
		const streakMin = Math.max(Number(minStreak) || 3, 2)
		const { schools, names } = await schoolMaps()
		const targets = validId(schoolId) ? schools.filter(s => String(s._id) === String(schoolId)) : schools
		const rows = []
		await pool(targets, async (school) => {
			const opened = (await studentAttendanceModel.distinct('dateString', { schoolId: school._id, dateString: { $gte: range.from, $lte: range.to } }))
				.filter(d => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0).sort()
			if (opened.length < 3) return
			const [students, present] = await Promise.all([
				studentModel.find({ schoolId: school._id, isActive: { $ne: false }, ...(Array.isArray(sinfIds) ? { sinf: { $in: sinfIds.map(oid) } } : {}) }).select('fullName studentIdNumber sinf photo').populate('sinf', 'name').lean(),
				studentAttendanceModel.aggregate([
					{ $match: { schoolId: school._id, dateString: { $in: opened }, status: { $in: CAME } } },
					{ $group: { _id: '$student', dates: { $addToSet: '$dateString' } } }
				])
			])
			const map = new Map(present.map(p => [String(p._id), new Set(p.dates)]))
			for (const s of students) {
				const set = map.get(String(s._id)) || new Set()
				const presentDays = opened.filter(d => set.has(d)).length
				let streak = 0
				for (let i = opened.length - 1; i >= 0 && !set.has(opened[i]); i--) streak++
				const absent = opened.length - presentDays
				if (streak >= streakMin || pct(absent, opened.length) >= 30) {
					rows.push({
						_id: s._id, fullName: s.fullName, photo: s.photo || '', code: publicCode(s.studentIdNumber), sinf: s.sinf?.name || '', schoolId: school._id, schoolName: names.get(String(school._id)) || '',
						schoolDays: opened.length, present: presentDays, absent, percent: pct(presentDays, opened.length), streak, lastPresent: [...set].sort().pop() || null
					})
				}
			}
		})
		rows.sort((a, b) => b.streak - a.streak || a.percent - b.percent)
		const cap = Math.min(Number(limit) || 200, 500)
		return { success: true, ...range, minStreak: streakMin, total: rows.length, students: rows.slice(0, cap) }
	}

	// ---------- 4) Sinflar reytingi (butun tizim) ----------
	async classesAll({ date, schoolId }) {
		const dateString = isDate(date) ? date : todayString()
		const { names } = await schoolMaps()
		const sinfFilter = schoolCond(validId(schoolId) ? schoolId : null) ? { schoolId: schoolCond(validId(schoolId) ? schoolId : null) } : {}
		const [sinfs, students] = await Promise.all([
			sinfModel.find(sinfFilter).populate('head', 'fullName').lean(),
			studentModel.find({ ...sinfFilter, isActive: { $ne: false } }).select('sinf').lean()
		])
		// o'quvchi -> sinf xaritasi xotirada; davomat maktabma-maktab (indeksdan) olinadi, $lookup ishlatilmaydi
		const total = new Map(), classOf = new Map()
		for (const st of students) { const k = String(st.sinf); total.set(k, (total.get(k) || 0) + 1); classOf.set(String(st._id), k) }
		const att = new Map()
		await pool([...new Set(sinfs.map(x => String(x.schoolId)))], async (id) => {
			const rows = await studentAttendanceModel.aggregate([
				{ $match: { schoolId: oid(id), dateString, status: { $in: CAME } } },
				{ $group: { _id: '$student', inside: { $max: { $cond: [{ $eq: ['$status', 'ishda'] }, 1, 0] } } } }
			])
			for (const r of rows) {
				const cls = classOf.get(String(r._id)); if (!cls) continue
				const x = att.get(cls) || { came: 0, inside: 0 }
				x.came++; x.inside += r.inside; att.set(cls, x)
			}
		}, 8)
		const classes = sinfs.map(s => {
			const t = total.get(String(s._id)) || 0, came = att.get(String(s._id))?.came || 0
			return { _id: s._id, name: s.name, head: s.head?.fullName || null, schoolId: s.schoolId, schoolName: names.get(String(s.schoolId)) || '', total: t, came, inside: att.get(String(s._id))?.inside || 0, absent: Math.max(0, t - came), percent: pct(came, t) }
		}).filter(c => c.total > 0)
		return { success: true, dateString, classes }
	}

	// ---------- 5) Kelish vaqti taqsimoti va maktablar bo'yicha o'rtacha ----------
	async arrival({ from, to, schoolId }) {
		const range = resolveRange(from, to)
		const { schools: allSchools, names } = await schoolMaps()
		const targets = validId(schoolId) ? allSchools.filter(x => String(x._id) === String(schoolId)) : allSchools
		const out = { success: true, ...range }
		await Promise.all(['student', 'staff'].map(async (kind) => {
			const P = PERSON[kind]
			// maktabma-maktab (schoolId indeks prefiksi), cheklangan parallellik bilan; natijalar keyin birlashtiriladi
			const bucketMap = new Map(), schoolRows = []
			await pool(targets, async (school) => {
				const rows = await P.log.aggregate([
					{ $match: { schoolId: school._id, dateString: { $gte: range.from, $lte: range.to }, checkin: true, checkInTime: { $ne: null } } },
					{ $group: { _id: { p: '$' + P.field, d: '$dateString' }, first: { $min: '$checkInTime' } } },
					{ $project: { min: { $mod: [{ $add: [{ $multiply: [{ $hour: '$first' }, 60] }, { $minute: '$first' }, 300] }, 1440] } } },
					{ $facet: {
						buckets: [{ $group: { _id: { $multiply: [{ $floor: { $divide: ['$min', 15] } }, 15] }, n: { $sum: 1 } } }],
						avg: [{ $group: { _id: null, avg: { $avg: '$min' }, n: { $sum: 1 } } }]
					} }
				])
				const r = rows[0]
				if (!r) return
				for (const b of r.buckets) bucketMap.set(b._id, (bucketMap.get(b._id) || 0) + b.n)
				if (r.avg[0]) schoolRows.push({ _id: school._id, avg: r.avg[0].avg, n: r.avg[0].n })
			}, 8)
			const f = { buckets: [...bucketMap.entries()].map(([id, n]) => ({ _id: id, n })).sort((a, b) => a._id - b._id), schools: schoolRows.sort((a, b) => a.avg - b.avg) }
			const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`
			out[kind] = {
				buckets: f.buckets.filter(b => b._id >= 300 && b._id <= 780).map(b => ({ time: fmt(b._id), n: b.n })),
				total: f.buckets.reduce((a, b) => a + b.n, 0),
				schools: f.schools.map(s => ({ schoolId: s._id, schoolName: names.get(String(s._id)) || '', avgMin: Math.round(s.avg), avg: fmt(s.avg), n: s.n }))
			}
		}))
		return out
	}

	// ---------- 6) Kamera hodisalari (tafsilot: har bir hodisa vaqti, kamerasi, sinfi bilan) ----------
	async cameraEvents({ schoolId, kind, from, to, page, limit }) {
		const range = resolveRange(from, to)
		const { names } = await schoolMaps()
		const match = { dateString: { $gte: range.from, $lte: range.to } }
		const scEv = schoolCond(validId(schoolId) ? schoolId : null)
		if (scEv) match.schoolId = scEv
		if (kind) match.kind = String(kind)
		const size = Math.min(Math.max(Number(limit) || 50, 10), 200)
		const total = await hikCameraEventModel.countDocuments(match)
		const pages = Math.max(1, Math.ceil(total / size))
		const current = Math.min(Math.max(Number(page) || 1, 1), pages)
		const [events, byKind, byDay, bySchool] = await Promise.all([
			hikCameraEventModel.find(match).sort({ time: -1 }).skip((current - 1) * size).limit(size).populate('camera', 'name areaName').populate('sinfId', 'name').lean(),
			hikCameraEventModel.aggregate([{ $match: match }, { $group: { _id: '$kind', n: { $sum: 1 } } }]),
			hikCameraEventModel.aggregate([{ $match: match }, { $group: { _id: { d: '$dateString', k: '$kind' }, n: { $sum: 1 } } }]),
			hikCameraEventModel.aggregate([{ $match: match }, { $group: { _id: '$schoolId', n: { $sum: 1 }, density: { $sum: { $cond: [{ $in: ['$kind', ['density', 'people']] }, 1, 0] } } } }, { $sort: { n: -1 } }, { $limit: 15 }])
		])
		const days = {}
		for (const r of byDay) { const d = r._id.d; if (!days[d]) days[d] = { date: d }; days[d][r._id.k] = r.n }
		return {
			success: true, ...range, total, page: current, pages,
			byKind: byKind.map(r => ({ kind: r._id, n: r.n })),
			byDay: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
			bySchool: bySchool.map(r => ({ schoolId: r._id, schoolName: names.get(String(r._id)) || '', n: r.n, density: r.density })),
			events: events.map(e => ({ _id: e._id, time: e.time, kind: e.kind, eventType: e.eventType, schoolId: e.schoolId, schoolName: names.get(String(e.schoolId)) || '', camera: e.camera?.name || '', area: e.camera?.areaName || '', sinf: e.sinfId?.name || '', sinfId: e.sinfId?._id || null }))
		}
	}

	// ---------- Sinf darajalari bo'yicha umumiy statistika: barcha maktablarning 1-sinflari, 2-sinflari ... 11-sinflari ----------
	// Sinf nomining boshidagi raqam daraja hisoblanadi ("5-A" -> 5). Davomat = kelgan kunlar / (o'quvchi x o'quv kunlari).
	// Har raqam manbasi bilan qaytariladi: kelgan kunlar (present) va mumkin bo'lgan kunlar (possible), kunlik qator (daily)
	// `grade` berilsa, faqat shu daraja hisoblanadi va uning sinflari ro'yxati qaytariladi (tez); bermasa, darajalar yig'indisi
	async gradesReport({ from, to, grade, schoolId, sinfIds }) {
		const range = resolveRange(from, to)
		const scG = schoolCond(validId(schoolId) ? schoolId : null)
		const schoolFilter = scG ? { schoolId: scG } : {}
		const { names, start } = await schoolMaps()
		const dates = []
		for (let d = range.from; d <= range.to; d = shift(d, 1)) if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) dates.push(d)
		const gradeOf = (name) => { const m = /^\s*(\d{1,2})/.exec(name || ''); const g = m ? Number(m[1]) : 0; return g >= 1 && g <= 12 ? g : 0 }
		const only = Number(grade) >= 1 ? Number(grade) : 0
		const limitedSinfs = Array.isArray(sinfIds)
		const allSinfs = await sinfModel.find({ ...schoolFilter, ...(limitedSinfs ? { _id: { $in: sinfIds.map(oid) } } : {}) }).select('name schoolId grade').lean()
		const sinfs = only ? allSinfs.filter(x => (x.grade >= 1 && x.grade <= 12 ? x.grade : gradeOf(x.name)) === only) : allSinfs
		const students = await studentModel.find({ isActive: { $ne: false }, ...schoolFilter, ...(only || limitedSinfs ? { sinf: { $in: sinfs.map(x => x._id) } } : {}) }).select('sinf schoolId').lean()
		// faqat sinf rahbarining o'z o'quvchilari bo'lsa ro'yxat bo'yicha filtrlanadi; aks holda maktab bo'yicha (indeksdan, qoplovchi)
		const studentFilter = limitedSinfs ? { student: { $in: students.map(x => x._id) } } : {}
		// maktabma-maktab (schoolId indeks prefiksi) cheklangan parallellik bilan: sana oralig'i bo'yicha
		const schoolIdsAll = [...new Set(sinfs.map(x => String(x.schoolId)))]
		const perDay = [], perStudentDay = []
		await pool(schoolIdsAll, async (id) => {
			const base = { schoolId: oid(id), dateString: { $gte: range.from, $lte: range.to }, status: { $in: CAME }, ...studentFilter }
			const [days, perStudent] = await Promise.all([
				studentAttendanceModel.aggregate([{ $match: base }, { $group: { _id: '$dateString', came: { $sum: 1 } } }]),
				// umumiy ko'rinishda faqat o'quvchi bo'yicha soni (tez); daraja sahifasida kunma-kun
				studentAttendanceModel.aggregate([{ $match: base }, { $group: only ? { _id: { s: '$student', d: '$dateString' } } : { _id: { s: '$student' }, n: { $sum: 1 } } }])
			])
			for (const r of days) if (r._id !== null && new Date(`${r._id}T00:00:00Z`).getUTCDay() !== 0) perDay.push({ _id: { s: id, d: r._id }, came: r.came })
			for (const r of perStudent) perStudentDay.push(r)
		}, 8)
		// har maktabning o'quv kunlari (davomat yozilgan kunlar) va har kuni ma'lumot bor maktablar
		const schoolDays = new Map(), schoolsOnDay = new Map()
		for (const r of perDay) {
			if (r.came <= 0) continue
			schoolDays.set(String(r._id.s), (schoolDays.get(String(r._id.s)) || 0) + 1)
			if (!schoolsOnDay.has(r._id.d)) schoolsOnDay.set(r._id.d, new Set())
			schoolsOnDay.get(r._id.d).add(String(r._id.s))
		}
		const classGrade = new Map(sinfs.map(x => [String(x._id), x.grade >= 1 && x.grade <= 12 ? x.grade : gradeOf(x.name)]))
		const studentClass = new Map(students.map(x => [String(x._id), String(x.sinf)]))
		const presentOf = new Map(), dailyCame = new Map()
		for (const r of perStudentDay) {
			const sid = String(r._id.s)
			const cls = studentClass.get(sid)
			if (!cls) continue
			presentOf.set(sid, (presentOf.get(sid) || 0) + (r.n || 1))
			if (!only) continue
			const g = classGrade.get(cls)
			if (!g) continue
			const key = `${g}|${r._id.d}`
			dailyCame.set(key, (dailyCame.get(key) || 0) + 1)
		}

		// kech qolish: har maktab bo'yicha (ish boshlanish vaqti maktabga qarab)
		const lateOf = new Map()
		const schoolIds = [...new Set(sinfs.map(x => String(x.schoolId)))]
		await pool(schoolIds, async (id) => {
			const limit = start.get(id) || '09:00'
			const rows = await studentAttendanceLogModel.aggregate([
				{ $match: { schoolId: oid(id), dateString: { $gte: range.from, $lte: range.to }, checkin: true, checkInTime: { $ne: null }, ...studentFilter } },
				{ $group: { _id: { p: '$student', d: '$dateString' }, first: { $min: '$checkInTime' } } },
				{ $project: { p: '$_id.p', hm: { $dateToString: { date: { $add: ['$first', 18000000] }, format: '%H:%M' } } } },
				{ $group: { _id: '$p', late: { $sum: { $cond: [{ $gt: ['$hm', limit] }, 1, 0] } } } }
			])
			rows.forEach(r => lateOf.set(String(r._id), r.late))
		}, 8)

		const byClass = new Map(sinfs.map(x => [String(x._id), { _id: x._id, schoolId: x.schoolId, schoolName: names.get(String(x.schoolId)) || '', name: x.name, students: 0, present: 0, late: 0 }]))
		for (const st of students) {
			const c = byClass.get(String(st.sinf))
			if (!c) continue
			c.students++; c.present += presentOf.get(String(st._id)) || 0; c.late += lateOf.get(String(st._id)) || 0
		}
		const grades = new Map()
		const classes = []
		for (const c of byClass.values()) {
			const g = classGrade.get(String(c._id))
			if (!g) continue
			const days = schoolDays.get(String(c.schoolId)) || 0
			const possible = c.students * days
			classes.push({ ...c, grade: g, days, possible, percent: possible ? pct(c.present, possible) : null, latePercent: c.present ? pct(c.late, c.present) : null })
			if (!grades.has(g)) grades.set(g, { grade: g, classes: 0, students: 0, present: 0, possible: 0, late: 0, schools: new Set(), perSchool: new Map() })
			const x = grades.get(g)
			x.classes++; x.students += c.students; x.present += c.present; x.possible += possible; x.late += c.late; x.schools.add(String(c.schoolId))
			x.perSchool.set(String(c.schoolId), (x.perSchool.get(String(c.schoolId)) || 0) + c.students)
		}
		const rows = [...grades.values()].sort((a, b) => a.grade - b.grade).map(x => {
			const list = classes.filter(c => c.grade === x.grade && c.percent !== null).sort((a, b) => b.percent - a.percent)
			const pick = (c) => (c ? { _id: c._id, schoolId: c.schoolId, schoolName: c.schoolName, name: c.name, percent: c.percent } : null)
			const daily = !only ? [] : dates.filter(d => schoolsOnDay.has(d)).map(d => {
				const possible = [...schoolsOnDay.get(d)].reduce((a, sid) => a + (x.perSchool.get(sid) || 0), 0)
				const came = dailyCame.get(`${x.grade}|${d}`) || 0
				return { date: d, came, possible, percent: possible ? pct(came, possible) : null }
			})
			return {
				grade: x.grade, classes: x.classes, students: x.students, schools: x.schools.size, present: x.present, possible: x.possible, late: x.late,
				percent: x.possible ? pct(x.present, x.possible) : null, latePercent: x.present ? pct(x.late, x.present) : null,
				best: pick(list[0]), worst: list.length > 1 ? pick(list.at(-1)) : null, daily
			}
		})
		const scored = rows.filter(r => r.percent !== null)
		const totalPossible = scored.reduce((a, r) => a + r.possible, 0), totalPresent = scored.reduce((a, r) => a + r.present, 0)
		return { success: true, ...range, schoolDays: dates.length, overall: totalPossible ? pct(totalPresent, totalPossible) : null, overallPresent: totalPresent, overallPossible: totalPossible, grades: rows, classCount: classes.length, classes: only ? classes : [] }
	}

	// Bitta sinf: kunlik davomat va har bir o'quvchining kelgan/kelmagan/kech qolgan kunlari (raqamning manbasi)
	async gradeClassDetail({ sinfId, from, to, schoolId, sinfIds }) {
		if (!validId(sinfId)) return { success: false, message: "Sinf noto'g'ri" }
		const range = resolveRange(from, to)
		const sinf = await sinfModel.findById(sinfId).populate('head', 'fullName').lean()
		if (!sinf || !inScope(sinf.schoolId) || (validId(schoolId) && String(sinf.schoolId) !== String(schoolId)) || (Array.isArray(sinfIds) && !sinfIds.map(String).includes(String(sinf._id)))) return { success: false, message: 'Sinf topilmadi' }
		const { names, start } = await schoolMaps()
		const limit = start.get(String(sinf.schoolId)) || '09:00'
		const students = await studentModel.find({ sinf: sinf._id, isActive: { $ne: false } }).select('fullName studentIdNumber photo').sort({ fullName: 1 }).lean()
		const ids = students.map(x => x._id)
		const [came, firstIn] = await Promise.all([
			studentAttendanceModel.aggregate([
				{ $match: { schoolId: sinf.schoolId, student: { $in: ids }, dateString: { $gte: range.from, $lte: range.to }, status: { $in: CAME } } },
				{ $group: { _id: { s: '$student', d: '$dateString' } } }
			]),
			studentAttendanceLogModel.aggregate([
				{ $match: { schoolId: sinf.schoolId, student: { $in: ids }, dateString: { $gte: range.from, $lte: range.to }, checkin: true, checkInTime: { $ne: null } } },
				{ $group: { _id: { s: '$student', d: '$dateString' }, first: { $min: '$checkInTime' } } },
				{ $project: { s: '$_id.s', d: '$_id.d', hm: { $dateToString: { date: { $add: ['$first', 18000000] }, format: '%H:%M' } } } }
			])
		])
		const isWork = (d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0
		const dayCame = new Map(), perStudent = new Map()
		for (const r of came) {
			if (!isWork(r._id.d)) continue
			dayCame.set(r._id.d, (dayCame.get(r._id.d) || 0) + 1)
			perStudent.set(String(r._id.s), (perStudent.get(String(r._id.s)) || 0) + 1)
		}
		const dayLate = new Map(), lateOf = new Map(), lateKeys = new Set()
		for (const r of firstIn) {
			if (!isWork(r.d) || r.hm <= limit) continue
			dayLate.set(r.d, (dayLate.get(r.d) || 0) + 1)
			lateOf.set(String(r.s), (lateOf.get(String(r.s)) || 0) + 1)
			lateKeys.add(`${r.s}|${r.d}`)
		}
		const cameKeys = new Set(came.filter(r => isWork(r._id.d)).map(r => `${r._id.s}|${r._id.d}`))
		const days = [...dayCame.keys()].sort()
		const total = students.length
		return {
			success: true, ...range, workStartTime: limit,
			class: { _id: sinf._id, name: sinf.name, head: sinf.head?.fullName || '', schoolId: sinf.schoolId, schoolName: names.get(String(sinf.schoolId)) || '', students: total },
			schoolDays: days.length, days,
			daily: days.map(d => ({ date: d, came: dayCame.get(d) || 0, late: dayLate.get(d) || 0, absent: Math.max(0, total - (dayCame.get(d) || 0)), percent: pct(dayCame.get(d) || 0, total) })),
			students: students.map(st => {
				const present = perStudent.get(String(st._id)) || 0
				return { _id: st._id, fullName: st.fullName, code: publicCode(st.studentIdNumber), photo: st.photo || '', present, absent: Math.max(0, days.length - present), late: lateOf.get(String(st._id)) || 0, percent: days.length ? pct(present, days.length) : null, marks: days.map(d => (lateKeys.has(`${st._id}|${d}`) ? 2 : cameKeys.has(`${st._id}|${d}`) ? 1 : 0)) }
			}).sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101) || a.fullName.localeCompare(b.fullName))
		}
	}

	// ---------- Sababli kelmaganlar: ta'til, xizmat safari, kasallik, boshqa sabab (xodim kommentlari) ----------
	// date yoki from/to: shu kunlar bilan kesishgan kommentlar. Standart: bugun
	async leaves({ date, from, to, schoolId, type }) {
		const today = todayString()
		const f = isDate(from) ? from : isDate(date) ? date : today
		const t = isDate(to) ? to : isDate(date) && !isDate(from) ? date : (isDate(from) ? today : f)
		const filter = { startDate: { $lte: t }, $or: [{ endDate: null }, { endDate: { $gte: f } }] }
		const scL = schoolCond(validId(schoolId) ? schoolId : null)
		if (scL) filter.schoolId = scL
		if (ExcuseService.TYPES.includes(type)) filter.type = type
		const [comments, { names }] = await Promise.all([
			employeeCommentModel.find(filter).sort({ startDate: -1, createdAt: -1 }).limit(1000)
				.populate('employee', 'fullName position photo role isActive').populate('createdBy', 'fullName').lean(),
			schoolMaps()
		])
		const rows = comments.filter(c => c.employee && c.employee.isActive !== false).map(c => {
			const endShown = c.endDate || null
			const last = endShown && endShown < t ? endShown : t
			const days = Math.max(1, Math.round((new Date(`${last}T00:00:00Z`) - new Date(`${c.startDate > f ? c.startDate : f}T00:00:00Z`)) / 86400000) + 1)
			return {
				_id: c._id, employee: { _id: c.employee._id, fullName: c.employee.fullName, position: c.employee.position || '', photo: c.employee.photo || '' },
				schoolId: c.schoolId, schoolName: names.get(String(c.schoolId)) || '', type: c.type, label: ExcuseService.label(c.type), comment: c.comment,
				startDate: c.startDate, endDate: endShown, closed: !!c.closed, active: c.startDate <= today && (!endShown || endShown >= today) && !c.closed,
				days, createdBy: c.createdBy?.fullName || ''
			}
		})
		const byType = { tatil: 0, safar: 0, kasallik: 0, boshqa: 0 }
		rows.forEach(r => { byType[r.type in byType ? r.type : 'boshqa']++ })
		// O'quvchilarning sababli kelmagan kunlari (sinf rahbari kiritgan)
		const sFilter = { startDate: { $lte: t }, $or: [{ endDate: null }, { endDate: { $gte: f } }] }
		if (scL) sFilter.schoolId = scL
		if (StudentExcuseService.LABELS[type]) sFilter.type = type
		const sRows = await studentExcuseModel.find(sFilter).sort({ startDate: -1, createdAt: -1 }).limit(1000)
			.populate('student', 'fullName isActive photo').populate('sinf', 'name').populate('createdBy', 'fullName').lean()
		const studentLeaves = sRows.filter(c => c.student && c.student.isActive !== false).map(c => ({
			_id: c._id, student: { _id: c.student._id, fullName: c.student.fullName, photo: c.student.photo || '' }, sinf: c.sinf?.name || '', schoolId: c.schoolId, schoolName: names.get(String(c.schoolId)) || '',
			type: c.type, label: StudentExcuseService.LABELS[c.type] || StudentExcuseService.LABELS.boshqa, comment: c.comment || '', startDate: c.startDate, endDate: c.endDate || null,
			active: c.startDate <= today && (!c.endDate || c.endDate >= today), createdBy: c.createdBy?.fullName || ''
		}))
		return { success: true, from: f, to: t, total: rows.length, active: rows.filter(r => r.active).length, byType, labels: ExcuseService.LABELS, leaves: rows, studentLeaves, studentLabels: StudentExcuseService.LABELS }
	}

	// ---------- 7) Sinfxonalar tahlili — butun tizim (kamerali sinflar bali bo'yicha) ----------
	async classroomsAll({ date, schoolId }) {
		const dateString = isDate(date) ? date : todayString()
		const { names } = await schoolMaps()
		// kamerasiz sinflar ham qo'shiladi (ular davomat asosida baholanadi)
		const schoolIds = schoolId ? (mongoose.isValidObjectId(schoolId) && inScope(schoolId) ? [new mongoose.Types.ObjectId(String(schoolId))] : []) : await sinfModel.distinct('schoolId', schoolCond() ? { schoolId: schoolCond() } : {})
		const classes = []
		const results = await pool(schoolIds, (id) => HikService.classrooms(id, dateString, { all: true }), 6)
		results.forEach((r, k) => { const id = schoolIds[k]; if (r && r.success) r.classes.forEach(c => classes.push({ ...c, schoolId: id, schoolName: names.get(String(id)) || '' })) })
		classes.sort((a, b) => ({ attention: 0, mid: 1, nodata: 2, good: 3 }[a.analysis.level] - { attention: 0, mid: 1, nodata: 2, good: 3 }[b.analysis.level]) || a.analysis.score - b.analysis.score)
		return { success: true, dateString, classes }
	}

	// ---------- 8) Ogohlantirishlar markazi (har biri tafsilotli va manbaga havolali) ----------
	async alerts({ date, schoolId }) {
		const dateString = isDate(date) ? date : todayString()
		const overview = await MonitorService.overview(dateString)
		const from = shift(dateString, -8), to = shift(dateString, -1)
		const { schools: allSchools } = await schoolMaps()
		const only = validId(schoolId) ? String(schoolId) : null
		const schools = only ? allSchools.filter(x => String(x._id) === only) : allSchools
		const history = new Map()
		await pool(schools, async (s) => {
			const t = await MonitorService.trend({ from, to, schoolId: String(s._id) })
			const worked = t.days.filter(d => d.weekday !== 0 && d.studentCame > 0)
			if (worked.length >= 2) history.set(String(s._id), Math.round(worked.reduce((a, d) => a + d.studentPercent, 0) / worked.length * 10) / 10)
		})
		const alerts = []
		const seen = new Map() // bir maktabda bir xil turdagi bir nechta ogohlantirish bo'lishi mumkin (masalan vision) — id takrorlanmasin
		const push = (severity, type, s, title, evidence, link) => { const base = `${type}-${s._id}`; const n = (seen.get(base) || 0) + 1; seen.set(base, n); alerts.push({ id: n === 1 ? base : `${base}-${n}`, severity, type, schoolId: s._id, schoolName: s.name, title, evidence, link }) }
		// Aqlli kuzatuv hodisalari (bugun): bo'sh qolgan sinf, odamlar keskin oshishi, ortiqcha odam. Sinf nomlari bilan
		const visionRows = await hikCameraEventModel.aggregate([
			{ $match: { dateString, kind: { $in: ['vision_empty', 'vision_surge', 'vision_overcrowd', 'vision_restless', 'vision_commotion'] }, ...(schoolCond(only) ? { schoolId: schoolCond(only) } : {}) } },
			{ $group: { _id: { school: '$schoolId', kind: '$kind', sinf: '$sinfId' }, n: { $sum: 1 } } }
		])
		const visionSinfNames = new Map((await sinfModel.find({ _id: { $in: [...new Set(visionRows.map(r => String(r._id.sinf)))].filter(validId) } }).select('name').lean()).map(x => [String(x._id), x.name]))
		const VISION = { vision_empty: ['medium', "Dars vaqtida sinf bo'sh qolgan"], vision_surge: ['low', 'Sinfda odamlar keskin oshgan'], vision_overcrowd: ['medium', "Sinfda ro'yxatdan ortiq odam yoki zal zich"], vision_restless: ['low', 'Dars vaqtida sinf notinch'], vision_commotion: ['medium', 'Zalda tartibsizlik belgisi'] }
		for (const s of overview.schools) {
			if (!s.isActive || (only && String(s._id) !== only)) continue
			const x = s.stats
			const sp = pct(x.studentCame, x.studentTotal), fp = pct(x.staffCame, Math.max(x.staffTotal - (x.staffExcused || 0), 0))
			if (x.studentTotal > 0 && x.studentCame === 0) push('high', 'no-data', s, "Bugun birorta o'quvchi qayd etilmagan", `${x.studentCame}/${x.studentTotal} o'quvchi · kamera ${x.cameraOnline}/${x.cameraTotal} online`, `/monitor/lists?kind=student&status=absent&school=${s._id}&date=${dateString}`)
			else if (x.studentTotal >= 10 && sp < 60) push(sp < 40 ? 'high' : 'medium', 'low-students', s, "O'quvchi davomati past", `${x.studentCame}/${x.studentTotal} = ${sp}% · kelmagan ${x.studentAbsent}`, `/monitor/lists?kind=student&status=absent&school=${s._id}&date=${dateString}`)
			if (x.staffTotal >= 5 && fp < 50 && x.staffCame > 0) push('medium', 'low-staff', s, 'Xodimlar davomati past', `${x.staffCame}/${x.staffTotal - (x.staffExcused || 0)} = ${fp}% · sababsiz kelmagan ${x.staffAbsent}${x.staffExcused ? ` · sababli ${x.staffExcused}` : ''}`, `/monitor/lists?kind=staff&status=absent&school=${s._id}&date=${dateString}`)
			const hist = history.get(String(s._id))
			if (hist !== undefined && x.studentCame > 0 && hist - sp >= 25) push('medium', 'drop', s, "Davomat keskin pasaygan", `Bugun ${sp}% · oldingi 7 kunda o'rtacha ${hist}% (−${Math.round((hist - sp) * 10) / 10} punkt)`, `/monitor/schools/${s._id}`)
			if (x.cameraTotal >= 2 && x.cameraOffline / x.cameraTotal >= 0.5) push(x.cameraOnline === 0 ? 'high' : 'medium', 'cameras', s, 'Kameralarning yarmi offline', `${x.cameraOffline}/${x.cameraTotal} kamera offline`, `/monitor/cameras?school=${s._id}`)
			for (const [kind, [sev, title]] of Object.entries(VISION)) {
				const rows = visionRows.filter(r => String(r._id.school) === String(s._id) && r._id.kind === kind)
				if (rows.length) push(sev, 'vision', s, title, `${rows.map(r => `${visionSinfNames.get(String(r._id.sinf)) || (kind === 'vision_empty' || kind === 'vision_restless' ? 'Sinf' : 'Zal')}${r.n > 1 ? ` (${r.n} marta)` : ''}`).join(', ')} · Aqlli kuzatuv kadrlarida ko'ring`, `/monitor/classrooms`)
			}
			if (x.studentCame >= 20 && x.studentLate / x.studentCame >= 0.3) push('low', 'late', s, "Kech qolganlar ko'p", `${x.studentLate}/${x.studentCame} kelganning kech qolgani (${Math.round(x.studentLate / x.studentCame * 100)}%) · boshlanish ${x.workStartTime}`, `/monitor/lists?kind=student&status=late&school=${s._id}&date=${dateString}`)
		}
		const order = { high: 0, medium: 1, low: 2 }
		alerts.sort((a, b) => order[a.severity] - order[b.severity] || a.schoolName.localeCompare(b.schoolName))
		return { success: true, dateString, counts: { high: alerts.filter(a => a.severity === 'high').length, medium: alerts.filter(a => a.severity === 'medium').length, low: alerts.filter(a => a.severity === 'low').length }, alerts }
	}

	// ---------- 9) Kameralar salomatligi: offline/aloqasiz kameralar ro'yxati ----------
	// Kamera holati: maktablar kesimida oddiy kameralar; FaceControl (kirish/chiqish) alohida hisoblanadi
	async cameraHealth() {
		const { names } = await schoolMaps()
		const [lan, hik] = await Promise.all([
			cameraModel.find(schoolCond() ? { schoolId: schoolCond() } : {}).select('schoolId name qayer online lastSeenAt lastStatusError').lean(),
			hikCameraModel.find({ inCloud: true, schoolId: schoolCond() || { $ne: null } }).select('schoolId name areaName serial online lastSeenAt role zone sinfId').populate('sinfId', 'name').lean()
		])
		const rows = [
			...lan.map(c => ({ _id: c._id, source: 'lan', schoolId: c.schoolId, name: c.name, place: c.qayer || '', online: c.online, lastSeenAt: c.lastSeenAt, error: c.lastStatusError || '', role: 'monitor', sinf: '' })),
			...hik.map(c => ({ _id: c._id, source: 'hikconnect', schoolId: c.schoolId, name: c.name || c.serial, place: c.areaName || '', online: c.online, lastSeenAt: c.lastSeenAt, error: '', role: c.role || 'monitor', zone: c.zone || 'door', sinf: c.sinfId?.name || '' }))
		].map(r => ({ ...r, kind: r.role === 'in' || r.role === 'out' ? 'facecontrol' : 'regular', schoolName: names.get(String(r.schoolId)) || '' }))
		const count = (list) => ({ total: list.length, online: list.filter(r => r.online === true).length, offline: list.filter(r => r.online === false).length, unknown: list.filter(r => r.online !== true && r.online !== false).length })
		const bySchool = new Map([...names.entries()].map(([id, name]) => [id, { schoolId: id, schoolName: name, rows: [] }]))
		for (const r of rows) {
			const k = String(r.schoolId)
			if (!bySchool.has(k)) bySchool.set(k, { schoolId: r.schoolId, schoolName: r.schoolName, rows: [] })
			bySchool.get(k).rows.push(r)
		}
		const schools = [...bySchool.values()].map(({ rows: list, ...s }) => ({ ...s, regular: count(list.filter(r => r.kind === 'regular')), facecontrol: count(list.filter(r => r.kind === 'facecontrol')) }))
			.sort((a, b) => b.regular.offline - a.regular.offline || b.regular.total - a.regular.total || String(a.schoolName).localeCompare(String(b.schoolName)))
		return {
			success: true,
			totals: { regular: count(rows.filter(r => r.kind === 'regular')), facecontrol: count(rows.filter(r => r.kind === 'facecontrol')) },
			schools,
			cameras: rows.sort((a, b) => (a.online === true) - (b.online === true) || new Date(a.lastSeenAt || 0) - new Date(b.lastSeenAt || 0))
		}
	}


	// ---------- 10) Jonli solishtirish: barcha maktablar yonma-yon, hozirgi holat va kechagi shu vaqt bilan ----------
	async live() {
		const today = todayString()
		let prev = shift(today, -1)
		if (new Date(`${prev}T00:00:00Z`).getUTCDay() === 0) prev = shift(prev, -1) // yakshanba o'tkazib yuboriladi
		const overview = await MonitorService.overview(today)
		// Har maktab bo'yicha soatlik YANGI kirganlar (bir shaxsning kundagi birinchi kirishi), bugun va oldingi o'quv kuni
		// maktabma-maktab (schoolId indeks prefiksi), cheklangan parallellik bilan
		const perHour = async (P) => (await pool(overview.schools.filter(x => x.isActive), (sc) => P.log.aggregate([
			{ $match: { schoolId: sc._id, dateString: { $in: [today, prev] }, checkin: true, checkInTime: { $ne: null } } },
			{ $group: { _id: { d: '$dateString', p: '$' + P.field }, first: { $min: '$checkInTime' } } },
			{ $project: { d: '$_id.d', h: { $mod: [{ $add: [{ $hour: '$first' }, 5] }, 24] } } },
			{ $group: { _id: { d: '$d', h: '$h' }, n: { $sum: 1 } } }
		]).then(rows => rows.map(r => ({ _id: { s: sc._id, d: r._id.d, h: r._id.h }, n: r.n }))), 8)).flat()
		const [studentHours, staffHours] = await Promise.all([perHour(PERSON.student), perHour(PERSON.staff)])
		const build = (rows) => {
			const map = new Map()
			for (const r of rows) {
				const id = String(r._id.s)
				if (!map.has(id)) map.set(id, { today: Array(24).fill(0), prev: Array(24).fill(0) })
				map.get(id)[r._id.d === today ? 'today' : 'prev'][r._id.h] += r.n
			}
			return map
		}
		const st = build(studentHours), sf = build(staffHours)
		const nowHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date())) % 24
		const cum = (arr) => { let a = 0; return arr.map(n => (a += n)) }
		const empty = { today: Array(24).fill(0), prev: Array(24).fill(0) }
		return {
			success: true, dateString: today, prevDate: prev, nowHour, updatedAt: new Date(),
			schools: overview.schools.filter(x => x.isActive).map(x => {
				const id = String(x._id)
				const pack = (kind, hours) => {
					const h = hours.get(id) || empty
					const total = x.stats[`${kind}Total`], came = x.stats[`${kind}Came`]
					const cumToday = cum(h.today), cumPrev = cum(h.prev)
					return {
						total, came, inside: x.stats[`${kind}Inside`], late: x.stats[`${kind}Late`], absent: x.stats[`${kind}Absent`], percent: pct(came, total),
						curve: cumToday.slice(0, nowHour + 1), prevCurve: cumPrev, prevSameTime: cumPrev[nowHour] || 0, delta: (cumToday[nowHour] || 0) - (cumPrev[nowHour] || 0),
						firstArrival: h.today.findIndex(n => n > 0)
					}
				}
				return {
					_id: x._id, name: x.name, region: x.region, district: x.district, code: x.code,
					student: pack('student', st), staff: pack('staff', sf),
					cameras: { total: x.stats.cameraTotal, online: x.stats.cameraOnline, offline: x.stats.cameraOffline }, workStartTime: x.stats.workStartTime
				}
			})
		}
	}

}

module.exports = new MonitorAnalyticsService()

