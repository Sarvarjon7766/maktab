const cameraModel = require('../models/camera.model')

const { pickFields } = require('../utils/safeInput')

// Mass-assignment himoyasi: schoolId, online, lastSeenAt va h.k. so'rovdan olinmaydi
const CAMERA_WRITABLE_FIELDS = ['name', 'user', 'password', 'cameraIp', 'port', 'rtspUrl', 'qayer', 'where', 'joy']

class CameraService {
	async create(data, schoolId) {
		try {
			const camera = await cameraModel.create({ ...pickFields(data, CAMERA_WRITABLE_FIELDS), schoolId })
			if (camera) {
				return { success: true, message: "Camera qo'shildi" }
			} else {
				return { success: false, message: "Camerani qo'shishda xatolik" }
			}
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server error" }
		}
	}
	async update(id, data, schoolId) {
		try {
			// findByIdAndUpdate emas — schoolId filtri bilan birga, boshqa
			// maktabning kamerasi id orqali taxmin qilib yangilanmasligi uchun
			const update = pickFields(data, CAMERA_WRITABLE_FIELDS)
			if (!update.password) delete update.password // bo'sh parol mavjud parolni o'chirib yubormasin
			const camera = await cameraModel.findOneAndUpdate({ _id: id, schoolId }, update, { new: true })
			if (camera) {
				return { success: true, message: "Camera yangilandi" }
			} else {
				return { success: false, message: "Camerani yangilashda xatolik" }
			}
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server error" }
		}
	}
	async deleted(id, schoolId) {
		try {
			await cameraModel.findOneAndDelete({ _id: id, schoolId })
			return { success: true, message: "Camera o'chirildi" }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server error" }
		}
	}
	async getAll(schoolId) {
		try {
			// Admin panelida kamera parolini ko'rish/nusxalash imkoniyati bor
			// (AdminCameras.jsx) — endi bu marshrut requireAdmin bilan
			// himoyalangani uchun xavfsiz
			const cameras = await cameraModel.find({ schoolId }).select('+password')
			if (cameras) {
				return { success: true, message: "Kameralar olindi", cameras }
			} else {
				return { success: false, message: "Kameralar topilmadi" }
			}
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server error" }
		}
	}

	// server_proxy ishga tushganda shu ro'yxatni oladi (config.json'dagi
	// statik "devices" o'rniga) — FAQAT o'z maktabiga tegishli kameralar.
	// Parollar bilan birga qaytariladi, shuning uchun bu endpoint
	// resolveSchoolProxyToken (maktabning o'z tokeni) bilan himoyalangan.
	async getDevices(schoolId) {
		try {
			const cameras = await cameraModel.find({ schoolId }).select('+password')
			const devices = cameras.map(c => ({
				ip: c.cameraIp,
				port: c.port || 80,
				username: c.user,
				password: c.password,
				qayer: c.qayer || '',
				where: c.where || '',
				joy: c.joy || '',
			}))
			return { success: true, devices }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server error", devices: [] }
		}
	}

	// server_proxy davriy heartbeat natijalarini shu yerga yozadi
	// (bir nechta kamera bo'lsa — har biri alohida-alohida)
	async updateStatus(statuses, schoolId) {
		if (!Array.isArray(statuses) || !statuses.length) {
			return { success: false, message: "statuses massivi kerak" }
		}
		try {
			await Promise.all(statuses.map(s =>
				cameraModel.updateMany(
					{ cameraIp: s.cameraIp, schoolId },
					{
						$set: {
							online: !!s.online,
							lastSeenAt: new Date(),
							lastStatusError: s.online ? null : (s.error || null)
						}
					}
				)
			))
			return { success: true, message: "Holat yangilandi" }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server error" }
		}
	}
}
module.exports = new CameraService()
