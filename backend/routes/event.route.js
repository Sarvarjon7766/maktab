const express = require('express')
const router = express.Router()
const { checkInAttandance } = require('../controllers/attandance.controller')
const resolveSchoolProxyToken = require('../middlewares/resolveSchoolProxyToken')

router.post('/hik', resolveSchoolProxyToken, checkInAttandance)

module.exports = router

