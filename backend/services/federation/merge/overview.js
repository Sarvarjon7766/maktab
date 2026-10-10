// Viloyat sahifalari jamlamalari (tumanlar bo'yicha). Har bir yozuv: { ttl, merge(parts, ctx), regionOnly? }
// parts = [{ entry, data }] — muvaffaqiyatli tumanlar; ctx = { query, scope, narrow, failed, entries, user }
// Maqsad: natija hamma maktab bitta bazada bo'lgan asl tizim (services/monitor*.js, map.service.js, region.service.js) javobiga teng.
// Qoida: har tumandagi tayyor foiz/o'rin/o'rtacha jamlanmaydi — maktab/kun darajasidagi qiymatlardan QAYTA hisoblanadi.
const { num, sum, pct, r1, concat, groupBy } = require('./util')

// ---------- umumiy yordamchilar (sof) ----------
const first = (parts) => parts[0]?.data || {}
// MongoDB `sort({ name: 1 })` (binar taqqoslash) — asl overview/cameras/schoolsReport maktablar tartibi
const bin = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const byNameBin = (a, b) => bin(String(a.name ?? ''), String(b.name ?? ''))
const sortedBy = (arr, cmp) => [...arr].sort(cmp)
const key = (t) => String(t || '').trim().toLowerCase()
const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// monitor.service.js dagi pct: maxraj 0 bo'lsa 0 (util.pct esa null)
const pct0 = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0)
const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)
const round = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10)

// Viloyat serverida foydalanuvchi hududi (asl utils/monitorScope semantikasi)
// scope: { level, region, district } (federatsiya userScope), narrow: ?district=
function scopeInfo(ctx) {
	const sc = ctx.scope || {}
	const narrow = sc.district ? '' : String(ctx.narrow || '').trim() // tuman monitori uchun ?district e'tiborga olinmaydi
	const level = sc.district || narrow ? 'district' : sc.region ? 'region' : null
	return { level, region: sc.region || '', district: sc.district || '', narrow }
}

// Tumanlarning /monitor/overview javoblaridan maktablar (asl tartib: nom bo'yicha)
const mergeSchools = (parts, pick = (d) => d.schools) => sortedBy(concat(parts, pick), byNameBin)

// ---------- /overview ----------
const overview = (parts) => ({ success: true, dateString: first(parts).dateString, schools: mergeSchools(parts) })

// ---------- /map ----------
async function map(parts, ctx) {
	const info = scopeInfo(ctx)
	const d = info.district || info.narrow
	const geojson = await require('../../district.service').features({ visibleDistricts: d ? [d] : null, withRegion: !info.level, region: info.level === 'region' ? info.region : null })
	const schools = mergeSchools(parts)
	const byDistrict = new Map()
	for (const s of schools) {
		const k = key(s.district) || '—'
		if (!byDistrict.has(k)) byDistrict.set(k, { name: s.district || 'Tumansiz', schools: 0, located: 0, studentTotal: 0, studentCame: 0, studentLate: 0, staffTotal: 0, staffCame: 0 })
		const x = byDistrict.get(k)
		x.schools++; if (s.location) x.located++
		x.studentTotal += s.studentTotal; x.studentCame += s.studentCame; x.studentLate += s.studentLate; x.staffTotal += s.staffTotal; x.staffCame += s.staffCame
	}
	const districts = [...byDistrict.values()].map((x) => ({ ...x, studentPercent: pct(x.studentCame, x.studentTotal), staffPercent: pct(x.staffCame, x.staffTotal) }))
	return {
		success: true, dateString: first(parts).dateString,
		scope: { scoped: info.level !== null, level: info.level, region: info.region, district: d },
		geojson, districts, schools, unlocated: schools.filter((s) => !s.location).length
	}
}

