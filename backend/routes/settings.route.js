const express = require('express')
const router = express.Router()
const { get, update } = require('../controllers/settings.controller')
const verifyToken = require('../middlewares/verifyToken')

router.get('/', verifyToken, get)
router.put('/', verifyToken, update)

module.exports = router

