const express = require('express')
const router = express.Router()
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const Parents = require('../services/parent.service')

// Ota-onalar boti: maktab admini havola yaratadi, ro'yxatga olingan ota-onalarni va xabarlar jurnalini nazorat qiladi
const handle = (fn) => async (req, res) => {
	try {
		const r = await fn(req)
		return res.status(r.success ? 200 : 400).json(r)
	} catch (error) {
		console.log(error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
}
// 'user' va 'admin' — maktab admin darajasi; 'leader'/'viewer' (o'qituvchilar) na o'qiy, na o'zgartira oladi.
// O'zgartiruvchi marshrutlar alohida `write` guard bilan belgilangan: kelajakda o'qish ruxsati kengaytirilsa ham ular yopiq qoladi
const adminRoles = requireRole('user', 'admin')
const guard = [verifyToken, adminRoles] // o'qish
const write = [verifyToken, adminRoles] // o'zgartirish
const school = (req) => req.user.school

router.get('/overview', ...guard, handle(req => Parents.overview(school(req))))
router.post('/invite/school', ...write, handle(req => Parents.schoolInvite(school(req), req.user.userId, !!req.body?.rotate)))
router.post('/invite/student', ...write, handle(req => Parents.studentInvite(school(req), req.user.userId, req.body?.studentId)))
router.get('/students', ...guard, handle(req => Parents.students(school(req), req.query)))
router.get('/guardians', ...guard, handle(req => Parents.guardians(school(req), req.query)))
router.get('/parents', ...guard, handle(req => Parents.parents(school(req), req.query)))
router.get('/coverage', ...guard, handle(req => Parents.coverage(school(req))))
router.put('/parents/:chatId', ...write, handle(req => Parents.updateParent(school(req), req.params.chatId, req.body || {})))
router.delete('/parents/:chatId', ...write, handle(req => Parents.removeParent(school(req), req.params.chatId)))
router.post('/parents/:chatId/test', ...write, handle(req => Parents.testParent(school(req), req.params.chatId)))
router.post('/parents/:chatId/children', ...write, handle(req => Parents.addChild(school(req), req.params.chatId, req.body?.studentId)))
router.put('/guardians/:id', ...write, handle(req => Parents.updateGuardian(school(req), req.params.id, req.body || {})))
router.delete('/guardians/:id', ...write, handle(req => Parents.removeGuardian(school(req), req.params.id)))
router.post('/guardians/:id/test', ...write, handle(req => Parents.testGuardian(school(req), req.params.id)))
router.get('/requests', ...guard, handle(req => Parents.requests(school(req))))
router.post('/requests/:id/approve', ...write, handle(req => Parents.approveRequest(school(req), req.params.id, req.body?.studentIds || req.body?.studentId)))
router.post('/requests/:id/reject', ...write, handle(req => Parents.rejectRequest(school(req), req.params.id)))
router.get('/absence-reports', ...guard, handle(req => Parents.absenceReports(school(req), req.query)))
router.post('/absence-reports/:id/approve', ...write, handle(req => Parents.decideReport(school(req), req.user.userId, req.params.id, true)))
router.post('/absence-reports/:id/reject', ...write, handle(req => Parents.decideReport(school(req), req.user.userId, req.params.id, false)))
router.get('/delivery', ...guard, handle(async req => ({ success: true, delivery: await Parents.deliveryStats(school(req)) })))
router.get('/log', ...guard, handle(req => Parents.log(school(req), req.query)))
router.put('/settings', ...write, handle(req => Parents.saveSettings(school(req), req.body || {})))

module.exports = router