// ---------- /districts ----------
// Tuman javoblaridagi qatorlar (tuman nomi bo'yicha) viloyat bazasidagi tumanlar bilan birlashtiriladi; o'rin va jami qayta hisoblanadi.
async function districts(parts, ctx) {
	const info = scopeInfo(ctx)
	const region = info.region
	const docs = await require('../../../models/district.model').find({ isRegion: { $ne: true }, ...(region ? { region: new RegExp('^\\s*' + esc(region) + '\\s*$', 'i') } : {}) }).select('name region').lean()
	const acc = new Map()
	const ensure = (name, reg) => {
		const k = key(name) || '—'
		if (!acc.has(k)) acc.set(k, { name: name || 'Tumansiz', region: reg || '', schools: 0, located: 0, students: 0, studentCame: 0, studentLate: 0, staff: 0, staffCame: 0, cameraTotal: 0, cameraOnline: 0, _sp: [], _fp: [] })
		return acc.get(k)
	}
	docs.forEach((d) => ensure(d.name, d.region))
	for (const p of parts) {
		for (const r of p.data.rows || []) {
			const a = ensure(r.name, r.region)
			for (const f of ['schools', 'located', 'students', 'studentCame', 'studentLate', 'staff', 'staffCame', 'cameraTotal', 'cameraOnline']) a[f] += num(r[f])
			if (r.studentPeriod !== null && r.studentPeriod !== undefined) a._sp.push({ v: r.studentPeriod, w: num(r.students) })
			if (r.staffPeriod !== null && r.staffPeriod !== undefined) a._fp.push({ v: r.staffPeriod, w: num(r.staff) })
		}
	}
	// bitta tuman bitta serverdan kelsa qiymat aynan o'zi; bir necha manba bo'lsa o'quvchi/xodim soni bo'yicha o'rtacha
	const period = (list) => (list.length === 1 ? list[0].v : list.length ? r1(list.reduce((s, x) => s + x.v * x.w, 0) / (list.reduce((s, x) => s + x.w, 0) || 1)) : null)
	const rows = [...acc.values()].map(({ _sp, _fp, ...d }) => ({
		...d,
		studentToday: pct(d.studentCame, d.students), staffToday: pct(d.staffCame, d.staff),
		studentPeriod: period(_sp), staffPeriod: period(_fp),
		latePercent: d.studentCame ? r1((d.studentLate / d.studentCame) * 100) : null,
		cameraPercent: d.cameraTotal ? r1((d.cameraOnline / d.cameraTotal) * 100) : null
	})).sort((a, b) => (b.studentPeriod ?? -1) - (a.studentPeriod ?? -1) || a.name.localeCompare(b.name))
	rows.forEach((r, i) => { r.rank = r.studentPeriod === null ? null : i + 1 })
	const s = (k) => sum(rows, k)
	const wp = rows.filter((r) => r.studentPeriod !== null)
	const f = first(parts)
	return {
		success: true, dateString: f.dateString, from: f.from, to: f.to, rows,
		totals: {
			districts: rows.length, schools: s('schools'), students: s('students'), studentCame: s('studentCame'), staff: s('staff'), staffCame: s('staffCame'), studentLate: s('studentLate'),
			studentToday: pct(s('studentCame'), s('students')), cameraTotal: s('cameraTotal'), cameraOnline: s('cameraOnline'),
			studentPeriod: wp.length ? r1(wp.reduce((a, r) => a + r.studentPeriod * r.students, 0) / (wp.reduce((a, r) => a + r.students, 0) || 1)) : null
		}
	}
}

// ---------- /ai ----------
// monitor.ai.service.js overview: maktablar (alerts, total, nom), tumanlar maktab qatorlaridan qayta yig'iladi
function ai(parts) {
	const schools = sortedBy(concat(parts, (d) => d.schools), (a, b) => b.alerts - a.alerts || b.total - a.total || a.name.localeCompare(b.name, 'uz', { numeric: true }))
	const byD = new Map()
	for (const r of schools) {
		const k = (r.district || '—').trim()
		if (!byD.has(k)) byD.set(k, { name: r.district || 'Tumansiz', schools: 0, withAI: 0, alerts: 0, total: 0, cameras: 0, online: 0 })
		const d = byD.get(k)
		d.schools++; if (r.cameras) d.withAI++
		d.alerts += r.alerts; d.total += r.total; d.cameras += r.cameras; d.online += r.online
	}
	const dist = [...byD.values()].sort((a, b) => b.alerts - a.alerts || b.total - a.total || a.name.localeCompare(b.name, 'uz'))
	const s = (k) => schools.reduce((a, r) => a + r[k], 0)
	return { success: true, dateString: first(parts).dateString, totals: { schools: schools.length, withAI: schools.filter((r) => r.cameras).length, alerts: s('alerts'), total: s('total'), clips: s('clips'), cameras: s('cameras'), online: s('online') }, districts: dist, schools }
}

// ---------- /live ----------
function live(parts) {
	const f = first(parts)
	const updated = parts.map((p) => p.data.updatedAt).filter(Boolean).sort().pop()
	return { success: true, dateString: f.dateString, prevDate: f.prevDate, nowHour: f.nowHour, updatedAt: updated, schools: mergeSchools(parts) }
}

// ---------- /cameras ----------
const cameras = (parts) => ({ success: true, schools: mergeSchools(parts) })

