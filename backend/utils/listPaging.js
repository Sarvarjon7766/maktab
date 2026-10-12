// "Eng ko'p kech qolganlar" kabi katta reyting ro'yxatlari uchun server tomonida qidiruv, filtr, saralash va sahifalash.
// Hamma natija bir marta hisoblanadi (keshlanadi), sahifa/qidiruv/saralash esa xotirada tez bajariladi.
const norm = (s) => String(s || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const MAX_ALL = 5000 // Excel uchun "hammasi" ning chegarasi
const cmpName = (a, b) => String(a.fullName || '').localeCompare(String(b.fullName || ''), 'uz', { numeric: true })

const SORTS = {
	days: (a, b) => b.lateDays - a.lateDays || b.percent - a.percent || cmpName(a, b),
	percent: (a, b) => b.percent - a.percent || b.lateDays - a.lateDays || cmpName(a, b),
	worst: (a, b) => String(b.worst).localeCompare(String(a.worst)) || b.lateDays - a.lateDays || cmpName(a, b),
	name: cmpName
}

// entries — [{ fullName, schoolName, sinf, position, code, lateDays, percent, worst, ... }] (kech qolgan kunlar bo'yicha saralangan bo'lishi shart emas)
// query: { q, group, sort, page, pageSize, all }, kind: 'student' | 'staff'
function pageLate(entries, kind, query = {}) {
	const groupOf = (r) => (kind === 'student' ? r.sinf : r.position) || ''
	const groups = [...new Set(entries.map(groupOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uz', { numeric: true }))
	const needle = norm(query.q).trim()
	const group = String(query.group || '')
	const filtered = entries.filter((r) => (!group || groupOf(r) === group) && (!needle || [r.fullName, r.schoolName, r.sinf, r.position, r.code].some((v) => norm(v).includes(needle))))
	filtered.sort(SORTS[query.sort] || SORTS.days)
	const top = [...entries].sort(SORTS.days)[0] || null // KPI: butun davr bo'yicha eng ko'p kech qolgan
	const latestWorst = filtered.reduce((m, r) => (r.worst && r.worst > m ? r.worst : m), '')
	const total = filtered.length
	if (query.all === '1' || query.all === 1 || query.all === true) return { groups, top, latestWorst, total, page: 1, pages: 1, pageSize: total, people: filtered.slice(0, MAX_ALL) }
	const pageSize = Math.min(Math.max(Number(query.pageSize) || 50, 10), 100)
	const pages = Math.max(1, Math.ceil(total / pageSize))
	const page = Math.min(Math.max(Number(query.page) || 1, 1), pages)
	return { groups, top, latestWorst, total, page, pages, pageSize, people: filtered.slice((page - 1) * pageSize, page * pageSize) }
}

module.exports = { pageLate, SORTS, MAX_ALL }
