// VILOYAT serveri: tuman serverlariga bir vaqtda so'rov ("scatter") va natijalarni jamlash uchun umumiy yordamchilar.
const { getJson, FederationError } = require('./client')
const registry = require('./registry')

const CONCURRENCY = 8
const cache = new Map() // key -> { t, p }
const MAX_CACHE = 400

async function pool(items, fn, size = CONCURRENCY) {
	const out = new Array(items.length)
	let i = 0
	await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
		while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) }
	}))
	return out
}

// Bitta tumandan JSON (kesh + bir vaqtdagi bir xil so'rovlarni birlashtirish). ttlMs=0 — keshsiz
function fetchOne(entry, path, query, ttlMs = 0) {
	const key = `${entry.id}|${path}|${JSON.stringify(query || {}, Object.keys(query || {}).sort())}`
	const now = Date.now()
	const hit = cache.get(key)
	if (ttlMs && hit && now - hit.t < ttlMs) return hit.p
	const p = getJson(entry, path, query).then(({ ok, status, data }) => ({ ok, status, data }))
	if (ttlMs) {
		cache.set(key, { t: now, p })
		p.catch(() => cache.delete(key))
		if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value)
	}
	return p
}

// Hamma ruxsat etilgan tumanlardan: [{ entry, ok, data, status } | { entry, error }]
async function scatter(entries, path, query, { ttlMs = 0, queryFor } = {}) {
	return pool(entries, async (entry) => {
		try {
			const q = queryFor ? queryFor(entry, query) : query
			const r = await fetchOne(entry, path, q, ttlMs)
			if (!r.ok || !r.data) return { entry, error: new FederationError(r.data?.message || `Tuman javobi xato (${r.status})`, r.status), status: r.status }
			return { entry, ok: true, data: r.data, status: r.status }
		} catch (e) {
			return { entry, error: e }
		}
	})
}

// scatter natijasini ajratadi: muvaffaqiyatli bo'laklar va xatolar
const split = (results) => ({
	parts: results.filter((r) => r.ok).map((r) => ({ entry: r.entry, data: r.data })),
	failed: results.filter((r) => !r.ok).map((r) => ({ district: r.entry.name, message: String(r.error?.message || r.error).slice(0, 160) }))
})

// Maktab → server (schoolId bo'yicha egasini topish). Maktablar ro'yxati har 2 daqiqada yangilanadi, topilmasa darhol qayta so'raladi
let idx = null
async function loadIndex(entries) {
	const map = new Map()
	const results = await scatter(entries, '/schools', null)
	for (const r of results) if (r.ok) for (const s of r.data.schools || []) map.set(String(s._id), { entryId: r.entry.id, district: s.district || '', region: s.region || '', name: s.name })
	idx = { at: Date.now(), map, ids: new Set(entries.map((e) => e.id)) }
	return map
}
async function ownerOf(schoolId, allEntries) {
	const id = String(schoolId)
	const fresh = idx && Date.now() - idx.at < 120000 && allEntries.every((e) => idx.ids.has(e.id))
	if (!fresh) await loadIndex(allEntries)
	let hit = idx.map.get(id)
	if (!hit && Date.now() - idx.at > 15000) { await loadIndex(allEntries); hit = idx.map.get(id) } // yangi maktab qo'shilgan bo'lishi mumkin
	return hit ? { ...hit, entry: allEntries.find((e) => e.id === hit.entryId) } : null
}
const schoolMap = async (entries) => { if (!idx || Date.now() - idx.at > 120000) await loadIndex(entries); return idx.map }

module.exports = { scatter, split, fetchOne, ownerOf, schoolMap, pool, registry }
