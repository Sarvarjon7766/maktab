const express = require('express')
const router = express.Router()
const { me } = require('../controllers/school.controller')
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const SchoolService = require('../services/school.service')

// Istalgan login qilgan foydalanuvchi (superadmin bundan mustasno) o'z
// maktabining branding ma'lumotini (nomi/logotipi) olishi uchun — login-
// keyingi OrgContext shu endpoint'ga murojaat qiladi
router.get('/me', verifyToken, me)

// Maktab joylashuvi: maktab admini o'z maktabi uchun xaritadan belgilaydi
const adminOnly = requireRole('user', 'admin')
const reply = (fn) => async (req, res) => {
	try {
		const result = await fn(req)
		return res.status(result.success ? 200 : 400).json(result)
	} catch (error) {
		console.error('Maktab joylashuvi xatosi:', error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
}
router.get('/me/location', verifyToken, adminOnly, reply(req => SchoolService.getLocation(req.user.school)))
// Google Maps havolasi (yoki koordinata matni) -> lat/lng
router.post('/me/location/parse', verifyToken, adminOnly, reply(req => require('../utils/mapsLink').locate(req.body?.input)))
router.put('/me/location', verifyToken, adminOnly, reply(req => SchoolService.setLocation(req.user.school, req.user.userId, req.body || {})))
router.delete('/me/location', verifyToken, adminOnly, reply(req => SchoolService.clearLocation(req.user.school)))

module.exports = router
