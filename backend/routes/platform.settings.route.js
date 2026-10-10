const express = require('express')
const router = express.Router()
const { get, update } = require('../controllers/platform.settings.controller')
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')

const requireSuperAdmin = requireRole('superadmin')

router.get('/', verifyToken, requireSuperAdmin, get)
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

module.exports = router