// ---------- /camera-health ----------
function cameraHealth(parts) {
	const tot = (kind) => ({ total: sum(parts, (p) => p.data.totals?.[kind]?.total), online: sum(parts, (p) => p.data.totals?.[kind]?.online), offline: sum(parts, (p) => p.data.totals?.[kind]?.offline), unknown: sum(parts, (p) => p.data.totals?.[kind]?.unknown) })
	const schools = sortedBy(concat(parts, (d) => d.schools), (a, b) => b.regular.offline - a.regular.offline || b.regular.total - a.regular.total || String(a.schoolName).localeCompare(String(b.schoolName)))
	// teng vaqtli kameralarda asl tartib: avval LAN, so'ng hikconnect, har biri _id (qo'shilish) tartibida
	const src = (c) => (c.source === 'lan' ? 0 : 1)
	const pre = sortedBy(concat(parts, (d) => d.cameras), (a, b) => src(a) - src(b) || bin(String(a._id), String(b._id)))
	const cams = pre.sort((a, b) => (a.online === true) - (b.online === true) || new Date(a.lastSeenAt || 0) - new Date(b.lastSeenAt || 0))
	return { success: true, totals: { regular: tot('regular'), facecontrol: tot('facecontrol') }, schools, cameras: cams }
}

// ---------- /trend ----------
// Kunlar sana bo'yicha qo'shiladi, foizlar jami (maktablar yig'indisi) bo'yicha qayta hisoblanadi
function trend(parts) {
	const f = first(parts)
	const staffTotal = sum(parts, (p) => p.data.staffTotal), studentTotal = sum(parts, (p) => p.data.studentTotal)
	const byDate = new Map()
	for (const p of parts) {
		for (const d of p.data.days || []) {
			if (!byDate.has(d.dateString)) byDate.set(d.dateString, { dateString: d.dateString, staffCame: 0, staffInside: 0, studentCame: 0, studentInside: 0, weekday: d.weekday })
			const x = byDate.get(d.dateString)
			x.staffCame += num(d.staffCame); x.staffInside += num(d.staffInside); x.studentCame += num(d.studentCame); x.studentInside += num(d.studentInside)
		}
	}
	const days = [...byDate.values()].sort((a, b) => bin(a.dateString, b.dateString)).map(({ weekday, ...x }) => ({
		...x, staffTotal, studentTotal,
		staffPercent: pct0(x.staffCame, staffTotal), studentPercent: pct0(x.studentCame, studentTotal), weekday
	}))
	return { success: true, from: f.from, to: f.to, staffTotal, studentTotal, days }
}

// ---------- /schools-report ----------
const schoolsReport = (parts) => ({ success: true, from: first(parts).from, to: first(parts).to, schools: mergeSchools(parts) })

// ---------- /schools-compare ----------
// Har maktabning o'z ko'rsatkichlari (tuman javobidan) saqlanadi; o'rtachalar, o'rinlar, kuchli/zaif tomonlar BARCHA maktablar bo'yicha qayta hisoblanadi
function schoolsCompare(parts) {
	const f = first(parts)
	const METRICS = f.metrics
	// asl hisobdagi tartib: maktablar nom bo'yicha (overview), keyin o'rinlar barqaror saralash bilan
	const rows = mergeSchools(parts).map(({ strengths, weaknesses, rank, ...r }) => r)
	const averages = {}, ranks = {}, ranksOf = {}
	for (const m of [...METRICS, { key: 'score', higher: true }]) {
		const vals = rows.map((r) => r[m.key]).filter((v) => v !== null)
		averages[m.key] = round(avg(vals))
		const sorted = rows.filter((r) => r[m.key] !== null).sort((a, b) => (m.higher ? b[m.key] - a[m.key] : a[m.key] - b[m.key]))
		sorted.forEach((r, i) => { (ranks[String(r._id)] ||= {})[m.key] = i + 1 })
		ranksOf[m.key] = sorted.length
	}
	const gap = { studentPercent: 3, staffPercent: 3, latePercent: 3, trend: 2, cameraPercent: 10 }
	const out = rows.map((r) => {
		const diffs = METRICS.filter((m) => r[m.key] !== null && averages[m.key] !== null)
			.map((m) => ({ key: m.key, label: m.label, diff: round((r[m.key] - averages[m.key]) * (m.higher ? 1 : -1)), value: r[m.key], avg: averages[m.key] }))
			.filter((d) => Math.abs(d.diff) >= gap[d.key])
		return {
			...r,
			strengths: diffs.filter((d) => d.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 3),
			weaknesses: diffs.filter((d) => d.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 3),
			rank: ranks[String(r._id)] || {}
		}
	})
	out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name))
	return { success: true, from: f.from, to: f.to, metrics: METRICS, averages, ranksOf, schools: out }
}

// ---------- /alerts ----------
function alerts(parts) {
	const order = { high: 0, medium: 1, low: 2 }
	const list = sortedBy(concat(parts, (d) => d.alerts), (a, b) => order[a.severity] - order[b.severity] || a.schoolName.localeCompare(b.schoolName))
	const n = (s) => list.filter((a) => a.severity === s).length
	return { success: true, dateString: first(parts).dateString, counts: { high: n('high'), medium: n('medium'), low: n('low') }, alerts: list }
}

