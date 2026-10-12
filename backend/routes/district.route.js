const express = require('express')
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const DistrictService = require('../services/district.service')
const router = express.Router()

// Tumanlarni boshqarish — faqat tizim egasi
router.use(verifyToken, requireRole('superadmin'))
const reply = (fn) => async (req, res) => {
	try {
		const result = await fn(req)
		return res.status(result.success ? 200 : 400).json(result)
	} catch (error) {
		console.error('Tuman xatosi:', error)
		return res.status(500).json({ success: false, message: 'Server xatosi' })
	}
}
router.get('/', reply(() => DistrictService.list()))
// Chegaralar kamdan-kam o'zgaradi (600 KB): brauzer 5 daqiqa keshlasin
router.get('/geo', (req, res, next) => { res.setHeader('Cache-Control', 'private, max-age=300'); next() }, reply(async () => ({ success: true, geojson: await DistrictService.features() })))
router.post('/import-bundled', reply(() => DistrictService.importBundled()))
router.post('/', reply(req => DistrictService.create(req.body || {})))
router.put('/:id', reply(req => DistrictService.update(req.params.id, req.body || {})))
router.delete('/:id', reply(req => DistrictService.remove(req.params.id)))

module.exports = router
