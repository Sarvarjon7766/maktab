const express = require('express')
const router = express.Router()
const { create, importExcel, getAll, getById, update, remove, resendToCamera } = require('../controllers/student.controller')
const { LogStatistiks, entryExitList, logComment, editTime } = require('../controllers/student.attandance.controller')
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const requireAdmin = requireRole('user', 'admin')
const requireManagement = requireRole('user', 'admin', 'leader')
const upload = require('../middlewares/upload')
const uploadExcel = require('../middlewares/uploadExcel')

router.post('/register', verifyToken, requireAdmin, upload.single('image'), create)
router.post('/import-excel', verifyToken, requireAdmin, uploadExcel.single('file'), importExcel)
router.get('/getAll', verifyToken, getAll)
router.get('/getById/:id', verifyToken, getById)
router.get('/logstatistiks', verifyToken, requireManagement, LogStatistiks)
router.get('/entry-exit', verifyToken, entryExitList)
router.put('/comment/:id', verifyToken, requireManagement, logComment)
router.put('/student-time/:studentIdNumber', verifyToken, requireAdmin, editTime)
// O'quvchilarning sababli kelmagan kunlari (sinf rahbari / maktab admini kiritadi)
const Excuse = require('../services/student.excuse.service')
const handle = (fn) => async (req, res) => {
	try {
		const r = await fn(req)
		return res.status(r.success ? 200 : 400).json(r)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
}
router.get('/excuse', verifyToken, requireManagement, handle(req => Excuse.forSinf(req.user.school, req.query.sinfId, req.query.date)))
router.get('/excuse/all', verifyToken, requireManagement, handle(req => Excuse.allForSchool(req.user.school)))
router.post('/excuse', verifyToken, requireManagement, handle(req => Excuse.create(req.user.school, req.user.userId, req.body || {})))
router.put('/excuse/:id/close', verifyToken, requireManagement, handle(req => Excuse.close(req.user.school, req.params.id)))
router.delete('/excuse/:id', verifyToken, requireManagement, handle(req => Excuse.remove(req.user.school, req.params.id)))

router.put('/update/:id', verifyToken, requireAdmin, upload.single('image'), update)
router.post('/camera-sync', verifyToken, requireAdmin, resendToCamera)
router.delete('/delete/:id', verifyToken, requireAdmin, remove)

module.exports = router
