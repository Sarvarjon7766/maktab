// Yuz izlarini solishtirish va sinfni aniqlash: sof funksiyalar (model va baza yo'q) — shuning uchun alohida sinaladi.
// Galereya: [{ studentId, sinfId, emb: Float32Array(128, normallangan) }] (o'quvchida bir nechta iz bo'lishi mumkin)

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }

// Yuz izi bo'yicha eng yaqin o'quvchilar: har o'quvchi uchun eng yaxshi o'xshashlik. only — faqat shu sinf (sinfId) yoki hamma (null).
// Qaytadi { best: {studentId, sinfId, score}|null, second: {...}|null, margin } (margin — 1- va 2-o'quvchi farqi)
// Tezlik: galereya attachIndex() bilan indekslangan bo'lsa — sinf bo'yicha qidiruv faqat shu sinf izlarini ko'radi (butun maktab emas),
// butun maktab bo'yicha qidiruv esa har o'quvchining o'rtacha izi (prototip) bilan bajariladi (iz soni 10+ barobar kam). Bu faqat sinfni ovoz bilan
// aniqlash va «boshqa sinfdan yaxshiroq moslik» tekshiruvi uchun; o'quvchini aniq tanlash hamon sinf ichidagi barcha izlar bo'yicha (eng yaxshisi).
function topMatches(emb, gallery, only = null) {
	const per = new Map()
	const list = gallery.byClass ? (only ? gallery.byClass.get(String(only)) || [] : gallery.protos) : gallery
	for (const g of list) {
		if (!gallery.byClass && only && String(g.sinfId) !== String(only)) continue
		const s = dot(emb, g.emb)
		const cur = per.get(g.studentId)
		if (!cur || s > cur.score) per.set(g.studentId, { studentId: g.studentId, sinfId: g.sinfId, score: s })
	}
	let best = null, second = null
	for (const m of per.values()) {
		if (!best || m.score > best.score) { second = best; best = m } else if (!second || m.score > second.score) second = m
	}
	return { best, second, margin: best ? best.score - (second ? second.score : -1) : 0 }
}

// Kichik yuzda o'xshashlik pastroq va shovqinli bo'ladi: chegara yuz o'lchamiga qarab biroz ko'tariladi
function thresholdFor(size, base) {
	if (size >= 40) return base
	if (size >= 28) return base + 0.03
	return base + 0.06
}

// Sinf ovozlari. votes: Map(sinfId -> vazn). Yangi kadrdagi ishonchli (butun maktab bo'yicha) mosliklardan qo'shiladi.
// Har bir yuz faqat o'zining eng yaqin o'quvchisi sinfiga ovoz beradi, ishonch yuqori bo'lsagina.
function addVotes(votes, matches, { voteThreshold = 0.40, voteMargin = 0.08 } = {}) {
	for (const m of matches) {
		if (!m.best || m.best.score < voteThreshold || m.margin < voteMargin) continue
		const k = String(m.best.sinfId)
		votes.set(k, (votes.get(k) || 0) + 1)
	}
	return votes
}

// Ovozlar eskirishi: har yangi kadrda eski ovozlar susayadi, dars almashganda yangi sinf tez ustun bo'ladi
function decayVotes(votes, factor = 0.8) {
	for (const [k, v] of votes) { const n = v * factor; if (n < 0.2) votes.delete(k); else votes.set(k, n) }
	return votes
}

// Xona hozir qaysi sinfda: eng ko'p ovoz olgan sinf, agar kamida minVotes ovoz va ikkinchidan kamida ratio baravar ko'p bo'lsa.
// Aks holda — kameraga biriktirilgan sinf (assigned) taxmin sifatida. source: 'inferred' | 'assigned' | null
function chooseClass(votes, assigned, { minVotes = 3, ratio = 2 } = {}) {
	const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1])
	if (sorted.length && sorted[0][1] >= minVotes && (sorted.length < 2 || sorted[0][1] >= ratio * sorted[1][1])) {
		const inferred = sorted[0][0]
		return { sinfId: inferred, source: String(inferred) === String(assigned) ? 'assigned' : 'inferred', votes: sorted[0][1] }
	}
	if (assigned) return { sinfId: String(assigned), source: 'assigned', votes: sorted.length ? sorted[0][1] : 0, weak: sorted.length > 0 && sorted[0][0] !== String(assigned) }
	return { sinfId: null, source: null, votes: 0 }
}

