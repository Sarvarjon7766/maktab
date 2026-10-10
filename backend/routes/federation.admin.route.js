// VILOYAT serveri: ulangan tuman serverlari reestrini boshqarish (faqat viloyat superadmini).
// Har tuman: nom, viloyat, manzil (HTTPS) va tuman superadmini bergan API kalit (fk_...). Kalit bazada shifrlangan, javoblarda KO'RSATILMAYDI.
const express = require('express')
const mongoose = require('mongoose')
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const RemoteDistrict = require('../models/remote.district.model')
const registry = require('../services/federation/registry')
const { safeBase, FederationError } = require('../services/federation/client')
const { encrypt } = require('../utils/secretBox')

const router = express.Router()
router.use(verifyToken, requireRole('superadmin'))

const KEY = /^fk_[a-f0-9]{8}\.[A-Za-z0-9_-]{40,64}$/
const view = (d) => ({ _id: d._id, name: d.name, region: d.region, baseUrl: d.baseUrl, apiKeyHint: d.apiKeyHint, active: d.active, lastOkAt: d.lastOkAt, lastError: d.lastError, lastErrorAt: d.lastErrorAt, schools: d.schools, districts: d.districts, version: d.version })
const fail = (res, status, message) => res.status(status).json({ success: false, message })
const wrap = (fn) => async (req, res) => {
	try { await fn(req, res) } catch (e) {
		if (e instanceof FederationError) return fail(res, 400, e.message)
		if (e?.code === 11000) return fail(res, 400, 'Bu nomli tuman allaqachon qo\'shilgan')
		console.error(e); fail(res, 500, 'Server xatosi')
	}
}
const text = (v, max) => String(v || '').trim().slice(0, max)

// Yangi/yangilangan yozuvni tekshiradi (ping) va holatini yozadi
async function verify(id) {
	registry.reset()
	const entry = (await registry.list({ fresh: true })).find((e) => e.id === String(id))
	if (!entry) return { lastError: 'Kalit o\'qilmadi' }
	return registry.check(entry)
}

router.get('/districts', wrap(async (req, res) => {
	res.json({ success: true, districts: (await RemoteDistrict.find().sort({ name: 1 }).lean()).map(view) })
}))

router.post('/districts', wrap(async (req, res) => {
	const name = text(req.body?.name, 120), region = text(req.body?.region, 120), apiKey = text(req.body?.apiKey, 120)
	if (name.length < 2) return fail(res, 400, 'Tuman nomini kiriting')
	if (!KEY.test(apiKey)) return fail(res, 400, "API kalit noto'g'ri (fk_xxxxxxxx.… ko'rinishida bo'lishi kerak)")
	const baseUrl = safeBase(text(req.body?.baseUrl, 200))
	const doc = await RemoteDistrict.create({ name, region, baseUrl, apiKeyEnc: encrypt(apiKey), apiKeyHint: apiKey.slice(-4) })
	const check = await verify(doc._id)
	res.json({ success: true, district: view(await RemoteDistrict.findById(doc._id).lean()), connected: !check.lastError, error: check.lastError || '' })
}))

router.put('/districts/:id', wrap(async (req, res) => {
	if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Id noto'g'ri")
	const set = {}
	if (req.body?.name !== undefined) { const n = text(req.body.name, 120); if (n.length < 2) return fail(res, 400, 'Tuman nomini kiriting'); set.name = n }
	if (req.body?.region !== undefined) set.region = text(req.body.region, 120)
	if (req.body?.baseUrl !== undefined) set.baseUrl = safeBase(text(req.body.baseUrl, 200))
	if (typeof req.body?.active === 'boolean') set.active = req.body.active
	if (req.body?.apiKey) { const k = text(req.body.apiKey, 120); if (!KEY.test(k)) return fail(res, 400, "API kalit noto'g'ri"); set.apiKeyEnc = encrypt(k); set.apiKeyHint = k.slice(-4) }
	const doc = await RemoteDistrict.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).lean()
	if (!doc) return fail(res, 404, 'Tuman topilmadi')
	const check = doc.active ? await verify(doc._id) : {}
	res.json({ success: true, district: view(await RemoteDistrict.findById(doc._id).lean()), connected: doc.active ? !check.lastError : false, error: check.lastError || '' })
}))

router.delete('/districts/:id', wrap(async (req, res) => {
	if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Id noto'g'ri")
	const r = await RemoteDistrict.deleteOne({ _id: req.params.id })
	registry.reset()
	res.json({ success: r.deletedCount > 0 })
}))

router.post('/districts/:id/test', wrap(async (req, res) => {
	if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Id noto'g'ri")
	if (!(await RemoteDistrict.exists({ _id: req.params.id }))) return fail(res, 404, 'Tuman topilmadi')
	const check = await verify(req.params.id)
	res.json({ success: true, connected: !check.lastError, error: check.lastError || '', schools: check.schools || 0, districts: check.districts || [], version: check.version || '' })
}))

module.exports = router
