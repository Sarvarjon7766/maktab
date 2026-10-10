// Viloyat monitori uchun viloyat darajasidagi tahlillar: har bir mavzu (kech qolish, xavf guruhi, ogohlantirishlar, kameralar...)
// tumanlar kesimida jamlanadi. Mavjud tahlil funksiyalari har bir tuman uchun o'sha tumanga cheklangan holda ishga tushiriladi
// (utils/monitorScope), shuning uchun raqamlar tuman sahifalari va maktab sahifalaridagi bilan bir xil.
const schoolModel = require('../models/school.model')
const MonitorService = require('./monitor.service')
const Analytics = require('./monitor.analytics.service')
const scope = require('../utils/monitorScope')

const { isDate } = require('../utils/dateStr')
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
const shift = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
const range = ({ from, to }) => { const t = isDate(to) ? to : today(); return { from: isDate(from) ? from : shift(t, -29), to: t } }

// Hudud ichidagi tumanlar: nom -> maktab id'lari
async function districts() {
	const list = await schoolModel.find(scope.schoolFilter({ isActive: { $ne: false } })).select('district').lean()
	const map = new Map()
	for (const s of list) {
		const name = String(s.district || '').trim() || 'Tumansiz'
		if (!map.has(name)) map.set(name, [])
		map.get(name).push(s._id)
	}
	return [...map.entries()].map(([name, ids]) => ({ name, ids })).sort((a, b) => a.name.localeCompare(b.name, 'uz'))
}

// fn ni har bir tuman ichida (hudud shu tumanga cheklangan holda) ishga tushiradi
async function perDistrict(fn) {
	const list = await districts()
	const base = scope.currentStore() || { region: '', district: '' }
	const out = []
	for (const d of list) {
		const result = await scope.runWithScope({ ...base, schoolIds: d.ids, narrow: d.name }, () => fn(d))
		out.push({ district: d.name, schools: d.ids.length, ...result })
	}
	return out
}
const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0)
const top = (people, n = 3) => (people || []).slice(0, n).map((p) => ({ _id: p._id, name: p.fullName, schoolName: p.schoolName, value: p.lateDays ?? p.streak ?? null, sinf: p.sinf || '' }))

