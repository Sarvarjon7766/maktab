const express = require('express')
const router = express.Router()
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const MonitorUsers = require('../services/monitor.users.service')

// Monitor akkauntlarini boshqarish — FAQAT tizim egasi (superadmin)
router.use(verifyToken, requireRole('superadmin'))

const handle = (fn) => async (req, res) => {
	try {
		const result = await fn(req)
		return res.status(result.success ? 200 : 400).json(result)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
}

router.get('/areas', handle(() => MonitorUsers.areas()))
router.get('/', handle(() => MonitorUsers.list()))
router.post('/', handle(req => MonitorUsers.create(req.body || {})))
router.put('/:id', handle(req => MonitorUsers.update(req.params.id, req.body || {})))
router.delete('/:id', handle(req => MonitorUsers.remove(req.params.id)))

module.exports = router
