const AttandanceService = require('../services/attandance.service')
const AttandanceLogService = require('../services/attandance.log.service')

class AttandanceLogController {
	async logComment(req, res) {
		try {
			const result = await AttandanceLogService.logComment(req.params.id, req.body, req.user.userId, req.user.role, req.user.school)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			return res.status(500).json({ success: false, message: 'Server xatosi' })
		}
	}
	async LogStatistiks(req, res) {
		try {
			const result = await AttandanceLogService.LogStatistiks(req.query, req.user.school)

			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			return res.status(500).json({ success: false, message: 'Server xatosi' })
		}
	}

}

module.exports = new AttandanceLogController()
