const StudentService = require('../services/student.service')

class StudentController {
	async create(req, res) {
		try {
			const result = await StudentService.create(
				{ ...req.body, photo: req.file?.filename || null },
				req.user.userId,
				req.user.school
			)
			return res.status(result.success ? 201 : 400).json(result)
		} catch (error) {
			console.error("Student create controller xatosi:", error)
			return res.status(500).json({ success: false, message: "Server xatosi", error: error.message })
		}
	}

	async importExcel(req, res) {
		try {
			if (!req.file) {
				return res.status(400).json({ success: false, message: "Fayl yuborilmadi" })
			}
			const result = await StudentService.bulkImportFromExcel(req.file.buffer, req.user.userId, req.user.school)
			return res.status(result.success ? 200 : 400).json(result)
		} catch (error) {
			console.error("Student excel import xatosi:", error)
			return res.status(500).json({ success: false, message: "Server xatosi", error: error.message })
		}
	}

	async getAll(req, res) {
		try {
			const result = await StudentService.getAll(req.user.school, req.query.sinfId)
			return res.status(result.success ? 200 : 400).json(result)
		} catch (error) {
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async getById(req, res) {
		try {
			const result = await StudentService.getById(req.params.id, req.user.school)
			return res.status(result.success ? 200 : 404).json(result)
		} catch (error) {
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async update(req, res) {
		try {
			// photo HECH QACHON req.body'dan olinmaydi — faqat yuklangan fayldan
			const { photo: _ignoredPhoto, ...body } = req.body || {}
			const updateData = { ...body }
			if (req.file) updateData.photo = req.file.filename
			const result = await StudentService.update(req.params.id, updateData, req.user.school)
			return res.status(result.success ? 200 : 400).json(result)
		} catch (error) {
			console.error("Student update controller xatosi:", error)
			return res.status(500).json({ success: false, message: "Server xatosi", error: error.message })
		}
	}

	async resendToCamera(req, res) {
		try {
			const result = await StudentService.resendToCamera(req.user.school, { ids: req.body?.ids || [], all: !!req.body?.all })
			return res.status(result.success ? 200 : 400).json(result)
		} catch (error) {
			return res.status(500).json({ success: false, message: 'Server xatosi' })
		}
	}

	async remove(req, res) {
		try {
			const result = await StudentService.remove(req.params.id, req.user.school)
			return res.status(result.success ? 200 : 400).json(result)
		} catch (error) {
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}
}

module.exports = new StudentController()
