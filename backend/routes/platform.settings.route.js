const express = require('express')
const router = express.Router()
const { get, update } = require('../controllers/platform.settings.controller')
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')

const requireSuperAdmin = requireRole('superadmin')

router.get('/', verifyToken, requireSuperAdmin, get)

// Tizim egasi bosh sahifasi: butun tizim holati (maktablar, davomat, Hik-Connect, AI, bot, xotira). 20 soniya keshlanadi
const PlatformOverview = require('../services/platform.overview.service')
const { fresh } = require('../utils/ttlCache')
const overviewCached = fresh(20000, () => PlatformOverview.build(), () => 'platform-overview')
const healthCached = fresh(20000, () => PlatformOverview.schoolsHealth(), () => 'platform-schools-health')
router.get('/schools-health', verifyToken, requireSuperAdmin, async (req, res) => {
	try { return res.json(await healthCached(req)) } catch (error) { console.log(error); return res.status(500).json({ success: false, message: 'Server xatosi' }) }
})
router.get('/overview', verifyToken, requireSuperAdmin, async (req, res) => {
	try { return res.json(await overviewCached(req)) } catch (error) { console.log(error); return res.status(500).json({ success: false, message: 'Server xatosi' }) }
})
router.put('/update', verifyToken, requireSuperAdmin, update)

// Dalil (rasm/lavha) va hodisalarni saqlash muddati: sozlash, holat va qo'lda tozalash (faqat tizim egasi)
const Retention = require('../services/retention.service')
router.get('/retention', verifyToken, requireSuperAdmin, (req, res) => Retention.stats().then(r => res.json(r)).catch(e => { console.log(e); res.status(500).json({ success: false, message: 'Server xatosi' }) }))
router.put('/retention', verifyToken, requireSuperAdmin, (req, res) => Retention.save(req.body || {}).then(r => res.json(r)).catch(e => { console.log(e); res.status(500).json({ success: false, message: 'Server xatosi' }) }))
router.post('/retention/purge', verifyToken, requireSuperAdmin, (req, res) => Retention.run({ dryRun: req.body?.dryRun !== false }).then(r => res.status(r.success === false ? 409 : 200).json(r)).catch(e => { console.log(e); res.status(500).json({ success: false, message: 'Server xatosi' }) }))

// Ota-onalar Telegram boti: tokenni kiritish/ajratish va umumiy holat (faqat tizim egasi)
const Parents = require('../services/parent.service')
const handle = (fn) => async (req, res) => {
	try {
		const r = await fn(req)
		return res.status(r.success ? 200 : 400).json(r)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
}
router.get('/telegram', verifyToken, requireSuperAdmin, handle(() => Parents.platformStatus()))
router.put('/telegram', verifyToken, requireSuperAdmin, handle(req => Parents.connect(req.body?.token)))
router.delete('/telegram', verifyToken, requireSuperAdmin, handle(() => Parents.disconnect()))

// AI sozlamalari (odam sanash, telefon, ko'rish modeli): o'qish, saqlash, standartga qaytarish va mavjud modellar (faqat tizim egasi)
const AiSettings = require('../services/ai.settings.service')
router.get('/ai/models', verifyToken, requireSuperAdmin, handle(async (req) => ({ success: true, ...(await AiSettings.models(req.query.ollamaUrl)) })))
router.get('/ai', verifyToken, requireSuperAdmin, handle(async () => ({ success: true, settings: await AiSettings.get(true) })))
router.put('/ai', verifyToken, requireSuperAdmin, handle(req => AiSettings.save(req.body || {})))
router.delete('/ai', verifyToken, requireSuperAdmin, handle(() => AiSettings.reset()))

module.exports = router
