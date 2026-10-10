// Og'ir tahlil so'rovlari uchun kesh: bir xil so'rov (URL) TTL ichida qayta hisoblanmaydi.
// Bir vaqtda kelgan bir xil so'rovlar bitta hisob-kitobni kutadi (promise keshlanadi). Monitor ma'lumotlari barcha monitorlar uchun bir xil,
// maktab statistikasida kalitga maktab ham qo'shiladi (keyOf).
// Eskirgan natija (TTL o'tgan, lekin STALE ichida) darhol qaytariladi va yangisi orqa fonda hisoblanadi: katta tizimda (80 maktab,
// 200 ming o'quvchi) og'ir hisobot 10+ soniya olishi mumkin, foydalanuvchi esa faqat birinchi marta kutadi.
const { scopeKey } = require('./monitorScope')
const store = new Map()
const MAX = 200
const STALE_MS = 30 * 60 * 1000

// Kalit faqat yo'l (pathname) + ma'lum so'rov parametrlaridan tuziladi (tartiblangan): ?_=1 kabi ixtiyoriy
// parametrlar keshni aylanib o'tmasin va keshni to'ldirib yubormasin
const KEY_PARAMS = ['date', 'from', 'to', 'schoolId', 'sinfId', 'district', 'kind', 'status', 'grade', 'page', 'limit', 'q', 'minStreak', 'group', 'type']
const urlKey = (req) => {
	const path = String(req.originalUrl || req.url || '').split('?')[0]
	const query = req.query || {}
	const parts = []
	for (const k of KEY_PARAMS) {
		if (query[k] === undefined) continue
		const v = Array.isArray(query[k]) ? query[k].join(',') : typeof query[k] === 'object' ? JSON.stringify(query[k]) : String(query[k])
		parts.push(`${k}=${v.slice(0, 200)}`)
	}
	return `${path}?${parts.join('&')}`
}

// Kalit monitor hududini ham o'z ichiga oladi: bir tuman natijasi boshqa tumanga berilmaydi
const cached = (ttlMs, fn, keyOf = (req) => `${urlKey(req)}|${scopeKey()}`) => (req, ...rest) => {
	const key = keyOf(req)
	const now = Date.now()
	const hit = store.get(key)
	if (hit && now - hit.t < ttlMs) return hit.p
	const compute = () => {
		const p = Promise.resolve(fn(req, ...rest))
		const entry = { t: Date.now(), p, busy: false }
		p.catch(() => { if (store.get(key) === entry) store.delete(key) }) // xato keshlanmaydi
		return entry
	}
	if (hit && now - hit.t < STALE_MS) {
		// eskirgan natijani darhol qaytaramiz, yangilanish orqa fonda (bir vaqtda faqat bitta)
		if (!hit.busy) {
			hit.busy = true
			const fresh = compute()
			fresh.p.then(() => store.set(key, fresh), () => { hit.busy = false })
		}
		return hit.p
	}
	const entry = compute()
	store.set(key, entry)
	if (store.size > MAX) for (const [k, v] of store) { if (now - v.t >= STALE_MS || store.size > MAX) store.delete(k); if (store.size <= MAX * 0.75) break }
	return entry.p
}

module.exports = { cached, byUrlAndSchool: (req) => `${urlKey(req)}|${req.user?.school || ''}|${scopeKey()}` }
