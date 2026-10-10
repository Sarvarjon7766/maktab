const express = require('express')
const { register, auth, getAll, getById, getUser, changePassword, update, getLavel, getUserId, ReOrder, userDelete, addUserAll, addUsersDelete, updateUserAll, updateUsersDelete, deleteUserAll, deleteUsersDelete, photoCamera, adminDelete,getAlladmin, importExcel } = require('../controllers/user.controller')
const { attendanceGetOne, UserEditTime, dashboardStats, dashboardAnalytics, liveFeed } = require('../controllers/attandance.controller')
const { logComment, LogStatistiks } = require('../controllers/attandance.log.controller')
const verifyToken = require('../middlewares/verifyToken')
const resolveSchoolProxyToken = require('../middlewares/resolveSchoolProxyToken')
const requireRole = require('../middlewares/requireRole')
const requireAdmin = requireRole('user', 'admin')
// Boshqa xodimning shaxsiy ma'lumotlari/to'liq davomat tarixini faqat
// boshqaruv (admin-darajadagi va rahbar) rollari ko'rishi kerak — oddiy
// xodim (viewer) boshqa birovning ma'lumotini
// so'ramasligi kerak (IDOR)
const requireManagement = requireRole('user', 'admin', 'leader')
// To'liq xodimlar ro'yxati (getAll) — bu shunchaki IDOR ro'yxati emas,
// balki 'viewer' rolining O'ZINING bosh sahifasi (UserAttandance.jsx)
// bugungi kelgan/ketgan/kelmagan holatini butun tashkilot bo'yicha shu
// endpoint orqali ko'rsatadi — shu sabab 'viewer' ham ruxsat etilgan
// rollar ro'yxatida bo'lishi SHART (avval bu yerdan olib tashlanganda
// "xodim" panelida "ma'lumot yuklashda xatolik" bug'i yuzaga kelgan edi).
// Haqiqiy nozik maydon (JSHR/PINFL) esa endpoint darajasida emas,
// user.service.js'dagi stripJshr() orqali requesterRole bo'yicha
// alohida yashiriladi — shu qatlam yetarli.
const requireStaff = requireRole('user', 'admin', 'leader', 'viewer')

const checkLoginToken = require('../middlewares/checklogintoken')
const upload = require('../middlewares/upload')
const uploadExcel = require('../middlewares/uploadExcel')
const deleteOldImage = require('../middlewares/deleteOldImage')
const router = express.Router()

router.post('/register', verifyToken, requireAdmin, upload.single('image'), register)
router.post('/import-excel', verifyToken, requireAdmin, uploadExcel.single('file'), importExcel)
router.put('/update/:id', verifyToken, requireAdmin, upload.single('image'), deleteOldImage, update)
router.post('/auth', auth)
router.get('/getUser', verifyToken, getUser)
router.put('/change-password', verifyToken, changePassword)
router.get('/getAll', verifyToken, requireStaff, getAll)
router.get('/getuserId', verifyToken, getUserId)
router.get('/getAlladmin', verifyToken, requireAdmin, getAlladmin)
router.get('/getById/:id', verifyToken, requireManagement, getById)
router.get('/getLavel', verifyToken, getLavel)
router.get('/verify-token', checkLoginToken)
router.get('/attandance/:id', verifyToken, requireManagement, attendanceGetOne)
router.get('/dashboard-stats', verifyToken, dashboardStats)
router.get('/dashboard-analytics', verifyToken, requireManagement, dashboardAnalytics)
router.get('/live-feed', verifyToken, requireManagement, liveFeed)
router.put('/comment/:id', verifyToken, logComment)
router.put('/reorder', verifyToken, requireAdmin, ReOrder)
router.put('/user-time/:employee_id', verifyToken, requireAdmin, UserEditTime)
router.get('/logstatistiks', verifyToken, requireManagement, LogStatistiks)
router.delete('/delete/:id', verifyToken, requireAdmin, userDelete)
router.delete('/delete-admin/:id', verifyToken, requireAdmin, adminDelete)

router.get('/adduser/getAll', resolveSchoolProxyToken, addUserAll)
router.get('/updateuser/getAll', resolveSchoolProxyToken, updateUserAll)
router.get('/deleteuser/getAll', resolveSchoolProxyToken, deleteUserAll)

router.post('/adduser/delete', resolveSchoolProxyToken, addUsersDelete)
router.post('/updateuser/delete', resolveSchoolProxyToken, updateUsersDelete)
router.post('/deleteuser/delete', resolveSchoolProxyToken, deleteUsersDelete)
router.post('/photocamera', resolveSchoolProxyToken, photoCamera)


module.exports = router

