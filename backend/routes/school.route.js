const express = require('express')
const router = express.Router()
const {
	create, getAll, getById, update, toggleActive, rotateToken, bootstrapAdmin,
	getSchoolAdmins, resetAdminPassword, toggleSchoolAdminActive, deleteSchoolAdmin,
	impersonate, getImpersonationLogs, getPlatformStats
} = require('../controllers/school.controller')
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')

// Platforma darajasidagi maktab boshqaruvi — faqat 'superadmin' roli
const requireSuperAdmin = requireRole('superadmin')

router.post('/create', verifyToken, requireSuperAdmin, create)
router.get('/getAll', verifyToken, requireSuperAdmin, getAll)
// `/:id` dan OLDIN: aks holda "platform-stats" maktab id'si deb o'qiladi
router.get('/platform-stats', verifyToken, requireSuperAdmin, getPlatformStats)
// DIQQAT: /impersonation-logs `/:id` dan OLDIN bo'lishi shart — aks holda
// Express uni "impersonation-logs" nomli maktab id'si deb noto'g'ri o'qiydi
router.get('/impersonation-logs', verifyToken, requireSuperAdmin, getImpersonationLogs)
router.get('/:id', verifyToken, requireSuperAdmin, getById)
router.put('/update/:id', verifyToken, requireSuperAdmin, update)
router.patch('/:id/toggle-active', verifyToken, requireSuperAdmin, toggleActive)
router.post('/:id/rotate-token', verifyToken, requireSuperAdmin, rotateToken)
router.post('/:id/bootstrap-admin', verifyToken, requireSuperAdmin, bootstrapAdmin)
router.get('/:id/admins', verifyToken, requireSuperAdmin, getSchoolAdmins)
router.post('/:id/admins/:adminId/reset-password', verifyToken, requireSuperAdmin, resetAdminPassword)
router.patch('/:id/admins/:adminId/toggle-active', verifyToken, requireSuperAdmin, toggleSchoolAdminActive)
router.delete('/:id/admins/:adminId', verifyToken, requireSuperAdmin, deleteSchoolAdmin)
router.post('/:id/impersonate', verifyToken, requireSuperAdmin, impersonate)

module.exports = router

