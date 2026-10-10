const AttandanceService = require('../services/attandance.service')
const StudentAttandanceService = require('../services/student.attandance.service')
class AttandanceController {
	async attendanceGetOne(req, res) {
		try {
			const { id } = req.params
			if (!id) {
				return res.status(400).json({ success: false, message: 'Foydalanuvchi ID berilmagan' })
			}
			const { from, to } = req.query
			const result = await AttandanceService.attendanceGetOne(id, req.user.school, from, to)

			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(404).json(result)
			}
		} catch (error) {
			console.error('attendanceGetOne controller error:', error)
			return res.status(500).json({ success: false, message: 'Server xatosi' })
		}
	}

	// server_proxy'dan (resolveSchoolProxyToken orqali) — schoolId req.school'dan olinadi.
	// Avval XODIM (hodimID) sifatida qidiradi; topilmasa O'QUVCHI
	// (studentIdNumber) sifatida — bitta kamera ikkalasini ham tanishi mumkin.
	async checkInAttandance(req, res) {
		try {
			let result = await AttandanceService.checkInAttendance(req.body, req.school?._id)

			if (result.message === "Foydalanuvchi topilmadi") {
				result = await StudentAttandanceService.checkInAttendance(req.body, req.school?._id)
			}

			if (result.success) {
				return res.status(200).json(result)
			} else if (result.message === "Foydalanuvchi topilmadi" || result.message === "O'quvchi topilmadi") {
				// Xodim ham, o'quvchi ham bazada yo'q — bu xato emas, oddiy
				// "topilmadi" holati (server_proxy buni qayta urinish kerak
				// bo'lmagan holat deb tushunishi uchun 404)
				return res.status(404).json(result)
			} else {
				return res.status(400).json(result)
			}

		} catch (error) {
			console.error('Controller checkInAttandance error:', error)
			return res.status(500).json({
				success: false,
				message: "Server xatosi",
				error: error.message
			})
		}
	}
	async dashboardStats(req, res) {
		try {
			const result = await AttandanceService.getDashboardStats(req.user.school)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.error('dashboardStats controller error:', error)
			return res.status(500).json({ success: false, message: 'Server xatosi' })
		}
	}
	async dashboardAnalytics(req, res) {
		try {
			const { range } = req.query
			const result = await AttandanceService.getDashboardAnalytics({ range }, req.user.school)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.error('dashboardAnalytics controller error:', error)
			return res.status(500).json({ success: false, message: 'Server xatosi' })
		}
	}
	async liveFeed(req, res) {
		try {
			const { limit } = req.query
			const result = await AttandanceService.getLiveFeed({ limit }, req.user.school)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.error('liveFeed controller error:', error)
			return res.status(500).json({ success: false, message: 'Server xatosi' })
		}
	}
	// Admin qo'lda vaqt kiritadi — bu JWT yo'li, schoolId req.user.school'dan
	async UserEditTime(req, res) {
		try {
			const { employee_id } = req.params
			const { type, qayer } = req.body
			if (!["entry", "exit"].includes(type)) {
				return res.status(400).json({
					success: false,
					message: "Noto‘g‘ri type kiritildi. 'entry' yoki 'exit' bo‘lishi kerak."
				})
			}
			const where = type === "exit" ? "1" : "2"
			const attendancePayload = {
				qayer,
				where,
				employee_id
			}
			const result = await AttandanceService.checkInAttendance(attendancePayload, req.user.school)
			if (result.success) {
				return res.status(200).json({
					success: true,
					message: type === "entry" ? "Kirish qo‘lda qo‘shildi" : "Chiqish qo‘lda qo‘shildi",
					data: result
				})
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.error("UserEditTime error:", error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}
}


module.exports = new AttandanceController()

