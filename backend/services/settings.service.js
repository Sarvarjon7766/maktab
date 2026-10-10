const settingsModel = require('../models/settings.model')

class SettingsService {
	async get(schoolId) {
		try {
			let settings = await settingsModel.findOne({ schoolId })
			if (!settings) {
				settings = await settingsModel.create({ schoolId })
			}
			return { success: true, settings: settings.toObject() }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	async update(data, schoolId) {
		try {
			const { entryToExitCooldownSeconds, exitToEntryCooldownSeconds } = data

			let settings = await settingsModel.findOne({ schoolId })
			if (!settings) {
				settings = new settingsModel({ schoolId })
			}

			if (entryToExitCooldownSeconds !== undefined && entryToExitCooldownSeconds !== '') {
				settings.entryToExitCooldownSeconds = Math.max(0, Number(entryToExitCooldownSeconds))
			}
			if (exitToEntryCooldownSeconds !== undefined && exitToEntryCooldownSeconds !== '') {
				settings.exitToEntryCooldownSeconds = Math.max(0, Number(exitToEntryCooldownSeconds))
			}
			if (data.workStartTime && /^([01]\d|2[0-3]):([0-5]\d)$/.test(data.workStartTime)) {
				settings.workStartTime = data.workStartTime
			}

			await settings.save()
			return { success: true, message: "Sozlamalar saqlandi", settings: settings.toObject() }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}
}

module.exports = new SettingsService()
