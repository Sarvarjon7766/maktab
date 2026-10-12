// Viloyat serveri (5070, tumanlardan jamlaydi) natijasini asl tizim (5050, hammasi bir bazada) bilan solishtiradi.
//   node compare.cjs                 — hamma yo'llar
//   node compare.cjs /overview /trend — faqat shular
const A = 'http://localhost:5050', R = 'http://localhost:5070'
const IGNORE = new Set(['updatedAt', 'partial', 'generatedAt', 'ms'])
const login = async (base, username, password) => { const r = await fetch(base + '/api/user/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) }).then((x) => x.json()); if (!r.token) throw new Error(base + ' login: ' + JSON.stringify(r)); return r.token }
const get = async (base, token, p) => { const r = await fetch(base + p, { headers: { Authorization: 'Bearer ' + token } }); const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { /* json emas */ } return { s: r.status, j } }
const norm = (v) => { if (Array.isArray(v)) return v.map(norm); if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).filter((k) => !IGNORE.has(k)).sort().map((k) => [k, norm(v[k])])); return v }
function diff(a, b, path = '', out = []) {
	if (out.length >= 6) return out
	if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) { out.push(`${path}: ${JSON.stringify(a)?.slice(0, 60)} != ${JSON.stringify(b)?.slice(0, 60)}`); return out }
	if (Array.isArray(a)) { if (a.length !== b.length) out.push(`${path}: uzunlik ${a.length} != ${b.length}`); for (let i = 0; i < Math.min(a.length, b.length); i++) { diff(a[i], b[i], `${path}[${i}]`, out); if (out.length >= 6) break } return out }
	if (a && typeof a === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (!(k in a)) out.push(`${path}.${k}: asl'da yo'q`); else if (!(k in b)) out.push(`${path}.${k}: viloyatda yo'q`); else diff(a[k], b[k], `${path}.${k}`, out); if (out.length >= 6) break } return out }
	if (a !== b) out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`)
	return out
}
;(async () => {
	const ta = await login(A, 'tizim123', '123456'), tr = await login(R, 'viloyat', 'Region-test-123')
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
	const from = '2026-09-10', to = today, rng = `from=${from}&to=${to}`
	const ov = (await get(A, ta, '/api/monitor/overview')).j
	const sid = ov.schools.find((s) => s.stats?.studentTotal > 0)._id, sid2 = ov.schools[ov.schools.length - 1]._id
	const sinf = ((await get(A, ta, '/api/monitor/classes?schoolId=' + sid)).j?.classes || [])[0]?._id
	const eps = ['/me', '/district-names', '/overview', '/map', `/districts?${rng}`, '/ai', '/ai-evidence', `/trend?${rng}`, `/schools-report?${rng}`, `/schools-compare?${rng}`, '/cameras', '/people-all?kind=student&limit=10', '/people-all?kind=staff&limit=10&page=2', `/late-people?kind=student&${rng}&limit=10`, `/at-risk?${rng}&limit=10`, '/classes-all', `/arrival?${rng}`, '/camera-events?limit=10', '/camera-events?limit=10&page=2', '/classrooms-all', `/grades?${rng}`, `/leaves?${rng}`, '/alerts', '/live', '/camera-health', '/search?q=a',
		...['late', 'risk', 'leaves', 'alerts', 'cameras', 'staff', 'students', 'classrooms', 'trend'].map((m) => `/region/${m}?${rng}`),
		`/school/${sid}`, `/school/${sid}/students`, `/school/${sid}/staff`, `/classes?schoolId=${sid}`, `/absent-students?schoolId=${sid}`, `/trend?${rng}&schoolId=${sid}`, `/people-all?kind=student&schoolId=${sid2}&limit=5`, `/late-people?kind=student&${rng}&schoolId=${sid}`, `/alerts?date=${today}`, `/overview?date=${from}`, `/ai?date=${from}`]
	const only = process.argv.slice(2)
	let ok = 0, bad = 0
	for (const e of eps) {
		if (only.length && !only.some((o) => e.startsWith('/' + o.replace(/^\//, '')))) continue
		const [x, y] = await Promise.all([get(A, ta, '/api/monitor' + e), get(R, tr, '/api/monitor' + e)])
		const d = x.s === y.s && x.j && y.j ? diff(norm(x.j), norm(y.j)) : [`holat ${x.s} != ${y.s}${y.j?.message ? ' (' + y.j.message + ')' : ''}`]
		if (!d.length) { ok++; console.log('OK  ', e.split('?')[0], y.j?.partial ? 'PARTIAL ' + JSON.stringify(y.j.partial) : '') } else { bad++; console.log('XATO', e.slice(0, 70)); d.forEach((l) => console.log('      ' + l)) }
	}
	console.log(`\nJami: OK ${ok}, XATO ${bad}`)
})().catch((e) => { console.error(e); process.exit(1) })
