const express = require('express')
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const GradeService = require('../services/grade.service')
const router = express.Router()

const handle = (fn, ok = 200) => async (req, res) => {
	try {
		const result = await fn(req)
		return res.status(result.success ? ok : 400).json(result)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
}

// Darajalar ro'yxatini hamma kirgan foydalanuvchi ko'ra oladi (maktab admini sinf yaratish uchun); o'zgartirish faqat tizim egasiga
router.get('/', verifyToken, handle(() => GradeService.list()))
router.post('/', verifyToken, requireRole('superadmin'), handle(req => GradeService.create(req.body), 201))
router.put('/:id', verifyToken, requireRole('superadmin'), handle(req => GradeService.update(req.params.id, req.body)))
router.delete('/:id', verifyToken, requireRole('superadmin'), handle(req => GradeService.remove(req.params.id)))

module.exports = router
