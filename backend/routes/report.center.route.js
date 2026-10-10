const express = require('express')
const verifyToken = require('../middlewares/verifyToken')
const requireRole = require('../middlewares/requireRole')
const ReportCenter = require('../services/report.center.service')
const router = express.Router()

// Hisobot markazi: katalog va Excel eksport (maktab har doim tokendan olinadi)
router.use(verifyToken, requireRole('user', 'admin'))

router.get('/catalog', (req, res) => res.json({ success: true, reports: ReportCenter.catalog() }))

router.get('/export/:key', async (req, res) => {
	try {
		const r = await ReportCenter.build(req.user.school, req.params.key, req.query, req.lang)
		if (!r.success) { const { status, ...body } = r; return res.status(status || 400).json(body) }
		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
		res.setHeader('Content-Disposition', `attachment; filename="${r.filename}"`)
		res.setHeader('X-Report-Rows', String(r.rows))
		res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Report-Rows')
		return res.end(Buffer.from(r.buffer))
	} catch (error) {
		console.error('Report export xatolik:', error)
		return res.status(500).json({ success: false, message: 'Hisobotni tayyorlashda xatolik' })
	}
})

module.exports = router
