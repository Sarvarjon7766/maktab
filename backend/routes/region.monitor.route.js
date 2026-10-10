// VILOYAT serveri: /api/monitor/* — viloyat monitorining hamma sahifalari shu yo'llardan ma'lumot oladi (tuman serverlaridagi federatsiya API'siga
// tayanadi). Asl tuman/viloyat monitor API'si bilan bir xil javob shakli: sahifalar o'zgarmaydi. FAQAT o'qish (GET).
// Xavfsizlik: JWT + rol (monitor/superadmin) + hudud (monitorning tumani/viloyati bo'yicha ruxsat etilgan tumanlar). Boshqa tuman ma'lumoti ko'rinmaydi.
const express = require('express')
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const registry = require('../services/federation/registry')
const gateway = require('../services/federation/gateway')
const { getJson, FederationError } = require('../services/federation/client')
const { regionContext } = require('../services/federation/ctx')
const defs = require('../services/federation/endpoints')

const router = express.Router()
router.use(verifyToken, requireRole('monitor', 'superadmin'))

router.use(regionContext)

const bad = (res, status, message) => res.status(status).json({ success: false, message })
const suffix = (req) => req.path + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')

// ObjectId ko'rinishi (maktab/shaxs id'lari); noto'g'ri bo'lsa tuman serveriga yuborilmaydi
const isId = (v) => /^[a-f0-9]{24}$/i.test(String(v || ''))

function ownerValue(def, req) {
	const [src, name] = String(def.owner).split('.')
	return src === 'params' ? req.params[name] : req.query[name]
}

// Shaxs egasi: id -> server (kichik xotira keshi)
const personOwner = new Map()
async function proxyPerson(req, res) {
	const { entries } = req.fed
	const path = `/monitor${req.path}`
	const known = personOwner.get(req.params.id)
	const tryEntries = known ? entries.filter((e) => e.id === known) : entries
	const results = await gateway.scatter(tryEntries, path, req.query, { ttlMs: 20000 })
	const hit = results.find((r) => r.ok)
	if (!hit) {
		if (results.every((r) => !r.ok && r.status === 404)) return bad(res, 404, 'Topilmadi')
		return bad(res, 502, 'Tuman serveri javob bermadi')
	}
	personOwner.set(req.params.id, hit.entry.id)
	if (personOwner.size > 5000) personOwner.delete(personOwner.keys().next().value)
	return res.json(hit.data)
}

async function dispatch(def, req, res) {
	const { scope, entries, all } = req.fed
	if (def.regionOnly && scope.level === 'district') return bad(res, 403, "Bu bo'lim faqat viloyat monitori uchun")

	if (def.local) return res.json(await def.local(req.fed, req))
	if (def.ownerPerson) {
		if (!isId(req.params.id)) return bad(res, 400, "Id noto'g'ri")
		return proxyPerson(req, res)
	}

	// maktab egasiga to'g'ridan-to'g'ri uzatish (majburiy yoki ixtiyoriy schoolId)
	const schoolId = def.owner ? ownerValue(def, req) : (req.query.schoolId && isId(req.query.schoolId) ? req.query.schoolId : null)
	if (def.owner || schoolId) {
		if (!isId(schoolId)) return bad(res, 400, "schoolId noto'g'ri")
		const owner = await gateway.ownerOf(schoolId, all)
		if (!owner || !entries.some((e) => e.id === owner.entry.id)) return bad(res, 404, 'Maktab topilmadi')
		const r = await getJson(owner.entry, `/monitor${suffix(req)}`, null)
		return res.status(r.status).json(r.data)
	}

	if (!def.merge) return bad(res, 501, "Bu yo'l viloyat rejimida hali qo'llab-quvvatlanmaydi")
	if (!entries.length) return bad(res, 404, 'Ruxsat etilgan tuman serveri topilmadi')
	const narrowName = req.fed.narrow || scope.district || ''
	const results = await gateway.scatter(entries, `/monitor${req.path}`, def.prepare ? def.prepare(req.query, req.fed) : req.query, {
		ttlMs: def.ttl || 0,
		queryFor: narrowName ? (e, q) => ({ ...q, district: narrowName }) : undefined
	})
	const { parts, failed } = gateway.split(results)
	if (!parts.length) return bad(res, 502, `Tuman serverlari javob bermadi: ${failed.map((f) => f.district).join(', ')}`)
	const body = await def.merge(parts, { query: req.query, scope, narrow: req.fed.narrow, failed, entries, user: req.user, req })
	if (!body || body.success === false) return res.status(body?.status || 500).json(body || { success: false, message: 'Jamlashda xatolik' })
	return res.json(failed.length ? { ...body, partial: failed } : body)
}

for (const [path, def] of Object.entries(defs)) {
	router.get(path, async (req, res) => {
		try {
			await dispatch(def, req, res)
		} catch (error) {
			if (error instanceof FederationError) return bad(res, error.status && error.status < 500 ? error.status : 502, error.message)
			console.error('Viloyat yoli xatosi:', path, error)
			bad(res, 500, 'Hisobotni yuklashda xatolik')
		}
	})
}

// Jadvalda yo'q yo'llar — aniq xabar (boshqa tuman ma'lumotini adashib bermaslik uchun)
router.use((req, res) => bad(res, 404, 'Topilmadi'))

module.exports = router
