// Ro'yxat va hisobot yo'llari jamlamasi (people-all, late-people, at-risk, classes-all, classrooms-all, arrival, camera-events, grades, grade-class, leaves, search, ai-evidence)
// Har bir yozuv: { ttl, merge(parts, ctx), prepare?(query, ctx) } — services/federation/endpoints.js ga qarang.
// Qoida: natija hamma maktab bitta bazada bo'lgandagi asl javob bilan bir xil bo'lishi kerak:
//   ro'yxatlar asl comparator bilan birlashtiriladi (k-way merge), agregatlar yig'indisidan qayta hisoblanadi, sahifalash jamlama ustida bajariladi.
const { FederationError } = require('../client')
const { fetchOne } = require('../gateway')
const { num, sum, pct } = require('./util')

const ID_RX = /^[a-f0-9]{24}$/i
const first = (parts, pick) => { for (const p of parts) { const v = pick(p.data); if (v !== undefined && v !== null) return v } return undefined }
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const idCmp = (a, b) => cmpStr(String(a?._id || ''), String(b?._id || ''))
const timeOf = (x) => { const t = Date.parse(x); return Number.isFinite(t) ? t : 0 }
const narrowOf = (ctx) => ctx.narrow || ctx.scope?.district || ''

// K-way birlashtirish: har ro'yxat allaqachon tartiblangan (tuman ichida asl tartib), bosh elementlar cmp bilan, teng bo'lsa tie bilan solishtiriladi.
// Tuman ichidagi tartib (tabiiy/barqaror) buzilmaydi.
function kmerge(lists, cmp, tie = idCmp) {
	const at = lists.map(() => 0), out = []
	for (;;) {
		let best = -1
		for (let i = 0; i < lists.length; i++) {
			if (at[i] >= lists[i].length) continue
			if (best < 0) { best = i; continue }
			const a = lists[i][at[i]], b = lists[best][at[best]]
			const c = cmp(a, b)
			if (c < 0 || (c === 0 && tie(a, b) < 0)) best = i
		}
		if (best < 0) break
		out.push(lists[best][at[best]++])
	}
	return out
}

// Tumandan yetishmagan keyingi sahifalarni olib, ro'yxatni `want` tagacha to'ldiradi (tuman sahifasi cheklangani uchun)
async function gather(part, ctx, path, key, prepared, step, want) {
	const rows = [...(part.data[key] || [])]
	const target = Math.min(want, num(part.data.total))
	const narrow = narrowOf(ctx)
	let pg = 1
	while (rows.length < target) {
		pg++
		const q = { ...prepared, page: pg }
		if (step) q.limit = step
		if (narrow) q.district = narrow
		let r = null
		try { r = await fetchOne(part.entry, `/monitor${path}`, q, 0) } catch { r = null }
		const got = r && r.ok && r.data ? r.data[key] || [] : []
		if (!got.length) break
		rows.push(...got)
	}
	return rows
}

// Jamlama yig'indisi: obyektlar ro'yxatidagi son maydonlar yig'indisi
const sumKeys = (items, keys) => Object.fromEntries(keys.map((k) => [k, sum(items, k)]))

const sizeOf = (limit) => Math.min(Math.max(Number(limit) || 50, 10), 200)
const pageOf = (page) => Math.max(Number(page) || 1, 1)

// Sahifalangan ro'yxat tuman so'roviga: har tumanga page=1 va limit = page*size (200 dan oshmasin)
const pagedQuery = (query) => ({ ...query, page: 1, limit: Math.min(pageOf(query.page) * sizeOf(query.limit), 200) })

// Sahifalangan jamlama (people-all, camera-events): {rows(current sahifa), total, pages, current}
async function pagedMerge(parts, ctx, path, key, cmp, tie) {
	const size = sizeOf(ctx.query.limit)
	const total = sum(parts, (p) => p.data.total)
	const pages = Math.max(1, Math.ceil(total / size))
	const current = Math.min(pageOf(ctx.query.page), pages)
	const prepared = pagedQuery(ctx.query)
	const lists = await Promise.all(parts.map((p) => gather(p, ctx, path, key, prepared, prepared.limit, current * size)))
	const rows = kmerge(lists, cmp, tie).slice((current - 1) * size, current * size)
	return { rows, total, pages, current }
}

