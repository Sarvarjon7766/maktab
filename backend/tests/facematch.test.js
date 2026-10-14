const test = require('node:test')
const assert = require('node:assert')
const m = require('../ai/faceMatch')

// Sintetik yuz izlari: tasodifiy birlik vektorlar (turli odamlar deyarli ortogonal), "kadrdagi yuz" = o'z izi + shovqin
let seed = 7
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 - 0.5 }
const unit = (v) => { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)); return Float32Array.from(v.map((x) => x / n)) }
const randomEmb = () => unit(Array.from({ length: 128 }, rnd))
const noisy = (e, amount) => unit(Array.from(e, (x) => x + amount * rnd()))

const classes = ['A', 'B', 'C']
const gallery = []
const embOf = new Map()
for (const c of classes) for (let i = 0; i < 20; i++) { const id = `${c}${i}`; const e = randomEmb(); embOf.set(id, e); gallery.push({ studentId: id, sinfId: c, emb: e }) }

test('topMatches: eng yaqin o\'quvchi va farq', () => {
	const r = m.topMatches(noisy(embOf.get('B5'), 0.15), gallery)
	assert.equal(r.best.studentId, 'B5')
	assert.ok(r.best.score > 0.8 && r.margin > 0.5)
})

test('chooseClass: kamera 6-A ga biriktirilgan, lekin xonada 7-B — ovozlar bilan aniqlanadi', () => {
	const votes = new Map()
	for (let frame = 0; frame < 3; frame++) {
		m.decayVotes(votes)
		const faces = ['B1', 'B2', 'B3', 'B4'].map((id) => m.topMatches(noisy(embOf.get(id), 0.25), gallery))
		m.addVotes(votes, faces)
	}
	const c = m.chooseClass(votes, 'A')
	assert.equal(c.sinfId, 'B')
	assert.equal(c.source, 'inferred')
})

test('chooseClass: ovoz yetarli bo\'lmasa — biriktirilgan sinf taxmin sifatida', () => {
	const votes = new Map([['B', 1]])
	const c = m.chooseClass(votes, 'A')
	assert.equal(c.sinfId, 'A')
	assert.equal(c.source, 'assigned')
})

test('chooseClass: aralash ovozlar (ikki sinf teng) — aniqlanmaydi, biriktirilganga qaytadi', () => {
	const c = m.chooseClass(new Map([['B', 3], ['C', 3]]), 'A')
	assert.equal(c.sinfId, 'A')
})

test('identifyInClass: sinf ichidagi to\'g\'ri o\'quvchi', () => {
	const r = m.identifyInClass(noisy(embOf.get('B7'), 0.3), 40, gallery, 'B')
	assert.equal(r.studentId, 'B7')
})

test('identifyInClass: boshqa sinf o\'quvchisi (begona) xonada rad etiladi', () => {
	// A sinf o'quvchisi B xonasida: B ichida mos kelmaydi
	assert.equal(m.identifyInClass(noisy(embOf.get('A3'), 0.2), 40, gallery, 'B'), null)
})

test('identifyInClass: bazada yo\'q yuz (tasodifiy) rad etiladi', () => {
	let accepted = 0
	for (let i = 0; i < 200; i++) if (m.identifyInClass(randomEmb(), 40, gallery, 'B')) accepted++
	assert.equal(accepted, 0)
})

test('identifyInClass: ikki o\'xshash o\'quvchi (egizak) — farq kichik bo\'lsa rad etiladi', () => {
	const twin = noisy(embOf.get('B1'), 0.05)
	const g = [...gallery, { studentId: 'B1twin', sinfId: 'B', emb: twin }]
	assert.equal(m.identifyInClass(noisy(embOf.get('B1'), 0.05), 40, g, 'B'), null)
})

test('thresholdFor: kichik yuzda chegara ko\'tariladi', () => {
	assert.ok(m.thresholdFor(20, 0.42) > m.thresholdFor(35, 0.42))
	assert.ok(m.thresholdFor(35, 0.42) > m.thresholdFor(60, 0.42))
})

// ---- indeks, anchor va davomat shlyuzi ----
const indexed = () => m.attachIndex(gallery.map((g) => ({ ...g, src: 'photo' })), classes.flatMap((c) => Array.from({ length: 20 }, (_, i) => ({ _id: `${c}${i}`, sinf: c }))))

test('indeks: sinf ichidagi qidiruv indekssiz natija bilan bir xil', () => {
	const idx = indexed()
	for (const id of ['A3', 'B7', 'C19']) {
		const e = noisy(embOf.get(id), 0.2)
		const a = m.topMatches(e, gallery, id[0]), b = m.topMatches(e, idx, id[0])
		assert.equal(a.best.studentId, b.best.studentId)
		assert.ok(Math.abs(a.best.score - b.best.score) < 1e-5)
	}
})

