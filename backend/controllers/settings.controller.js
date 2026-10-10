const SettingsService = require('../services/settings.service')

class SettingsController {
	async get(req, res) {
		try {
			const result = await SettingsService.get(req.user.school)
			if (result.success) {
				return res.status(200).json(result)
			}
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async update(req, res) {
		try {
			if (req.user?.role !== 'user') {
				return res.status(403).json({ success: false, message: "Ruxsat yo'q — faqat super admin sozlashi mumkin" })
			}
			const result = await SettingsService.update(req.body, req.user.school)
			if (result.success) {
				return res.status(200).json(result)
			}
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}
}

module.exports = new SettingsController()
