const StudentAttandanceService = require('../services/student.attandance.service')

class StudentAttandanceController {
	async LogStatistiks(req, res) {
		try {
			const result = await StudentAttandanceService.LogStatistiks(req.query, req.user.school)
			return res.status(result.success ? 200 : 400).json(result)
		} catch (error) {
			return res.status(500).json({ success: false, message: 'Server xatosi' })
		}
	}

	// AdminEntryExit.jsx'ning o'quvchi versiyasi uchun — bugungi kirish-
	// chiqish holati bilan birga o'quvchilar ro'yxati
	async entryExitList(req, res) {
		try {
			let sinfFilter = req.query.sinfId
			// Oddiy xodim (viewer) faqat o'zi sinf rahbari bo'lgan sinflar o'quvchilarini ko'radi
			if (req.user.role === 'viewer') {
				const headSinfIds = (await require('../models/sinf.model').find({ schoolId: req.user.school, head: req.user.userId }).select('_id').lean()).map(c => String(c._id))
				if (!headSinfIds.length) return res.status(200).json({ success: true, students: [] })
				sinfFilter = req.query.sinfId && headSinfIds.includes(String(req.query.sinfId)) ? req.query.sinfId : headSinfIds
			}
			const result = await StudentAttandanceService.getEntryExitList(req.user.school, sinfFilter)
			return res.status(result.success ? 200 : 400).json(result)
		} catch (error) {
			return res.status(500).json({ success: false, message: 'Server xatosi' })
		}
	}

	async logComment(req, res) {
		try {
			const result = await StudentAttandanceService.logComment(req.params.id, req.body.comment, req.user.school)
			return res.status(result.success ? 200 : 400).json(result)
		} catch (error) {
			return res.status(500).json({ success: false, message: 'Server xatosi' })
		}
	}

	// Admin qo'lda vaqt kiritadi (kamera hodisasi emas) — bu JWT yo'li,
	// schoolId req.user.school'dan. attandance.controller.js'dagi
	// UserEditTime bilan bir xil naqsh.
	async editTime(req, res) {
		try {
			const { studentIdNumber } = req.params
			const { type, qayer } = req.body
			if (!["entry", "exit"].includes(type)) {
				return res.status(400).json({
					success: false,
					message: "Noto'g'ri type kiritildi. 'entry' yoki 'exit' bo'lishi kerak."
				})
			}
			const where = type === "exit" ? "1" : "2"
			const result = await StudentAttandanceService.checkInAttendance(
				{ qayer, where, employee_id: studentIdNumber },
				req.user.school
			)
			if (result.success) {
				return res.status(200).json({
					success: true,
					message: type === "entry" ? "O'quvchi qo'lda kiritildi" : "O'quvchi qo'lda chiqarildi",
					data: result
				})
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.error("Student editTime error:", error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}
}

module.exports = new StudentAttandanceController()