const METRICS = {
	// Kech qolish (davr): kech qolgan odamlar soni
	async late(q) {
		const r = range(q)
		const rows = await perDistrict(async () => {
			const [st, sf] = await Promise.all([Analytics.latePeople({ kind: 'student', ...r, limit: 3 }), Analytics.latePeople({ kind: 'staff', ...r, limit: 3 })])
			return { students: st.totalLatePeople || 0, staff: sf.totalLatePeople || 0, topStudents: top(st.people), topStaff: top(sf.people) }
		})
		return { ...r, rows, totals: { students: sum(rows, 'students'), staff: sum(rows, 'staff') } }
	},
	// Xavf guruhi: ketma-ket kelmayotgan o'quvchilar
	async risk(q) {
		const r = range(q)
		const rows = await perDistrict(async () => {
			const x = await Analytics.atRisk({ ...r, limit: 500 })
			const list = x.students || []
			// daraja: 10+ kun yuqori, 5–9 kun o'rta, qolgani (shu jumladan ro'yxatga sig'magan) kam xavfli
			const high = list.filter((s) => s.streak >= 10).length, mid = list.filter((s) => s.streak >= 5 && s.streak < 10).length
			return { total: x.total || 0, high, mid, low: Math.max(0, (x.total || 0) - high - mid), maxStreak: Math.max(0, ...list.map((s) => s.streak)), top: top(list) }
		})
		return { ...r, rows, totals: { total: sum(rows, 'total') } }
	},
	// Sababli kelmaganlar
	async leaves(q) {
		const r = range(q)
		const rows = await perDistrict(async () => {
			const x = await Analytics.leaves({ ...r })
			return { staff: x.total || 0, active: x.active || 0, students: (x.studentLeaves || []).length, byType: x.byType || {}, tatil: x.byType?.tatil || 0, safar: x.byType?.safar || 0, kasallik: x.byType?.kasallik || 0, boshqa: x.byType?.boshqa || 0 }
		})
		return { ...r, rows, totals: { staff: sum(rows, 'staff'), students: sum(rows, 'students'), active: sum(rows, 'active') } }
	},
	// Ogohlantirishlar (kun)
	async alerts(q) {
		const date = isDate(q.date) ? q.date : today()
		const rows = await perDistrict(async () => {
			const x = await Analytics.alerts({ date })
			return { high: x.counts?.high || 0, medium: x.counts?.medium || 0, low: x.counts?.low || 0, items: (x.alerts || []).slice(0, 4).map((a) => ({ id: a.id, severity: a.severity, schoolName: a.schoolName, title: a.title, evidence: a.evidence, link: a.link })) }
		})
		return { date, rows, totals: { high: sum(rows, 'high'), medium: sum(rows, 'medium'), low: sum(rows, 'low') } }
	},
	// Kameralar holati
	async cameras() {
		const rows = await perDistrict(async () => {
			const x = await Analytics.cameraHealth()
			const r = x.totals?.regular || {}, f = x.totals?.facecontrol || {}
			return { total: r.total || 0, online: r.online || 0, offline: r.offline || 0, unknown: r.unknown || 0, fcTotal: f.total || 0, fcOnline: f.online || 0, fcOffline: f.offline || 0, worst: (x.schools || []).filter((s) => s.regular.offline > 0).slice(0, 3).map((s) => ({ name: s.schoolName, value: s.regular.offline })) }
		})
		return { rows, totals: { total: sum(rows, 'total'), online: sum(rows, 'online'), offline: sum(rows, 'offline'), fcOffline: sum(rows, 'fcOffline') } }
	},
	// Xodimlar va o'quvchilar: bugungi holat tumanlar kesimida
	async staff(q) { return people('staff', q) },
	async students(q) { return people('student', q) },
	// Sinfxonalar tahlili (aqlli kuzatuv): daraja bo'yicha sinflar soni
	async classrooms(q) {
		const date = isDate(q.date) ? q.date : today()
		const rows = await perDistrict(async () => {
			const x = await Analytics.classroomsAll({ date })
			const c = x.classes || []
			const by = (l) => c.filter((k) => k.analysis?.level === l).length
			return { classes: c.length, attention: by('attention'), mid: by('mid'), good: by('good'), nodata: by('nodata'), worst: c.filter((k) => k.analysis?.level === 'attention').slice(0, 3).map((k) => ({ name: `${k.schoolName} · ${k.name}`, value: k.analysis?.score ?? null })) }
		})
		return { date, rows, totals: { classes: sum(rows, 'classes'), attention: sum(rows, 'attention'), good: sum(rows, 'good') } }
	},
	// Sinf darajalari: tumanlar x darajalar matritsasi (davomat %), tuman bo'yicha umumiy foiz
	async grades(q) {
		const r = range(q)
		const rows = await perDistrict(async () => {
			const x = await Analytics.gradesReport({ ...r })
			const g = {}
			for (const row of x.grades || []) g[row.grade] = { percent: row.percent, classes: row.classes, students: row.students, latePercent: row.latePercent }
			return { overall: x.overall ?? null, classes: x.classCount || 0, students: (x.grades || []).reduce((a, row) => a + row.students, 0), grades: g }
		})
		const overall = await Analytics.gradesReport({ ...r })
		return { ...r, rows, overall: overall.overall ?? null, byGrade: (overall.grades || []).map((g) => ({ grade: g.grade, percent: g.percent, classes: g.classes, students: g.students })), totals: { students: sum(rows, 'students'), classes: sum(rows, 'classes') } }
	},
	// Kamera hodisalari (davr): tuman bo'yicha soni va turlari
	async cameraEvents(q) {
		const r = range(q)
		const rows = await perDistrict(async () => {
			const x = await Analytics.cameraEvents({ ...r, limit: 10 })
			const by = Object.fromEntries((x.byKind || []).map((k) => [k.kind, k.n]))
			const density = (by.density || 0) + (by.people || 0), motion = by.motion || 0, enter = by.enter || 0, exit = by.exit || 0, total = x.total || 0
			return { total, density, motion, enter, exit, other: Math.max(0, total - density - motion - enter - exit), top: (x.bySchool || []).slice(0, 3).map((b) => ({ name: b.schoolName, value: b.n })) }
		})
		return { ...r, rows, totals: { total: sum(rows, 'total'), density: sum(rows, 'density') } }
	},
	// Kunlik dinamika: viloyat va har bir tuman kunlar bo'yicha
	async trend(q) {
		const r = range(q)
		const [region, rows] = await Promise.all([MonitorService.trend({ ...r }), perDistrict(async () => {
			const t = await MonitorService.trend({ ...r })
			return { days: (t.days || []).filter((d) => d.weekday !== 0 && (d.studentCame > 0 || d.staffCame > 0)).map((d) => ({ date: d.dateString, student: d.studentPercent, staff: d.staffPercent })) }
		})])
		return { ...r, region: (region.days || []).filter((d) => d.weekday !== 0 && (d.studentCame > 0 || d.staffCame > 0)).map((d) => ({ date: d.dateString, student: d.studentPercent, staff: d.staffPercent, studentCame: d.studentCame, staffCame: d.staffCame })), rows, totals: {} }
	}
}

async function people(kind, q) {
	const date = isDate(q.date) ? q.date : today()
	const rows = await perDistrict(async () => {
		const x = await Analytics.peopleAll({ kind, date, limit: 10 })
		const s = x.summary || {}
		return { total: s.total || 0, came: s.came || 0, inside: s.inside || 0, absent: s.absent || 0, late: s.late || 0, percent: pct(s.came || 0, s.total || 0) }
	})
	const t = { total: sum(rows, 'total'), came: sum(rows, 'came'), inside: sum(rows, 'inside'), absent: sum(rows, 'absent'), late: sum(rows, 'late') }
	return { date, rows, totals: { ...t, percent: pct(t.came, t.total) } }
}

class RegionService {
	metrics() { return Object.keys(METRICS) }
	async run(metric, q = {}) {
		const fn = METRICS[metric]
		if (!fn) return { success: false, message: 'Bunday tahlil yo\'q' }
		return { success: true, metric, ...(await fn(q)) }
	}
}

module.exports = new RegionService()