test('indeks: butun maktab prototip qidiruvi to\'g\'ri sinfni topadi', () => {
	const idx = indexed()
	const r = m.topMatches(noisy(embOf.get('B5'), 0.2), idx)
	assert.equal(r.best.studentId, 'B5')
	assert.equal(r.best.sinfId, 'B')
	assert.equal(idx.protos.length, 60)
})

test('qamrov: izi bor o\'quvchilar ulushi hisoblanadi', () => {
	const items = m.attachIndex(gallery.filter((g) => g.sinfId === 'A' && Number(g.studentId.slice(1)) < 10).map((g) => ({ ...g, src: 'photo' })),
		Array.from({ length: 20 }, (_, i) => ({ _id: `A${i}`, sinf: 'A' })))
	assert.deepEqual(items.coverage.get('A'), { total: 20, enrolled: 10 })
})

test('anchorScore: avto-izlar hisobga olinmaydi', () => {
	const e = embOf.get('A1')
	const items = m.attachIndex([{ studentId: 'A1', sinfId: 'A', emb: e, src: 'auto' }, { studentId: 'A1', sinfId: 'A', emb: embOf.get('B1'), src: 'photo' }], [])
	assert.ok(m.anchorScore(items, 'A1', e) < 0.3) // avto-iz bilan mos, lekin odam kiritgan iz bilan emas
	assert.equal(m.anchorScore(items, 'NOPE', e), -1)
})

test('attendanceGate: hamma shart bajarilsa o\'tadi, har biri alohida to\'sadi', () => {
	const ok = { hits: 3, score: 0.6, margin: 0.2, size: 50, studentSinf: 'A', roomSinf: 'A', coverage: { total: 20, enrolled: 18 } }
	const cfg = { faceAttendanceHits: 3, faceAttendanceScore: 0.45, faceAttendanceMinCoverage: 0.8 }
	assert.deepEqual(m.attendanceGate(ok, cfg), { ok: true })
	assert.equal(m.attendanceGate({ ...ok, hits: 2 }, cfg).reason, 'hits')
	assert.equal(m.attendanceGate({ ...ok, score: 0.44 }, cfg).reason, 'score')
	assert.equal(m.attendanceGate({ ...ok, margin: 0.05 }, cfg).reason, 'margin')
	assert.equal(m.attendanceGate({ ...ok, size: 30 }, cfg).reason, 'size')
	assert.equal(m.attendanceGate({ ...ok, roomSinf: 'B' }, cfg).reason, 'class')
	assert.equal(m.attendanceGate({ ...ok, coverage: { total: 20, enrolled: 10 } }, cfg).reason, 'coverage')
	assert.equal(m.attendanceGate({ ...ok, coverage: undefined }, cfg).reason, 'coverage')
	assert.equal(m.attendanceGate({ ...ok, coverage: { total: 1, enrolled: 1 } }, cfg).ok, true) // 100% qamrov
})

// ---- yo'nalish bo'yicha davomat qarori ----
test('attendanceDecision: kirdi kamerasi — chiqib ketgan qayta kiradi, ishdagi qayta yozilmaydi', () => {
	const now = new Date('2026-10-14T08:00:00Z'), old = new Date('2026-10-14T07:00:00Z')
	assert.equal(m.attendanceDecision({ direction: 'in', status: null, lastChangeAt: null, now }), 'in')           // hali kirmagan
	assert.equal(m.attendanceDecision({ direction: 'in', status: 'ishda', lastChangeAt: old, now }), null)          // kirdi, kirdi bo'lmaydi
	assert.equal(m.attendanceDecision({ direction: 'in', status: 'tashqarida', lastChangeAt: old, now }), 'in')     // chiqqan — yana kirdi
	assert.equal(m.attendanceDecision({ direction: 'in', status: 'kelmagan', lastChangeAt: null, now }), 'in')
})

test('attendanceDecision: chiqdi kamerasi — faqat ishdagiga chiqdi', () => {
	const now = new Date('2026-10-14T08:00:00Z'), old = new Date('2026-10-14T07:00:00Z')
	assert.equal(m.attendanceDecision({ direction: 'out', status: 'ishda', lastChangeAt: old, now }), 'out')
	assert.equal(m.attendanceDecision({ direction: 'out', status: 'tashqarida', lastChangeAt: old, now }), null)    // allaqachon chiqqan
	assert.equal(m.attendanceDecision({ direction: 'out', status: null, lastChangeAt: null, now }), null)            // kirishi yo'q
})

