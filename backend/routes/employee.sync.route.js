const express = require('express')
const router = express.Router()
const { getPending, ack, getPendingDeletes, ackDelete } = require('../controllers/employee.sync.controller')
const resolveSchoolProxyToken = require('../middlewares/resolveSchoolProxyToken')

router.get('/pending', resolveSchoolProxyToken, getPending)
router.post('/ack', resolveSchoolProxyToken, ack)
router.get('/pending-deletes', resolveSchoolProxyToken, getPendingDeletes)
router.post('/delete-ack', resolveSchoolProxyToken, ackDelete)

module.exports = router