// Tanilgan sinf ichida yuzni o'quvchiga bog'lash. Qaytadi { studentId, score, margin } yoki null.
// Qo'shimcha himoya: butun maktab bo'yicha boshqa sinfdan sezilarli yaxshiroq moslik bo'lsa (begona) — rad etiladi.
function identifyInClass(emb, size, gallery, sinfId, { threshold = 0.36, margin = 0.06, conflict = 0.08 } = {}) {
	const inClass = topMatches(emb, gallery, sinfId)
	if (!inClass.best) return null
	const thr = thresholdFor(size, threshold)
	if (inClass.best.score < thr) return null
	if (inClass.second && inClass.margin < margin) return null
	const all = topMatches(emb, gallery, null)
	if (all.best && String(all.best.sinfId) !== String(sinfId) && all.best.score > inClass.best.score + conflict) return null
	return { studentId: inClass.best.studentId, score: inClass.best.score, margin: inClass.margin }
}

// Sinfsiz (darvoza, koridor) kameradagi yuzni butun maktab o'quvchilari orasidan aniqlash. Avval prototiplar bilan eng yaqin o'quvchi topiladi (tez),
// so'ng uning barcha izlari bo'yicha aniq o'xshashlik hisoblanadi. Sinf taxmini yo'q, shuning uchun chegara odatda qattiqroq beriladi.
// Qaytadi { studentId, sinfId, score, margin } yoki null
function identifySchool(emb, size, gallery, { threshold = 0.36, margin = 0.06 } = {}) {
	const top = topMatches(emb, gallery)
	if (!top.best) return null
	if (top.second && top.margin < margin) return null
	const list = gallery.byStudent ? gallery.byStudent.get(top.best.studentId) || [] : gallery.filter((g) => g.studentId === top.best.studentId)
	let exact = -1
	for (const g of list) { const s = dot(emb, g.emb); if (s > exact) exact = s }
	if (exact < thresholdFor(size, threshold)) return null
	return { studentId: top.best.studentId, sinfId: top.best.sinfId, score: exact, margin: top.margin }
}

// Galereyani indekslaydi (massivga xususiyat sifatida biriktiradi). active — [{ _id, sinf }]: sinf qamrovi (izi bor o'quvchilar ulushi) uchun
function attachIndex(items, active = []) {
	const byClass = new Map(), byStudent = new Map()
	for (const it of items) {
		if (!byClass.has(it.sinfId)) byClass.set(it.sinfId, [])
		byClass.get(it.sinfId).push(it)
		if (!byStudent.has(it.studentId)) byStudent.set(it.studentId, [])
		byStudent.get(it.studentId).push(it)
	}
	const protos = []
	for (const [studentId, list] of byStudent) {
		const dim = list[0].emb.length, sum = new Float32Array(dim)
		for (const it of list) for (let i = 0; i < dim; i++) sum[i] += it.emb[i]
		let n = 0
		for (let i = 0; i < dim; i++) n += sum[i] * sum[i]
		n = Math.sqrt(n) || 1
		for (let i = 0; i < dim; i++) sum[i] /= n
		protos.push({ studentId, sinfId: list[0].sinfId, emb: sum })
	}
	const coverage = new Map()
	for (const s of active) {
		const k = String(s.sinf)
		const c = coverage.get(k) || { total: 0, enrolled: 0 }
		c.total++
		if (byStudent.has(String(s._id))) c.enrolled++
		coverage.set(k, c)
	}
	Object.assign(items, { byClass, byStudent, protos, coverage })
	return items
}

