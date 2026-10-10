const path = require('path')
const adduserModel = require('../models/add.user.model')
const deleteUserModel = require('../models/delete.user.model')
const userModel = require('../models/user.model')
const studentModel = require('../models/student.model')

class EmployeeSyncService {
	async getPending(schoolId) {
		const entries = await adduserModel.find({ schoolId })
		const baseUrl = process.env.CAMERA_PHOTO_URL || ''

		return entries
			.filter(entry => entry.hodimID && entry.photo)
			.map(entry => ({
				employee_id: entry.hodimID,
				name: entry.full_name,
				photo_url: baseUrl + path.basename(entry.photo)
			}))
	}

	async ack(employeeId, success, error, deviceResults, schoolId) {
		if (!employeeId) {
			return { success: false, message: "employee_id kerak" }
		}

		// Har bir kamera bo'yicha alohida natijani mavjud ro'yxatga
		// birlashtiramiz (bir xil device qayta kelsa — yangilanadi, yangi
		// device bo'lsa — qo'shiladi). Shu bilan bir nechta kamera
		// bo'lganda har birining holati alohida ko'rinadi.
		if (Array.isArray(deviceResults) && deviceResults.length) {
			const entry = await adduserModel.findOne({ hodimID: employeeId, schoolId })
			if (entry) {
				const merged = [...entry.deviceResults]
				for (const r of deviceResults) {
					if (!r || !r.device) continue
					const idx = merged.findIndex(m => m.device === r.device)
					const updated = { device: r.device, success: !!r.success, error: r.error || null, attemptedAt: new Date() }
					if (idx >= 0) merged[idx] = updated
					else merged.push(updated)
				}
				entry.deviceResults = merged
				await entry.save()
			}
		}

		if (!success) {
			// Kameraga yuborish muvaffaqiyatsiz bo'lgan — navbatda qoldiramiz,
			// keyingi so'rovda qayta urinib ko'riladi. Sababini yozib qo'yamiz,
			// shunda admin panelida xodim qatoridagi qizil kamera belgisini
			// bosganda/hover qilganda aniq sabab ko'rinadi.
			await adduserModel.updateMany(
				{ hodimID: employeeId, schoolId },
				{
					$set: { lastError: error || "Noma'lum xatolik", lastAttemptAt: new Date() },
					$inc: { attempts: 1 }
				}
			)
			return { success: true, message: "Xatolik qayd etildi, keyingi urinishda qayta yuboriladi" }
		}

		await adduserModel.deleteMany({ hodimID: employeeId, schoolId })
		await userModel.updateMany({ hodimID: employeeId, schoolId }, { $set: { photo_camera: true } })
		// O'quvchining kamera identifikatori = studentIdNumber (o'z _id'si), xuddi xodimning hodimID'si kabi
		await studentModel.updateMany({ studentIdNumber: employeeId, schoolId }, { $set: { photo_camera: true } })

		return { success: true, message: "Xodim kameraga yuborilgan deb belgilandi" }
	}

	async getPendingDeletes(schoolId) {
		const entries = await deleteUserModel.find({ schoolId })

		return entries
			.filter(entry => entry.hodimID)
			.map(entry => ({
				employee_id: entry.hodimID,
				name: entry.full_name
			}))
	}

	async ackDelete(employeeId, success, schoolId) {
		if (!employeeId) {
			return { success: false, message: "employee_id kerak" }
		}

		if (!success) {
			// Kameradan o'chirish muvaffaqiyatsiz bo'lgan — navbatda qoldiramiz,
			// keyingi so'rovda qayta urinib ko'riladi
			return { success: true, message: "Xatolik qayd etildi, keyingi urinishda qayta o'chiriladi" }
		}

		await deleteUserModel.deleteMany({ hodimID: employeeId, schoolId })

		return { success: true, message: "Xodim kameradan o'chirilgan deb belgilandi" }
	}
}

module.exports = new EmployeeSyncService()
