const express = require('express')
const { create, getAll, update } = require('../controllers/sinf.controller')
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const requireAdmin = requireRole('user', 'admin')
const router = express.Router()

router.post('/create', verifyToken, requireAdmin, create)
router.put('/update/:id', verifyToken, requireAdmin, update)
router.get('/getAll', verifyToken, getAll)

module.exports = router
