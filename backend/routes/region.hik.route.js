// VILOYAT serveri: /api/hik/* — viloyat monitori tuman kameralarini JONLI ko'radi va AI dalillarini (rasm, lavha) ochadi.
// Jonli video viloyat va tuman serverlaridan O'TMAYDI: tuman serveri Hik bulutidan qisqa muddatli oqim tokenini oladi, viloyat uni brauzerga beradi,
// brauzer videoni to'g'ridan-to'g'ri Hik bulutidan oladi. Rasm va lavhalar tuman serveridan oqim (stream) sifatida uzatiladi, viloyatda saqlanmaydi.
// Faqat viloyat monitori/superadmin; ruxsat etilgan tumanlar bilan cheklangan (hudud tashqarisidagi kamera/dalil ochilmaydi).
const express = require('express')
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const gateway = require('../services/federation/gateway')
const { getJson, getStream, FederationError } = require('../services/federation/client')
const { regionContext } = require('../services/federation/ctx')

const router = express.Router()
router.use(verifyToken, requireRole('monitor', 'superadmin'), regionContext)

const isId = (v) => /^[a-f0-9]{24}$/i.test(String(v || ''))
const bad = (res, status, message) => res.status(status).json({ success: false, message })
const wrap = (fn) => async (req, res) => {
	try { await fn(req, res) } catch (error) {
		if (error instanceof FederationError) return bad(res, error.status && error.status < 500 ? error.status : 502, error.message)
		console.error('Viloyat hik yoli xatosi:', req.path, error)
		bad(res, 500, 'Server xatosi')
	}
}

// kamera/hodisa id -> server (xotira keshi)
const owners = new Map()
const remember = (id, entryId) => { owners.set(id, entryId); if (owners.size > 20000) owners.delete(owners.keys().next().value) }
const candidates = (req, id) => { const known = owners.get(id); const known1 = known ? req.fed.entries.filter((e) => e.id === known) : []; return known1.length ? known1 : req.fed.entries }

// Maktab bo'yicha (JSON): egasi tumanga uzatiladi
const bySchool = (path) => wrap(async (req, res) => {
	const schoolId = req.query.schoolId
	if (!isId(schoolId)) return bad(res, 400, "schoolId noto'g'ri")
	const owner = await gateway.ownerOf(schoolId, req.fed.all)
	if (!owner || !req.fed.entries.some((e) => e.id === owner.entry.id)) return bad(res, 404, 'Maktab topilmadi')
	const r = await getJson(owner.entry, `/hik${path}`, req.query)
	res.status(r.status).json(r.data)
})
router.get('/classroom-detail', bySchool('/classroom-detail'))
for (const p of ['live', 'day', 'evidence', 'summary', 'recent']) router.get(`/vision/${p}`, bySchool(`/vision/${p}`))
router.get('/vision/retention', wrap(async (req, res) => {
	const e = req.fed.entries[0]
	if (!e) return bad(res, 404, 'Tuman serveri topilmadi')
	const r = await getJson(e, '/hik/vision/retention', null)
	res.status(r.status).json(r.data)
}))

// Kamera/hodisa id bo'yicha JSON (jonli token, kadr): id qaysi tumanga tegishli ekani birinchi so'rovda aniqlanadi
const byId = (path) => wrap(async (req, res) => {
	const id = req.params.id
	if (!isId(id)) return bad(res, 400, "Id noto'g'ri")
	const results = await gateway.scatter(candidates(req, id), `/hik${path(req)}`, null)
	const hit = results.find((r) => r.ok && r.data?.success !== false)
	if (!hit) {
		if (results.every((r) => !r.ok && (r.status === 400 || r.status === 404))) return bad(res, 404, results.find((r) => r.error?.message)?.error?.message || 'Topilmadi')
		return bad(res, 502, 'Tuman serveri javob bermadi')
	}
	remember(id, hit.entry.id)
	res.setHeader('Cache-Control', 'private, no-store')
	res.json(hit.data)
})
router.get('/cameras/:id/live', byId((req) => `/cameras/${req.params.id}/live`))
router.get('/cameras/:id/snapshot', byId((req) => `/cameras/${req.params.id}/snapshot`))

// Fayl (rasm/lavha): egasi tumandan oqim sifatida uzatiladi
const stream = (path) => wrap(async (req, res) => {
	const id = req.params.id || req.params.cameraId
	if (!isId(id)) return bad(res, 400, "Id noto'g'ri")
	const list = candidates(req, id)
	const attempts = await Promise.allSettled(list.map((e) => getStream(e, `/hik${path(req)}`, null).then((r) => ({ ...r, entry: e }))))
	const ok = attempts.filter((a) => a.status === 'fulfilled' && a.value.status === 200).map((a) => a.value)
	for (const a of attempts) if (a.status === 'fulfilled' && !ok.includes(a.value)) a.value.stream?.destroy()
	if (!ok.length) return bad(res, 404, 'Topilmadi')
	const win = ok[0]
	for (const extra of ok.slice(1)) extra.stream?.destroy()
	remember(id, win.entry.id)
	res.setHeader('Content-Type', win.type)
	res.setHeader('Cache-Control', win.cache || 'private, max-age=3600')
	res.setHeader('X-Content-Type-Options', 'nosniff')
	win.stream.on('error', () => res.destroy())
	win.stream.pipe(res)
})
router.get('/vision/frame/:cameraId', stream((req) => `/vision/frame/${req.params.cameraId}`))
router.get('/events/:id/clip', stream((req) => `/events/${req.params.id}/clip`))
router.get('/events/:id/snapshot', stream((req) => `/events/${req.params.id}/snapshot`))
router.get('/events/:id/frame/:idx', stream((req) => `/events/${req.params.id}/frame/${Number(req.params.idx) || 0}`))

router.use((req, res) => bad(res, 404, 'Topilmadi'))

module.exports = router