// people-all bySchool: asl servisda n teng bo'lsa maktablar fullName bo'yicha tartiblangan ro'yxatda birinchi uchragan tartibida turadi.
// Teng n li maktablar uchun shu maktabning birinchi shaxsi (fullName, _id) tumandan so'raladi va shu bo'yicha tartiblanadi
async function bySchoolTop(parts, ctx) {
	const rows = parts.flatMap((p) => (p.data.bySchool || []).map((r) => ({ ...r, part: p }))).sort((a, b) => b.n - a.n)
	if (!rows.length) return []
	const cut = rows[Math.min(14, rows.length - 1)].n
	const count = new Map()
	for (const r of rows) if (r.n >= cut) count.set(r.n, (count.get(r.n) || 0) + 1)
	const narrow = narrowOf(ctx)
	await Promise.all(rows.filter((r) => r.n >= cut && count.get(r.n) > 1).map(async (r) => {
		const q = { ...ctx.query, schoolId: r.schoolId, page: 1, limit: 10 }
		if (narrow) q.district = narrow
		try {
			const res = await fetchOne(r.part.entry, '/monitor/people-all', q, 0)
			r.firstPerson = res && res.ok && res.data ? (res.data.people || [])[0] : null
		} catch { r.firstPerson = null }
	}))
	const fp = (r) => r.firstPerson || { fullName: '', _id: '' }
	rows.sort((a, b) => b.n - a.n || cmpStr(String(fp(a).fullName), String(fp(b).fullName)) || idCmp(fp(a), fp(b)))
	return rows.slice(0, 15).map(({ part, firstPerson, ...r }) => r)
}

const SINF_LEVEL = { attention: 0, mid: 1, nodata: 2, good: 3 }
// "5-A" -> { grade: 5, letter: 'A' } (sinf nomi bo'yicha saralash: asl servis grade, letter bo'yicha tartiblaydi)
const sinfKey = (c) => { const m = /^\s*(\d{1,2})\s*[-–—.]?\s*(.*)$/u.exec(c.name || ''); return { grade: c.grade ?? (m ? Number(m[1]) : -1), letter: m ? m[2] : String(c.name || '') } }

