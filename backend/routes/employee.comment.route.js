const express = require('express')
const verifyToken = require('../middlewares/verifyToken')
const ctrl = require('../controllers/employee.comment.controller')

const router = express.Router()

router.post('/',                       verifyToken, ctrl.create)
router.get('/map',                     verifyToken, ctrl.getMapForDate)
router.get('/employee/:userId',        verifyToken, ctrl.getByEmployee)
router.get('/active/:userId',          verifyToken, ctrl.getActiveForDate)
router.put('/:id/close',               verifyToken, ctrl.close)
router.put('/:id',                     verifyToken, ctrl.update)
router.delete('/:id',                  verifyToken, ctrl.remove)

module.exports = router