test('attendanceDecision: o\'chiq kamera yozmaydi; tebranishga qarshi kutish vaqti', () => {
	const now = new Date('2026-10-14T08:00:00Z')
	assert.equal(m.attendanceDecision({ direction: 'off', status: null, lastChangeAt: null, now }), null)
	const recent = new Date(now.getTime() - 2 * 60000) // 2 daqiqa oldin chiqqan
	assert.equal(m.attendanceDecision({ direction: 'in', status: 'tashqarida', lastChangeAt: recent, now, cooldownMin: 5 }), null)
	assert.equal(m.attendanceDecision({ direction: 'in', status: 'tashqarida', lastChangeAt: recent, now, cooldownMin: 1 }), 'in')
	const justIn = new Date(now.getTime() - 60000)
	assert.equal(m.attendanceDecision({ direction: 'out', status: 'ishda', lastChangeAt: justIn, now, cooldownMin: 5 }), null) // yangi kirgan zahoti chiqmaydi
})

test('bumpStreak: ketma-ket kadrlar sanaladi, uzilsa qayta boshlanadi', () => {
	const map = new Map(), T = 1_000_000, stale = 4 * 60000
	assert.equal(m.bumpStreak(map, 'k', T, stale), 1)
	assert.equal(m.bumpStreak(map, 'k', T + 60000, stale), 2)
	assert.equal(m.bumpStreak(map, 'k', T + 120000, stale), 3)
	assert.equal(m.bumpStreak(map, 'k', T + 120000 + stale + 1, stale), 1) // uzilish
	assert.equal(m.bumpStreak(map, 'other', T, stale), 1)
})

test('attendanceGate: xodim uchun sinf va qamrov talab qilinmaydi', () => {
	const cfg = { faceAttendanceHits: 3, faceAttendanceScore: 0.45 }
	assert.equal(m.attendanceGate({ hits: 3, score: 0.6, margin: 0.3, size: 50, needClass: false }, cfg).ok, true)
	assert.equal(m.attendanceGate({ hits: 3, score: 0.6, margin: 0.3, size: 50 }, cfg).ok, false) // o'quvchi: sinf/qamrov kerak
	assert.equal(m.attendanceGate({ hits: 2, score: 0.6, margin: 0.3, size: 50, needClass: false }, cfg).reason, 'hits')
})

// ---- butun maktab bo'yicha aniqlash (sinfsiz darvoza kamerasi) ----
test('identifySchool: sinf taxminisiz o\'quvchini topadi, begona yuzni rad etadi', () => {
	const idx = indexed()
	const r = m.identifySchool(noisy(embOf.get('C12'), 0.2), 50, idx)
	assert.equal(r.studentId, 'C12')
	assert.equal(r.sinfId, 'C')
	assert.ok(r.score > 0.8)
	assert.equal(m.identifySchool(randomEmb(), 50, idx), null) // galereyada yo'q odam
})

test('identifySchool: ikki o\'quvchiga bir xil yaqin bo\'lsa rad etadi (farq kichik)', () => {
	const a = embOf.get('A1'), b = embOf.get('A2')
	const mid = unit(Array.from(a, (x, i) => x + b[i])) // a va b o'rtasidagi yuz
	assert.equal(m.identifySchool(mid, 50, indexed(), { margin: 0.1 }), null)
})

// ---- odam detektori: bo'lingan quti (tik turgan odam) ----
const { mergeFragments } = require('../ai/personDetector')
test('mergeFragments: tik turgan odamning tanasi va oyoqlari bitta odam', () => {
	const r = mergeFragments([{ x1: 100, y1: 100, x2: 220, y2: 330, score: 0.6 }, { x1: 105, y1: 320, x2: 215, y2: 520, score: 0.5 }])
	assert.equal(r.length, 1)
	assert.equal(r[0].y2, 520)
})
test('mergeFragments: o\'tirgan o\'quvchi va ortidagisi birlashmaydi', () => {
	const r = mergeFragments([{ x1: 100, y1: 100, x2: 220, y2: 230, score: 0.6 }, { x1: 105, y1: 210, x2: 215, y2: 340, score: 0.5 }])
	assert.equal(r.length, 2)
})
test('mergeFragments: yonma-yon odamlar birlashmaydi', () => {
	const r = mergeFragments([{ x1: 100, y1: 100, x2: 200, y2: 330, score: 0.6 }, { x1: 260, y1: 100, x2: 360, y2: 330, score: 0.5 }])
	assert.equal(r.length, 2)
})