// ---------- /region/:metric ----------
// Tuman qatorlari (district nomi bo'yicha) birlashtiriladi va region.service.js dagi kabi nom bo'yicha tartiblanadi
const regionRows = (parts) => sortedBy(concat(parts, (d) => d.rows), (a, b) => a.district.localeCompare(b.district, 'uz'))
const totalsOf = (rows, keys) => Object.fromEntries(keys.map((k) => [k, sum(rows, k)]))

const REGION = {
	late: (parts) => { const rows = regionRows(parts), f = first(parts); return { success: true, metric: 'late', from: f.from, to: f.to, rows, totals: totalsOf(rows, ['students', 'staff']) } },
	risk: (parts) => { const rows = regionRows(parts), f = first(parts); return { success: true, metric: 'risk', from: f.from, to: f.to, rows, totals: totalsOf(rows, ['total']) } },
	leaves: (parts) => { const rows = regionRows(parts), f = first(parts); return { success: true, metric: 'leaves', from: f.from, to: f.to, rows, totals: totalsOf(rows, ['staff', 'students', 'active']) } },
	alerts: (parts) => { const rows = regionRows(parts); return { success: true, metric: 'alerts', date: first(parts).date, rows, totals: totalsOf(rows, ['high', 'medium', 'low']) } },
	cameras: (parts) => { const rows = regionRows(parts); return { success: true, metric: 'cameras', rows, totals: totalsOf(rows, ['total', 'online', 'offline', 'fcOffline']) } },
	staff: (parts) => people(parts, 'staff'),
	students: (parts) => people(parts, 'students'),
	classrooms: (parts) => { const rows = regionRows(parts); return { success: true, metric: 'classrooms', date: first(parts).date, rows, totals: totalsOf(rows, ['classes', 'attention', 'good']) } },
	cameraEvents: (parts) => { const rows = regionRows(parts), f = first(parts); return { success: true, metric: 'cameraEvents', from: f.from, to: f.to, rows, totals: totalsOf(rows, ['total', 'density']) } },
	// Viloyat qatori: har tumanning kunlik jami (staffTotal/studentTotal) /trend javobidan olinadi — foizlar butun viloyat bo'yicha qayta hisoblanadi
	async trend(parts, ctx) {
		const rows = regionRows(parts), f = first(parts)
		const gateway = require('../gateway')
		const narrowName = ctx.narrow || ctx.scope?.district || ''
		const res = await gateway.scatter(parts.map((p) => p.entry), '/monitor/trend', { from: f.from, to: f.to }, { ttlMs: 15000, queryFor: narrowName ? (e, q) => ({ ...q, district: narrowName }) : undefined })
		const t = trend(res.filter((r) => r.ok).map((r) => ({ entry: r.entry, data: r.data })))
		const region = t.days.filter((d) => d.weekday !== 0 && (d.studentCame > 0 || d.staffCame > 0)).map((d) => ({ date: d.dateString, student: d.studentPercent, staff: d.staffPercent, studentCame: d.studentCame, staffCame: d.staffCame }))
		return { success: true, metric: 'trend', from: f.from, to: f.to, region, rows, totals: {} }
	}
}

function people(parts, metric) {
	const rows = regionRows(parts)
	const t = totalsOf(rows, ['total', 'came', 'inside', 'absent', 'late'])
	return { success: true, metric, date: first(parts).date, rows, totals: { ...t, percent: pct(t.came, t.total) } }
}

const regionMetric = {
	ttl: 60000,
	regionOnly: true,
	merge: (parts, ctx) => {
		const fn = Object.hasOwn(REGION, ctx.req?.params?.metric) ? REGION[ctx.req.params.metric] : null
		if (!fn) return { success: false, status: 501, message: "Bu tahlil viloyat rejimida hali qo'llab-quvvatlanmaydi" }
		return fn(parts, ctx)
	}
}

module.exports = {
	'/overview': { ttl: 15000, merge: overview },
	'/map': { ttl: 30000, merge: map },
	'/districts': { ttl: 60000, regionOnly: true, merge: districts },
	'/ai': { ttl: 30000, merge: ai },
	'/live': { ttl: 15000, merge: live },
	'/cameras': { ttl: 30000, merge: cameras },
	'/camera-health': { ttl: 30000, merge: cameraHealth },
	'/trend': { ttl: 60000, merge: trend },
	'/schools-report': { ttl: 60000, merge: schoolsReport },
	'/schools-compare': { ttl: 60000, merge: schoolsCompare },
	'/alerts': { ttl: 45000, merge: alerts },
	'/region/:metric': regionMetric
}
