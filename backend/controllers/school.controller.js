const SchoolService = require('../services/school.service')
const HikService = require('../services/hikconnect.service')

class SchoolController {
	async create(req, res) {
		try {
			if (!req.body.name || !req.body.code) {
				return res.status(400).json({ success: false, message: "name va code majburiy" })
			}
			const result = await SchoolService.create(req.body, req.user?.userId)
			if (result.success) {
				// Maktabga darhol admin hisobi yaratiladi — aks holda "nazorat qilish"
				// (impersonate) admin topilmay xato beradi. Login berilmasa kod
				// asosida generatsiya qilinadi, xom parol javobda BIR MARTA qaytadi
				const adminResult = await SchoolService.createDefaultAdmin(result.school, {
					username: req.body.adminUsername,
					password: req.body.adminPassword
				})
				result.admin = adminResult.success
					? { username: adminResult.username, password: adminResult.password }
					: { error: adminResult.message }
				// Maktab kalitlari kiritilgan bo'lsa — shifrlab saqlaymiz va kameralarni darhol bulutdan olamiz
				const hik = req.body.hik
				if (hik?.appKey && hik?.secretKey) {
					const saved = await HikService.saveAccount({ ...hik, name: hik.name || result.school.name })
					result.hik = saved.success ? { ...(await HikService.sync(saved.accountId)), accountId: saved.accountId, existed: saved.existed } : saved
				}
				return res.status(201).json(result)
			}
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async getAll(req, res) {
		try {
			const result = await SchoolService.getAll()
			if (result.success) return res.status(200).json(result)
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async getPlatformStats(req, res) {
		try {
			const result = await SchoolService.getPlatformStats()
			if (result.success) return res.status(200).json(result)
			return res.status(500).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Statistikani yuklashda xatolik" })
		}
	}

	async getMonitorOverview(req, res) {
		try {
			const result = await SchoolService.getMonitorOverview()
			if (result.success) return res.status(200).json(result)
			return res.status(500).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Statistikani yuklashda xatolik" })
		}
	}

	async getById(req, res) {
		try {
			const result = await SchoolService.getById(req.params.id)
			if (result.success) return res.status(200).json(result)
			return res.status(404).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async update(req, res) {
		try {
			const result = await SchoolService.update(req.params.id, req.body)
			if (result.success) return res.status(200).json(result)
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async toggleActive(req, res) {
		try {
			const result = await SchoolService.toggleActive(req.params.id)
			if (result.success) return res.status(200).json(result)
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async rotateToken(req, res) {
		try {
			const result = await SchoolService.rotateToken(req.params.id)
			if (result.success) return res.status(200).json(result)
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async bootstrapAdmin(req, res) {
		try {
			if (!req.body.username) {
				return res.status(400).json({ success: false, message: "username majburiy" })
			}
			const result = await SchoolService.bootstrapAdmin(req.params.id, req.body)
			if (result.success) return res.status(201).json(result)
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async getSchoolAdmins(req, res) {
		try {
			const result = await SchoolService.getSchoolAdmins(req.params.id)
			if (result.success) return res.status(200).json(result)
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async resetAdminPassword(req, res) {
		try {
			const result = await SchoolService.resetAdminPassword(req.params.id, req.params.adminId, req.body?.password)
			if (result.success) return res.status(200).json(result)
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async toggleSchoolAdminActive(req, res) {
		try {
			const result = await SchoolService.toggleSchoolAdminActive(req.params.id, req.params.adminId)
			if (result.success) return res.status(200).json(result)
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async deleteSchoolAdmin(req, res) {
		try {
			const result = await SchoolService.deleteSchoolAdmin(req.params.id, req.params.adminId)
			if (result.success) return res.status(200).json(result)
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async impersonate(req, res) {
		try {
			const result = await SchoolService.impersonate(req.params.id, {
				userId: req.user.userId,
				username: req.user.username
			})
			if (result.success) return res.status(200).json(result)
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async getImpersonationLogs(req, res) {
		try {
			const result = await SchoolService.getImpersonationLogs()
			if (result.success) return res.status(200).json(result)
			return res.status(400).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	// GET /api/school/me — istalgan login qilgan foydalanuvchi o'z
	// maktabining branding ma'lumotini olishi uchun (superadmin uchun bo'sh)
	async me(req, res) {
		try {
			if (!req.user?.school) {
				return res.status(200).json({ success: true, school: null })
			}
			const result = await SchoolService.getById(req.user.school)
			if (result.success) return res.status(200).json(result)
			return res.status(404).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}
}

module.exports = new SchoolController()

