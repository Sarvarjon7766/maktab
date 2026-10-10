const platformSettingsModel = require('../models/platform.settings.model')

class PlatformSettingsService {
	// Singleton hujjatni qaytaradi — mavjud bo'lmasa, .env'dagi eski
	// qiymatlardan (yoki standart) bir marta yaratadi
	async getOrCreate() {
		let settings = await platformSettingsModel.findOne()
		if (!settings) {
			settings = await platformSettingsModel.create({
				platformName: process.env.PLATFORM_NAME || 'School Supervision',
				supportPhone: process.env.SUPPORT_PHONE || ''
			})
		}
		return settings
	}

	async get() {
		try {
			const settings = await this.getOrCreate()
			return { success: true, settings }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	async update(data) {
		try {
			const settings = await this.getOrCreate()
			if (data.platformName !== undefined) settings.platformName = data.platformName
			if (data.supportPhone !== undefined) settings.supportPhone = data.supportPhone
			await settings.save()
			return { success: true, settings }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}
}

module.exports = new PlatformSettingsService()
