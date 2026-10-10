const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const schoolModel = require('../models/school.model')
const userModel = require('../models/user.model')
const impersonationLogModel = require('../models/impersonation.log.model')
const bcrypt = require('bcrypt')
const studentModel = require('../models/student.model')
const attendanceModel = require('../models/attandance.model')
const studentAttendanceModel = require('../models/student.attandance.model')
const hikCameraModel = require('../models/hik.camera.model')
const cameraModel = require('../models/camera.model')
const sinfModel = require('../models/sinf.model')
const districtModel = require('../models/district.model')
const DistrictService = require('./district.service')
const geo = require('../utils/geo')

// server_proxy'ning har bir maktabi uchun bitta xom token — Authorization
// header'ida xom holda (Bearer prefiksisiz) yuboriladi, shu sabab
// generateApiToken()/hashApiToken() checkToken.js'dagi eski global
// INTERNAL_API_TOKEN bilan bir xil "xom string" shaklini saqlaydi
function generateApiToken() {
	return crypto.randomBytes(24).toString('base64url')
}

function hashApiToken(rawToken) {
	return crypto.createHash('sha256').update(rawToken).digest('hex')
}

function randomPassword() {
	return crypto.randomBytes(12).toString('base64url')
}

class SchoolService {
	// createdBy — School'ni yaratayotgan superadmin foydalanuvchi _id'si
	async create(data, createdBy) {
		try {
			const area = await this.areaFrom(data)
			if (area.error) return { success: false, message: area.error }
			const rawToken = generateApiToken()
			const school = new schoolModel({
				name: data.name,
				code: data.code,
				region: area.region,
				district: area.district,
				phone: data.phone || '',
				itCenter: data.itCenter || '',
				logoPath: data.logoPath || null,
				apiTokenHash: hashApiToken(rawToken),
				apiTokenPrefix: rawToken.slice(0, 8),
				apiTokenRotatedAt: new Date(),
				createdBy
			})
			await school.save()
			const schoolObj = school.toObject()
			delete schoolObj.apiTokenHash
			// DIQQAT: rawToken faqat shu javobda, BIR MARTA qaytariladi — DB'da
			// faqat xeshi saqlanadi, keyin hech qachon qayta ko'rsatib bo'lmaydi
			return { success: true, school: schoolObj, apiToken: rawToken }
		} catch (error) {
			if (error.code === 11000) {
				return { success: false, message: "Bu kod bilan maktab allaqachon mavjud" }
			}
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	async getAll() {
		try {
			const schools = await schoolModel.find().sort({ createdAt: -1 })
			return { success: true, schools }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	async getPlatformStats() {
		try {
			const dateString = new Intl.DateTimeFormat('en-CA', {
				timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit'
			}).format(new Date())
			const schools = await schoolModel.find().sort({ createdAt: -1 }).lean()
			const schoolIds = schools.map(school => school._id)
			const [staffTotals, studentTotals, staffPresent, studentPresent, schoolAdmins, classTotals, cameraStats, hikStats] = await Promise.all([
				userModel.aggregate([
					{ $match: { schoolId: { $in: schoolIds }, isActive: { $ne: false } } },
					{ $group: { _id: '$schoolId', total: { $sum: 1 } } }
				]),
				studentModel.aggregate([
					{ $match: { schoolId: { $in: schoolIds }, isActive: { $ne: false } } },
					{ $group: { _id: '$schoolId', total: { $sum: 1 } } }
				]),
				attendanceModel.aggregate([
					{ $match: { schoolId: { $in: schoolIds }, dateString, status: 'ishda' } },
					{ $group: { _id: '$schoolId', total: { $sum: 1 } } }
				]),
				studentAttendanceModel.aggregate([
					{ $match: { schoolId: { $in: schoolIds }, dateString, status: 'ishda' } },
					{ $group: { _id: '$schoolId', total: { $sum: 1 } } }
				]),
				userModel.aggregate([
					{ $match: { schoolId: { $in: schoolIds }, role: 'user', isActive: { $ne: false } } },
					{ $group: { _id: '$schoolId', total: { $sum: 1 } } }
				]),
				sinfModel.aggregate([
					{ $match: { schoolId: { $in: schoolIds } } },
					{ $group: { _id: '$schoolId', total: { $sum: 1 } } }
				]),
				cameraModel.aggregate([
					{ $match: { schoolId: { $in: schoolIds } } },
					{ $group: {
						_id: '$schoolId', total: { $sum: 1 },
						online: { $sum: { $cond: [{ $eq: ['$online', true] }, 1, 0] } },
						offline: { $sum: { $cond: [{ $eq: ['$online', false] }, 1, 0] } },
						unknown: { $sum: { $cond: [{ $eq: ['$online', null] }, 1, 0] } },
						lastSeenAt: { $max: '$lastSeenAt' }
					} }
				]),
				// Hik-Connect kameralari (bulutdagi): monitor.service bilan bir xil manba — ikkala turdagi kamera qo'shiladi
				hikCameraModel.aggregate([
					{ $match: { schoolId: { $in: schoolIds }, inCloud: true } },
					{ $group: {
						_id: '$schoolId', total: { $sum: 1 },
						online: { $sum: { $cond: [{ $eq: ['$online', true] }, 1, 0] } },
						offline: { $sum: { $cond: [{ $eq: ['$online', false] }, 1, 0] } },
						unknown: { $sum: { $cond: [{ $eq: ['$online', null] }, 1, 0] } },
						lastSeenAt: { $max: '$lastSeenAt' }
					} }
				])
			])
			const toMap = rows => new Map(rows.map(row => [String(row._id), row.total]))
			const staffTotalMap = toMap(staffTotals)
			const studentTotalMap = toMap(studentTotals)
			const staffPresentMap = toMap(staffPresent)
			const studentPresentMap = toMap(studentPresent)
			const adminMap = toMap(schoolAdmins)
			const classMap = toMap(classTotals)
			const cameraMap = new Map(cameraStats.map(row => [String(row._id), { total: row.total, online: row.online, offline: row.offline, unknown: row.unknown, lastSeenAt: row.lastSeenAt }]))
			for (const row of hikStats) {
				const k = String(row._id), c = cameraMap.get(k) || { total: 0, online: 0, offline: 0, unknown: 0, lastSeenAt: null }
				const seen = [c.lastSeenAt, row.lastSeenAt].filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null
				cameraMap.set(k, { total: c.total + row.total, online: c.online + row.online, offline: c.offline + row.offline, unknown: c.unknown + (row.unknown || 0), lastSeenAt: seen })
			}
			return {
				success: true,
				dateString,
				schools: schools.map(school => ({
					...school,
					stats: {
						staffTotal: staffTotalMap.get(String(school._id)) || 0,
						staffPresent: staffPresentMap.get(String(school._id)) || 0,
						studentTotal: studentTotalMap.get(String(school._id)) || 0,
						studentPresent: studentPresentMap.get(String(school._id)) || 0,
						adminTotal: adminMap.get(String(school._id)) || 0,
						classTotal: classMap.get(String(school._id)) || 0,
						cameraTotal: cameraMap.get(String(school._id))?.total || 0,
						cameraOnline: cameraMap.get(String(school._id))?.online || 0,
						cameraOffline: cameraMap.get(String(school._id))?.offline || 0,
						cameraUnknown: cameraMap.get(String(school._id))?.unknown || 0,
						cameraLastSeenAt: cameraMap.get(String(school._id))?.lastSeenAt || null
					}
				}))
			}
		} catch (error) {
			console.log(error)
			return { success: false, message: "Statistikani yuklashda xatolik" }
		}
	}

	// 'monitor' roli uchun — getPlatformStats'ning FAQAT o'qish uchun xavfsiz
	// (token prefiksi, createdBy kabi ichki maydonlarsiz) ko'rinishi
	async getMonitorOverview() {
		const result = await this.getPlatformStats()
		if (!result.success) return result
		return {
			success: true,
			dateString: result.dateString,
			schools: result.schools.map(({ _id, name, code, region, district, phone, isActive, stats }) => (
				{ _id, name, code, region, district, phone, isActive, stats }
			))
		}
	}

	async getById(id) {
		try {
			const school = await schoolModel.findById(id)
			if (!school) return { success: false, message: "Maktab topilmadi" }
			return { success: true, school }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	async update(id, data) {
		try {
			const allowed = ['name', 'region', 'district', 'phone', 'itCenter', 'logoPath']
			const payload = {}
			for (const key of allowed) {
				if (data[key] !== undefined) payload[key] = data[key]
			}
			if (data.districtId) {
				const area = await this.areaFrom(data)
				if (area.error) return { success: false, message: area.error }
				payload.region = area.region
				payload.district = area.district
			}
			const school = await schoolModel.findByIdAndUpdate(id, payload, { new: true })
			if (!school) return { success: false, message: "Maktab topilmadi" }
			return { success: true, school }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	// Viloyat/tuman: districtId berilsa ro'yxatdagi tumandan olinadi (yozuv xatosiz); aks holda matn sifatida qabul qilinadi
	async areaFrom(data) {
		if (data.districtId) {
			const d = await districtModel.findById(data.districtId).lean().catch(() => null)
			if (!d || d.isRegion) return { error: 'Tuman topilmadi' }
			return { region: d.region, district: d.name }
		}
		return { region: String(data.region || '').trim(), district: String(data.district || '').trim() }
	}

	// Maktab joylashuvi: o'quvchi/xodim bilan bog'liq emas, faqat xarita uchun
	async getLocation(schoolId) {
		const school = await schoolModel.findById(schoolId).select('name region district location').lean()
		if (!school) return { success: false, message: 'Maktab topilmadi' }
		const district = await DistrictService.forSchool(school)
		return {
			success: true, name: school.name, region: school.region, district: school.district, location: school.location?.lat != null ? school.location : null,
			districtBoundary: district?.geometry ? { type: 'Feature', properties: { name: district.name }, geometry: district.geometry } : null,
			center: district?.center || null
		}
	}

	async setLocation(schoolId, userId, { lat, lng, address }) {
		const la = Number(lat), lo = Number(lng)
		if (!Number.isFinite(la) || !Number.isFinite(lo)) return { success: false, message: 'Koordinatalar noto\'g\'ri' }
		if (la < 37 || la > 46 || lo < 55 || lo > 74) return { success: false, message: "Nuqta O'zbekiston hududidan tashqarida" }
		const school = await schoolModel.findById(schoolId)
		if (!school) return { success: false, message: 'Maktab topilmadi' }
		school.location = { lat: Math.round(la * 1e6) / 1e6, lng: Math.round(lo * 1e6) / 1e6, address: String(address || '').trim().slice(0, 200), updatedAt: new Date(), updatedBy: userId || null }
		await school.save()
		const district = await DistrictService.forSchool(school)
		// Nuqta maktab tumani chegarasidan tashqarida bo'lsa ogohlantiriladi (saqlanadi, lekin admin biladi)
		const outside = district?.geometry ? !geo.pointInGeometry(school.location.lng, school.location.lat, district.geometry) : null
		return { success: true, location: school.location, outsideDistrict: outside, district: district?.name || null }
	}

	async clearLocation(schoolId) {
		await schoolModel.updateOne({ _id: schoolId }, { $set: { location: { lat: null, lng: null, address: '', updatedAt: new Date(), updatedBy: null } } })
		return { success: true }
	}

	async toggleActive(id) {
		try {
			const school = await schoolModel.findById(id)
			if (!school) return { success: false, message: "Maktab topilmadi" }
			school.isActive = !school.isActive
			await school.save()
			return { success: true, school }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	async rotateToken(id) {
		try {
			const school = await schoolModel.findById(id)
			if (!school) return { success: false, message: "Maktab topilmadi" }
			const rawToken = generateApiToken()
			school.apiTokenHash = hashApiToken(rawToken)
			school.apiTokenPrefix = rawToken.slice(0, 8)
			school.apiTokenRotatedAt = new Date()
			await school.save()
			// Eski token shu zahoti ishlamay qoladi — school_proxy'ning
			// config.json'i yangi token bilan qo'lda yangilanishi kerak
			return { success: true, apiToken: rawToken, apiTokenPrefix: school.apiTokenPrefix }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	// Yangi maktabning birinchi maktab-admin ('user' roli) hisobini yaratadi.
	// `password` berilsa (superadmin o'zi tanlagan) shu ishlatiladi, aks
	// holda avtomatik generatsiya qilinadi — ikkala holatda ham xom parol
	// javobda BIR MARTA qaytariladi
	async bootstrapAdmin(schoolId, { username, fullName, password: customPassword }) {
		try {
			const school = await schoolModel.findById(schoolId)
			if (!school) return { success: false, message: "Maktab topilmadi" }

			const existing = await userModel.findOne({ username })
			if (existing) {
				return { success: false, message: "Bu login band — boshqa login tanlang" }
			}

			if (customPassword && customPassword.length < 6) {
				return { success: false, message: "Parol kamida 6 ta belgidan iborat bo'lishi kerak" }
			}

			const password = customPassword || randomPassword()
			const hashed = await bcrypt.hash(password, 10)
			const admin = new userModel({
				fullName: fullName || `${school.name} admini`,
				position: 'Maktab administratori',
				role: 'user',
				username,
				password: hashed,
				schoolId: school._id,
				isActive: true
			})
			await admin.save()
			admin.hodimID = admin._id.toString()
			await admin.save()

			return { success: true, username, password, userId: admin._id }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	// Maktab yaratilgan zahoti birinchi adminni yaratadi. Login ko'rsatilmasa
	// maktab kodidan olinadi ('<kod>-admin'); band bo'lsa raqam qo'shiladi
	async createDefaultAdmin(school, { username, password } = {}) {
		let login = (username || '').trim()
		if (!login) {
			const base = `${String(school.code).toLowerCase().replace(/[^a-z0-9_-]/g, '')}-admin`
			login = base
			for (let i = 2; await userModel.exists({ username: login }) && i < 100; i++) {
				login = `${base}${i}`
			}
		}
		return this.bootstrapAdmin(school._id, { username: login, password: (password || '').trim() || undefined })
	}

	// Superadmin biror maktabni "nazorat qilish" (view-as) uchun — o'sha
	// maktabning 'user'-rol adminiga tegishli JWT yaratadi, shu orqali
	// superadmin butun /user sahifalarini (xodim/o'quvchi/davomat/tabel)
	// o'zgarishsiz ko'ra oladi. Oddiy login tokenidan farqli — muddati
	// qisqaroq (2h) va audit uchun ImpersonationLog'ga yoziladi
	async impersonate(schoolId, superadmin) {
		try {
			const school = await schoolModel.findById(schoolId)
			if (!school) return { success: false, message: "Maktab topilmadi" }
			if (!school.isActive) return { success: false, message: "To'xtatilgan maktabga kirib bo'lmaydi" }

			const admin = await userModel.findOne({ schoolId: school._id, role: 'user' })
			if (!admin) {
				return { success: false, code: 'NO_ADMIN', message: "Bu maktabda hali admin hisobi yo'q — admin yarating, so'ng maktabga kirishingiz mumkin" }
			}

			const token = jwt.sign(
				{
					userId: admin._id,
					username: admin.username,
					role: admin.role,
					school: admin.schoolId,
					impersonatedBy: superadmin.userId
				},
				process.env.JWT_SECRET,
				{ expiresIn: '2h' }
			)

			await impersonationLogModel.create({
				school: school._id,
				superadmin: superadmin.userId,
				superadminUsername: superadmin.username,
				impersonatedUser: admin._id
			})

			return { success: true, token, role: admin.role, school: school.toObject() }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	// Superadmin uchun — bu maktabning bitta 'user'-rol admin hisobi
	// parolini yangi generatsiya qilingan parolga almashtiradi (bootstrapAdmin
	// faqat YANGI admin yaratadi — bu esa MAVJUD adminning parolini
	// unutilgan/yo'qolgan holatlarda tiklash uchun). adminId ANIQ
	// ko'rsatiladi (bir nechta admin bo'lishi mumkin — getSchoolAdmins
	// ro'yxatidan tanlanadi), shu bilan noto'g'ri hisobga tegib ketish
	// xavfi yo'q. Xom parol faqat shu javobda, bir marta qaytariladi.
	async resetAdminPassword(schoolId, adminId, customPassword) {
		try {
			const admin = await userModel.findOne({ _id: adminId, schoolId, role: 'user' })
			if (!admin) {
				return { success: false, message: "Admin hisobi topilmadi" }
			}
			if (customPassword && customPassword.length < 6) {
				return { success: false, message: "Parol kamida 6 ta belgidan iborat bo'lishi kerak" }
			}

			const password = customPassword || randomPassword()
			admin.password = await bcrypt.hash(password, 10)
			await admin.save()

			return { success: true, username: admin.username, password }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	// Platforma "Maktablar" sahifasidagi "Adminlar" oynasi uchun — shu
	// maktabning barcha 'user'-rol (eng yuqori darajadagi maktab admini)
	// hisoblari ro'yxati. Odatda bitta bo'ladi, lekin bootstrapAdmin bir
	// nechta marta chaqirilgan bo'lsa bir nechtasi bo'lishi mumkin
	async getSchoolAdmins(schoolId) {
		try {
			const admins = await userModel.find({ schoolId, role: 'user' })
				.select('fullName username isActive createdAt')
				.sort({ createdAt: 1 })
			return { success: true, admins }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	// DIQQAT: quyidagi metodlar sessiya tarixidan tiklanmagan — qayta yozilgan.
	// adminId ANIQ shu maktabning 'user'-rol admini bo'lishi shart
	async toggleSchoolAdminActive(schoolId, adminId) {
		try {
			const admin = await userModel.findOne({ _id: adminId, schoolId, role: 'user' })
			if (!admin) return { success: false, message: "Admin topilmadi" }
			admin.isActive = admin.isActive === false
			await admin.save()
			return { success: true, admin: { _id: admin._id, isActive: admin.isActive } }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	async deleteSchoolAdmin(schoolId, adminId) {
		try {
			const admin = await userModel.findOne({ _id: adminId, schoolId, role: 'user' })
			if (!admin) return { success: false, message: "Admin topilmadi" }
			await admin.deleteOne()
			return { success: true }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	async getImpersonationLogs() {
		try {
			const logs = await impersonationLogModel.find().sort({ createdAt: -1 }).limit(200).populate('school', 'name code')
			return { success: true, logs }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server xatosi" }
		}
	}

	// server_proxy'dan kelgan xom token bo'yicha faol maktabni topadi
	async findByRawToken(rawToken) {
		if (!rawToken) return null
		return schoolModel.findOne({ apiTokenHash: hashApiToken(String(rawToken).trim()), isActive: true })
	}
}

module.exports = new SchoolService()
