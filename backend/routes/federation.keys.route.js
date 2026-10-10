// TUMAN serveri: viloyat serveriga beriladigan federatsiya (faqat o'qish) API kalitlarini boshqarish. Faqat tizim egasi (superadmin).
// To'liq kalit YARATILGANDA BIR MARTA ko'rsatiladi, keyin faqat prefiks va oxirgi foydalanish ko'rinadi (hash saqlanadi).
const express = require('express')
const mongoose = require('mongoose')
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const FederationKey = require('../models/federation.key.model')
const FederationAudit = require('../models/federation.audit.model')
const { generateKey } = require('../middlewares/federationAuth')

const router = express.Router()
router.use(verifyToken, requireRole('superadmin'))

const IP = /^[0-9a-fA-F:.]{3,45}$/
const view = (k) => ({ _id: k._id, name: k.name, prefix: k.prefix, active: k.active, expiresAt: k.expiresAt, allowedIps: k.allowedIps, ratePerMin: k.ratePerMin, lastUsedAt: k.lastUsedAt, lastUsedIp: k.lastUsedIp, createdAt: k.createdAt })
const ips = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean)
const fail = (res, status, message) => res.status(status).json({ success: false, message })
const wrap = (fn) => async (req, res) => { try { await fn(req, res) } catch (e) { console.error(e); fail(res, 500, 'Server xatosi') } }

router.get('/', wrap(async (req, res) => {
	res.json({ success: true, keys: (await FederationKey.find().sort({ createdAt: -1 }).lean()).map(view) })
}))

router.post('/', wrap(async (req, res) => {
	const name = String(req.body?.name || '').trim().slice(0, 80)
	if (name.length < 2) return fail(res, 400, 'Kalit nomini kiriting')
	const allowedIps = ips(req.body?.allowedIps)
	if (allowedIps.some((x) => !IP.test(x))) return fail(res, 400, "IP manzil noto'g'ri")
	const days = Number(req.body?.expiresInDays)
	const expiresAt = days > 0 ? new Date(Date.now() + Math.min(days, 3650) * 86400000) : null
	const { token, prefix, keyHash } = generateKey()
	const doc = await FederationKey.create({ name, prefix, keyHash, allowedIps, expiresAt, createdBy: req.user.userId || null })
	res.json({ success: true, key: view(doc), token }) // token faqat shu javobda
}))

router.put('/:id', wrap(async (req, res) => {
	if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Id noto'g'ri")
	const set = {}
	if (typeof req.body?.active === 'boolean') set.active = req.body.active
	if (req.body?.name !== undefined) { const n = String(req.body.name).trim().slice(0, 80); if (n.length < 2) return fail(res, 400, 'Kalit nomini kiriting'); set.name = n }
	if (req.body?.allowedIps !== undefined) { const a = ips(req.body.allowedIps); if (a.some((x) => !IP.test(x))) return fail(res, 400, "IP manzil noto'g'ri"); set.allowedIps = a }
	if (req.body?.expiresInDays !== undefined) { const d = Number(req.body.expiresInDays); set.expiresAt = d > 0 ? new Date(Date.now() + Math.min(d, 3650) * 86400000) : null }
	const doc = await FederationKey.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }).lean()
	if (!doc) return fail(res, 404, 'Kalit topilmadi')
	res.json({ success: true, key: view(doc) })
}))

router.delete('/:id', wrap(async (req, res) => {
	if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Id noto'g'ri")
	const r = await FederationKey.deleteOne({ _id: req.params.id })
	res.json({ success: r.deletedCount > 0 })
}))

// Oxirgi so'rovlar (audit)
router.get('/audit', wrap(async (req, res) => {
	const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
	res.json({ success: true, rows: await FederationAudit.find().sort({ at: -1 }).limit(limit).lean() })
}))

module.exports = router