// O'quvchining odam kiritgan (asosiy/qo'shimcha) izlariga eng yaqinlik. Avto-o'rganish shu bilan "bog'lanadi": faqat avto-izlarga o'xshash yuz
// o'rganilsa, xato izlar zanjir bo'ylab surilib ketadi (drift). -1 — odam kiritgan iz yo'q
function anchorScore(gallery, studentId, emb) {
	const list = gallery.byStudent ? gallery.byStudent.get(String(studentId)) || [] : gallery.filter((g) => g.studentId === String(studentId))
	let best = -1
	for (const g of list) if (g.src !== 'auto') { const s = dot(emb, g.emb); if (s > best) best = s }
	return best
}

// Yuz orqali «kirdi» yozish shlyuzi (sof funksiya, sinaladi). Hammasi bajarilsagina ok:true
//  - hits: shuncha kadrda tanilgan;  score: o'xshashlik;  margin: sinfdagi 1- va 2-o'quvchi farqi;  size: yuz o'lchami (px)
//  - studentSinf == roomSinf: faqat xonadagi sinfning o'z o'quvchisi
//  - coverage: sinfda izi bor o'quvchilar ulushi. Izi yo'q o'quvchi tanilmaydi, shuning uchun uning o'xshash sinfdoshi unga adashishi mumkin:
//    sinf bazasi yetarli to'lmaguncha avtomatik davomat yozilmaydi
function attendanceGate({ hits, score, margin, size, studentSinf, roomSinf, coverage, needClass = true }, cfg = {}) {
	const minHits = cfg.faceAttendanceHits || 3
	const minScore = cfg.faceAttendanceScore || 0.45
	const minCoverage = cfg.faceAttendanceMinCoverage ?? 0.8
	if (hits < minHits) return { ok: false, reason: 'hits' }
	if (score < minScore) return { ok: false, reason: 'score' }
	if (margin < 0.1) return { ok: false, reason: 'margin' }
	if (size < 36) return { ok: false, reason: 'size' }
	if (needClass) { // xodim (o'qituvchi) sinfga bog'lanmagan: sinf va qamrov tekshiruvi o'quvchilar uchun
		if (String(studentSinf) !== String(roomSinf)) return { ok: false, reason: 'class' }
		if (!coverage || !coverage.total || coverage.enrolled / coverage.total < minCoverage) return { ok: false, reason: 'coverage' }
	}
	return { ok: true }
}

// Kamera yo'nalishi va joriy holatga qarab qaysi harakat yoziladi: 'in' | 'out' | null.
//  - 'in' kamerasi: ishda bo'lmaganlarga «kirdi» (chiqib ketgan bo'lsa ham qayta «kirdi»); allaqachon «ishda» bo'lsa — yozilmaydi (kirdi, kirdi bo'lmaydi)
//  - 'out' kamerasi: faqat «ishda» bo'lganga «chiqdi»; kirishi yo'q bo'lsa yozilmaydi
//  - 'off': yozilmaydi.   Tebranish (kirdi-chiqdi-kirdi...) bo'lmasligi uchun oxirgi o'zgarishdan cooldownMin daqiqa o'tishi kerak
function attendanceDecision({ direction, status, lastChangeAt, now, cooldownMin = 5 }) {
	if (direction !== 'in' && direction !== 'out') return null
	const cooling = lastChangeAt && now - new Date(lastChangeAt) < cooldownMin * 60000
	if (direction === 'in') return status === 'ishda' || cooling ? null : 'in'
	return status === 'ishda' && !cooling ? 'out' : null
}

// Ketma-ket kadrlarda tanilish hisobi (xotirada): uzilsa nolga tushadi. Davomat «bir martalik tasodifiy tanish»dan emas, ketma-ket kadrlardan yoziladi
function bumpStreak(map, key, nowMs, staleMs) {
	const cur = map.get(key)
	const n = cur && nowMs - cur.at <= staleMs ? cur.n + 1 : 1
	map.set(key, { n, at: nowMs })
	return n
}

module.exports = { identifySchool, attendanceDecision, bumpStreak, attachIndex, anchorScore, attendanceGate, dot, topMatches, thresholdFor, addVotes, decayVotes, chooseClass, identifyInClass }
