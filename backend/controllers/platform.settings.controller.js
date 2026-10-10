const PlatformSettingsService = require('../services/platform.settings.service')

class PlatformSettingsController {
	async get(req, res) {
		try {
			const result = await PlatformSettingsService.get()
			if (result.success) return res.status(200).json(result)
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async update(req, res) {
		try {
			const result = await PlatformSettingsService.update(req.body)
			if (result.success) return res.status(200).json(result)
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}
}

module.exports = new PlatformSettingsController()
