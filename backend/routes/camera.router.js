const express = require('express')
const { create, update, deleted, getAll, getDevices, updateStatus } = require('../controllers/camera.controller')
const router = express.Router()
const { autoLoginCamera } = require('../controllers/autologin.controller')
const verifyToken = require('../middlewares/verifyToken')
const resolveSchoolProxyToken = require('../middlewares/resolveSchoolProxyToken')
const requireRole = require('../middlewares/requireRole')
const requireAdmin = requireRole('user', 'admin')

router.post('/create', verifyToken, requireAdmin, create)
router.put('/update/:id', verifyToken, requireAdmin, update)
router.delete('/delete/:id', verifyToken, requireAdmin, deleted)
router.get('/getAll', verifyToken, requireAdmin, getAll)
router.post("/auto-login", verifyToken, requireAdmin, autoLoginCamera)

// server_proxy uchun — parollar bilan birga qaytaradi, shuning uchun
// foydalanuvchi JWT emas, o'sha maktabning o'z proxy tokeni bilan himoyalangan
router.get('/devices', resolveSchoolProxyToken, getDevices)
router.post('/status', resolveSchoolProxyToken, updateStatus)

module.exports = router
