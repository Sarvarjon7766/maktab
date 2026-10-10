const userService = require('../services/user.service')
const UserService = require('../services/user.service')
const path = require('path')
const fs = require('fs').promises
const { resolveUploadPath } = require('../utils/safeInput')

// Yangilash MUVAFFAQIYATLI bo'lgandan keyin (deleteOldImage middleware
// oldindan aniqlab qo'ygan) eski rasmni o'chiradi — shu tartibda validatsiya
// xatosida rasm qaytarib bo'lmas tarzda yo'qolmaydi
async function removeOldImageIfAny(oldImagePath) {
	if (!oldImagePath) return
	// faqat uploads papkasi ichidagi fayl o'chiriladi
	const safePath = resolveUploadPath(path.basename(String(oldImagePath)))
	if (!safePath) return
	try {
		await fs.access(safePath)
		await fs.unlink(safePath)
	} catch (err) {
		console.warn(`Eski rasm topilmadi yoki o'chirib bo'lmadi: ${safePath}`)
	}
}


class UserController {
	async register(req, res) {
		try {
			const { username, password } = req.body
			if (!username || !password) {
				return res.status(400).json({
					success: false,
					message: "Barcha majburiy maydonlarni to'ldiring"
				})
			}

			const user = await UserService.register(
				{ ...req.body, photo: req.file?.filename || null, faceDetection: null },
				req.user.userId,
				req.user.role,
				req.user.school
			)

			if (user.success) {
				return res.status(201).json(user)
			} else {
				return res.status(400).json(user)
			}
		} catch (error) {
			console.error("Register controller xatosi:", error)
			return res.status(500).json({
				success: false,
				message: "Server xatosi",
				error: error.message
			})
		}
	}
	async importExcel(req, res) {
		try {
			if (!req.file) {
				return res.status(400).json({ success: false, message: "Fayl yuborilmadi" })
			}
			const result = await UserService.bulkImportFromExcel(req.file.buffer, req.user.userId, req.user.school)
			return res.status(result.success ? 200 : 400).json(result)
		} catch (error) {
			console.error("Excel import xatosi:", error)
			return res.status(500).json({
				success: false,
				message: "Server xatosi",
				error: error.message
			})
		}
	}
	async update(req, res) {
		try {
			// photo HECH QACHON req.body'dan olinmaydi — faqat yuklangan fayldan
			const { photo: _ignoredPhoto, ...body } = req.body || {}
			const updateData = { ...body, faceDetection: null }
			if (req.file) {
				updateData.photo = req.file.filename
			}

			const result = await UserService.update(req.params.id, updateData, req.user.role, req.user.school)
			if (result.success) {
				await removeOldImageIfAny(req.oldImagePath)
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.error("Register controller xatosi:", error)
			return res.status(500).json({
				success: false,
				message: "Server xatosi",
				error: error.message
			})
		}
	}
	async auth(req, res) {
		try {
			const result = await userService.auth(req.body, req.ip)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				const { status, ...payload } = result
				return res.status(status || 400).json(payload)
			}
		} catch (error) {
			return res.status(500).json({
				success: false,
				message: "Server xatosi"
			})
		}
	}
	async getUser(req, res) {
		try {
			const result = await userService.getUser(req.user)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			return res.status(500).json({
				success: false,
				message: "Server xatosi"
			})
		}
	}
	async getAll(req, res) {
		try {
			const { date } = req.query
			const result = await userService.getAll(req.user?.role, req.user?.school, date)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			return res.status(500).json({
				success: false,
				message: "Server xatosi"
			})
		}
	}
	async changePassword(req, res) {
		try {
			const result = await userService.changePassword(req.user, req.body?.currentPassword, req.body?.newPassword)
			return res.status(result.success ? 200 : 400).json(result)
		} catch (error) {
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async getUserId(req, res) {
		try {
			if (req.user && req.user.userId) {
				return res.status(200).json({ success: true, userId: req.user.userId })
			} else {
				return res.status(400).json({ success: false, userId: null })
			}
		} catch (error) {
			return res.status(500).json({
				success: false,
				message: "Server xatosi"
			})
		}
	}
	async getAlladmin(req, res) {
		try {
			const result = await userService.getAlladmin(req.user?.role, req.user?.school)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			return res.status(500).json({
				success: false,
				message: "Server xatosi"
			})
		}
	}
	async getById(req, res) {
		try {
			const result = await userService.getById(req.params.id, req.user?.role, req.user?.school)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			return res.status(500).json({
				success: false,
				message: "Server xatosi"
			})
		}
	}
	async getLavel(req, res) {
		try {
			const result = await userService.getLavel(req.user?.school)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			return res.status(500).json({
				success: false,
				message: "Server xatosi"
			})
		}
	}
	async ReOrder(req, res) {
		try {
			const result = await userService.ReOrder(req.body, req.user?.school)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			return res.status(500).json({
				success: false,
				message: "Server xatosi"
			})
		}
	}
	async userDelete(req, res) {
		try {
			const result = await userService.userDelete(req.params.id, req.user?.school, req.user?.role)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			return res.status(500).json({
				success: false,
				message: "Server xatosi"
			})
		}
	}
	async adminDelete(req, res) {
		try {
			const result = await userService.adminDelete(req.params.id, req.user?.school, req.user?.role)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			return res.status(500).json({
				success: false,
				message: "Server xatosi"
			})
		}
	}

	async addUserAll(req, res) {
		try {
			const result = await UserService.addUserAll(req.school._id)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server error" })
		}
	}
	async addUsersDelete(req, res) {
		try {
			const result = await UserService.addUsersDelete(req.body.users, req.school._id)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server error" })
		}
	}

	async updateUserAll(req, res) {
		try {
			const result = await UserService.updateUserAll(req.school._id)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server error" })
		}
	}
	async updateUsersDelete(req, res) {
		try {
			const result = await UserService.updateUsersDelete(req.body.users, req.school._id)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server error" })
		}
	}

	async deleteUserAll(req, res) {
		try {
			const result = await UserService.deleteUserAll(req.school._id)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server error" })
		}
	}
	async deleteUsersDelete(req, res) {
		try {
			const result = await UserService.deleteUsersDelete(req.body.users, req.school._id)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server error" })
		}
	}

	async photoCamera(req, res) {
		try {
			const result = await userService.photoCamera(req.body.hodimID, req.body.photo_camera, req.school._id)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server error" })
		}
	}




}
module.exports = new UserController()