module.exports = {
	// ---------- shaxslar ro'yxati (sahifalangan) ----------
	'/people-all': {
		ttl: 30000,
		prepare: (query) => {
			if (!['student', 'staff'].includes(query.kind)) throw new FederationError("Tur noto'g'ri", 400)
			return pagedQuery(query)
		},
		merge: async (parts, ctx) => {
			const ds = parts.map((p) => p.data)
			const { rows, total, pages, current } = await pagedMerge(parts, ctx, '/people-all', 'people', (a, b) => cmpStr(String(a.fullName ?? ''), String(b.fullName ?? '')))
			// maktablar kesimi: har tumanning top-15 ro'yxati birlashtirilib qayta saralanadi (maktab bitta tumanga tegishli)
			const bySchool = await bySchoolTop(parts, ctx)
			return {
				success: true, dateString: first(parts, (d) => d.dateString), summary: sumKeys(ds.map((d) => d.summary || {}), ['total', 'came', 'inside', 'absent', 'late']),
				...(ds.some((d) => d.truncated) ? { truncated: true } : {}), total, page: current, pages, bySchool, people: rows
			}
		}
	},

	// ---------- eng ko'p kech qolganlar ----------
	'/late-people': {
		ttl: 60000,
		prepare: (query) => {
			if (!['student', 'staff'].includes(query.kind)) throw new FederationError("Tur noto'g'ri", 400)
			return query
		},
		merge: (parts, ctx) => {
			const ds = parts.map((p) => p.data)
			const top = kmerge(ds.map((d) => d.people || []), (a, b) => b.lateDays - a.lateDays || num(b.percent) - num(a.percent))
				.slice(0, Math.min(Number(ctx.query.limit) || 100, 300))
			const d0 = ds[0]
			return { success: true, from: d0.from, to: d0.to, kind: d0.kind, totalLatePeople: sum(ds, 'totalLatePeople'), people: top }
		}
	},

	// ---------- xavf guruhi ----------
	'/at-risk': {
		ttl: 60000,
		merge: (parts, ctx) => {
			const ds = parts.map((p) => p.data)
			const students = kmerge(ds.map((d) => d.students || []), (a, b) => b.streak - a.streak || a.percent - b.percent)
				.slice(0, Math.min(Number(ctx.query.limit) || 200, 500))
			const d0 = ds[0]
			return { success: true, from: d0.from, to: d0.to, minStreak: d0.minStreak, total: sum(ds, 'total'), students }
		}
	},

	// ---------- sinflar reytingi ----------
	'/classes-all': {
		ttl: 60000,
		merge: (parts) => ({
			success: true, dateString: first(parts, (d) => d.dateString),
			classes: kmerge(parts.map((p) => p.data.classes || []), () => 0)
		})
	},

	// ---------- sinfxonalar tahlili ----------
	'/classrooms-all': {
		ttl: 30000,
		merge: (parts) => ({
			success: true, dateString: first(parts, (d) => d.dateString),
			classes: kmerge(parts.map((p) => p.data.classes || []), (a, b) => (SINF_LEVEL[a.analysis?.level] - SINF_LEVEL[b.analysis?.level]) || (a.analysis?.score - b.analysis?.score) || 0)
		})
	},

	// ---------- kelish vaqti taqsimoti ----------
	'/arrival': {
		ttl: 120000,
		merge: (parts) => {
			const ds = parts.map((p) => p.data)
			const out = { success: true, from: ds[0].from, to: ds[0].to }
			const minutes = (t) => { const m = /^(\d+):(\d+)$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 0 }
			for (const kind of ['student', 'staff']) {
				const ks = ds.map((d) => d[kind]).filter(Boolean)
				const buckets = new Map()
				for (const k of ks) for (const b of k.buckets || []) buckets.set(b.time, (buckets.get(b.time) || 0) + b.n)
				out[kind] = {
					buckets: [...buckets.entries()].map(([time, n]) => ({ time, n })).sort((a, b) => minutes(a.time) - minutes(b.time)),
					total: sum(ks, 'total'),
					schools: kmerge(ks.map((k) => k.schools || []), (a, b) => minutes(a.avg) - minutes(b.avg) || a.avgMin - b.avgMin, () => 0)
				}
			}
			return out
		}
	},

	// ---------- kamera hodisalari (sahifalangan) ----------
	'/camera-events': {
		ttl: 30000,
		prepare: pagedQuery,
		merge: async (parts, ctx) => {
			const ds = parts.map((p) => p.data)
			const { rows, total, pages, current } = await pagedMerge(parts, ctx, '/camera-events', 'events', (a, b) => timeOf(b.time) - timeOf(a.time), (a, b) => -idCmp(a, b))
			// byKind: tur bo'yicha yig'indi (birinchi ko'ringan tartibda)
			const kinds = new Map()
			for (const d of ds) for (const r of d.byKind || []) kinds.set(r.kind, (kinds.get(r.kind) || 0) + r.n)
			// byDay: sana bo'yicha, har tur sanog'i qo'shiladi
			const days = new Map()
			for (const d of ds) for (const r of d.byDay || []) {
				const x = days.get(r.date) || { date: r.date }
				for (const [k, v] of Object.entries(r)) if (k !== 'date') x[k] = (x[k] || 0) + v
				days.set(r.date, x)
			}
			const bySchool = ds.flatMap((d) => d.bySchool || []).sort((a, b) => b.n - a.n).slice(0, 15)
			return {
				success: true, from: ds[0].from, to: ds[0].to, total, page: current, pages,
				byKind: [...kinds.entries()].map(([kind, n]) => ({ kind, n })),
				byDay: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
				bySchool, events: rows
			}
		}
	},

	// ---------- sinf darajalari bo'yicha statistika ----------
	'/grades': {
		ttl: 45000,
		merge: (parts, ctx) => {
			const ds = parts.map((p) => p.data)
			const only = Number(ctx.query.grade) >= 1
			const classes = only ? kmerge(ds.map((d) => d.classes || []), () => 0) : []
			const by = new Map()
			for (const d of ds) for (const g of d.grades || []) {
				if (!by.has(g.grade)) by.set(g.grade, { grade: g.grade, classes: 0, students: 0, schools: 0, present: 0, possible: 0, late: 0, bests: [], worsts: [], daily: new Map() })
				const x = by.get(g.grade)
				x.classes += g.classes; x.students += g.students; x.schools += g.schools; x.present += g.present; x.possible += g.possible; x.late += g.late
				if (g.best) x.bests.push(g.best)
				if (g.worst) x.worsts.push(g.worst)
				for (const r of g.daily || []) {
					const y = x.daily.get(r.date) || { date: r.date, came: 0, possible: 0 }
					y.came += r.came; y.possible += r.possible
					x.daily.set(r.date, y)
				}
			}
			const pick = (c) => (c ? { _id: c._id, schoolId: c.schoolId, schoolName: c.schoolName, name: c.name, percent: c.percent } : null)
			const grades = [...by.values()].sort((a, b) => a.grade - b.grade).map((x) => {
				let best, worst
				if (only) {
					// aniq: sinflar ro'yxatidan (asl servisdagi kabi barqaror kamayish tartibi)
					const list = classes.filter((c) => c.grade === x.grade && c.percent !== null).sort((a, b) => b.percent - a.percent)
					best = pick(list[0]); worst = list.length > 1 ? pick(list.at(-1)) : null
				} else {
					// nomzodlar: tumanlarning eng yaxshi/eng yomonlari; teng foizda tabiiy tartib (id) bo'yicha birinchi/oxirgi
					const all = [...x.bests, ...x.worsts]
					const scoredMany = x.worsts.length > 0 || x.bests.length > 1
					best = all.length ? pick([...x.bests].sort((a, b) => b.percent - a.percent || idCmp(a, b))[0]) : null
					worst = scoredMany ? pick([...all].sort((a, b) => a.percent - b.percent || idCmp(b, a))[0]) : null
				}
				const daily = [...x.daily.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ date: r.date, came: r.came, possible: r.possible, percent: r.possible ? pct(r.came, r.possible) : null }))
				return {
					grade: x.grade, classes: x.classes, students: x.students, schools: x.schools, present: x.present, possible: x.possible, late: x.late,
					percent: x.possible ? pct(x.present, x.possible) : null, latePercent: x.present ? pct(x.late, x.present) : null,
					best, worst, daily: only ? daily : []
				}
			})
			const scored = grades.filter((r) => r.percent !== null)
			const totalPossible = sum(scored, 'possible'), totalPresent = sum(scored, 'present')
			return {
				success: true, from: ds[0].from, to: ds[0].to, schoolDays: ds[0].schoolDays, overall: totalPossible ? pct(totalPresent, totalPossible) : null,
				overallPresent: totalPresent, overallPossible: totalPossible, grades, classCount: sum(ds, 'classCount'), classes
			}
		}
	},

	// ---------- bitta sinf tafsiloti: sinf qaysi tumanga tegishli ekanini bilmaymiz — hamma tumandan so'raladi, javob bergani qaytariladi ----------
	'/grade-class': {
		ttl: 0,
		prepare: (query) => {
			if (!ID_RX.test(String(query.sinfId || ''))) throw new FederationError("Sinf noto'g'ri", 404)
			return query
		},
		merge: (parts, ctx) => {
			const hit = parts.find((p) => p.data && p.data.success !== false && p.data.class)
			// egasi bo'lmagan tumanlar "Sinf topilmadi" deydi — bu haqiqiy nosozlik emas, partial'ga kirmasin
			if (ctx.failed) for (let i = ctx.failed.length - 1; i >= 0; i--) if (String(ctx.failed[i].message).startsWith('Sinf topilmadi')) ctx.failed.splice(i, 1)
			return hit ? hit.data : { success: false, status: 404, message: 'Sinf topilmadi' }
		}
	},

	// ---------- sababli kelmaganlar ----------
	'/leaves': {
		ttl: 0,
		merge: (parts) => {
			const ds = parts.map((p) => p.data)
			// asl tartib: startDate kamayish, so'ng yaratilgan vaqt kamayish (ObjectId vaqti shunga mos)
			const cmp = (a, b) => cmpStr(b.startDate, a.startDate)
			const tie = (a, b) => -idCmp(a, b)
			const leaves = kmerge(ds.map((d) => d.leaves || []), cmp, tie)
			const studentLeaves = kmerge(ds.map((d) => d.studentLeaves || []), cmp, tie)
			const byType = { tatil: 0, safar: 0, kasallik: 0, boshqa: 0 }
			for (const d of ds) for (const [k, v] of Object.entries(d.byType || {})) byType[k] = (byType[k] || 0) + v
			const d0 = ds[0]
			return {
				success: true, from: d0.from, to: d0.to, total: sum(ds, 'total'), active: sum(ds, 'active'), byType, labels: d0.labels,
				leaves, studentLeaves, studentLabels: d0.studentLabels
			}
		}
	},

	// ---------- qidiruv ----------
	'/search': {
		ttl: 0,
		merge: (parts) => {
			const ds = parts.map((p) => p.data)
			// asl servis: schools limit 6, sinflar grade/letter bo'yicha limit 8, o'quvchi va xodimlar limit 12 (tabiiy tartib ~ _id)
			const classCmp = (a, b) => { const x = sinfKey(a), y = sinfKey(b); return x.grade - y.grade || cmpStr(x.letter, y.letter) }
			return {
				success: true,
				schools: kmerge(ds.map((d) => d.schools || []), () => 0).slice(0, 6),
				classes: kmerge(ds.map((d) => d.classes || []), classCmp).slice(0, 8),
				students: kmerge(ds.map((d) => d.students || []), () => 0).slice(0, 12),
				staff: kmerge(ds.map((d) => d.staff || []), () => 0).slice(0, 12)
			}
		}
	},

	// ---------- Aqlli kuzatuv hodisalari (kadr/lavha), sahifa o'lchami 24 qat'iy ----------
	'/ai-evidence': {
		ttl: 0,
		prepare: (query) => {
			if (query.schoolId && !ID_RX.test(String(query.schoolId))) throw new FederationError("Maktab id noto'g'ri", 404)
			return { ...query, page: 1 }
		},
		merge: async (parts, ctx) => {
			const ds = parts.map((p) => p.data)
			const SIZE = 24
			const total = sum(ds, 'total')
			const pages = Math.max(1, Math.ceil(total / SIZE))
			const current = Math.max(1, Number(ctx.query.page) || 1)
			let items = []
			if ((current - 1) * SIZE < total) {
				const prepared = { ...ctx.query, page: 1 }
				const lists = await Promise.all(parts.map((p) => gather(p, ctx, '/ai-evidence', 'items', prepared, 0, current * SIZE)))
				items = kmerge(lists, (a, b) => timeOf(b.time) - timeOf(a.time), (a, b) => -idCmp(a, b)).slice((current - 1) * SIZE, current * SIZE)
			}
			const byKind = {}
			for (const d of ds) for (const [k, n] of Object.entries(d.byKind || {})) byKind[k] = (byKind[k] || 0) + n
			return { success: true, total, page: current, pages, byKind, items }
		}
	}
}
