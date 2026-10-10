const attandanceLogModel = require('../models/attandance.log.model')
const attandanceModel = require('../models/attandance.model')
const userModel = require('../models/user.model')
const employeeCommentModel = require('../models/employee.comment.model')
const dayjs = require("dayjs")
const utc = require("dayjs/plugin/utc")
const timezone = require("dayjs/plugin/timezone")
dayjs.extend(utc)
dayjs.extend(timezone)
const isSameOrBefore = require("dayjs/plugin/isSameOrBefore")
const isSameOrAfter = require("dayjs/plugin/isSameOrAfter")
dayjs.extend(isSameOrBefore)
dayjs.extend(isSameOrAfter)

class AttandanceLogService {
	async logComment(id, data, requesterId, requesterRole, schoolId) {
		try {
			// findById emas — boshqa maktabning logiga id orqali izoh
			// qoldirilmasligi uchun (admin-darajadagi rollar canEdit=true
			// bo'lgani uchun, schoolId filtrisiz istalgan maktab logini
			// tahrirlay olardi)
			const log = await attandanceLogModel.findOne({ _id: id, schoolId })
			if (!log) {
				return { success: false, message: "Kirish arxivi topilmadi" }
			}
			// Faqat o'ziga tegishli logga (viewer/leader) yoki admin-darajadagi
			// xodimlariga izoh qoldirishga ruxsat beriladi —
			// aks holda istalgan login qilgan xodim BOSHQA birovning
			// kirish-chiqish yozuviga izoh yozib/o'zgartirib qo'ya olardi
			const isOwner = log.user?.toString() === requesterId
			const canEdit = ['user', 'admin'].includes(requesterRole)
			if (!isOwner && !canEdit) {
				return { success: false, message: "Ruxsat yo'q" }
			}
			log.comment = data.comment
			await log.save()
			return { success: true, message: "Izoh saqlandi" }
		} catch (error) {
			console.error("logComment xatolik:", error)
			return { success: false, message: "Server xatosi" }
		}
	}
	async LogStatistiks({ startDate, endDate }, schoolId) {
		try {
			if (!startDate || !endDate) {
				return { success: false, message: "Boshlanish va tugash sanalari kerak" }
			}

			// Faqat haqiqiy xodimlar (viewer/leader), o'chirilmagan/faol —
			// admin/superadmin hisoblari va o'chirilgan xodimlar
			// hisobotga aralashib qolmasligi uchun
			const users = await userModel.find({
				role: { $in: ["viewer", "leader"] },
				isActive: { $ne: false },
				schoolId
			})
			const userIds = users.map(u => u._id)

			const logs = await attandanceLogModel.find({
				dateString: { $gte: startDate, $lte: endDate },
				user: { $in: userIds }
			}).populate("user", "fullName position")

			// Shu davrni qamrab oladigan (yoki qisman kesishadigan) barcha
			// xodim izohlarini (masalan mehnat ta'tili) BITTA so'rovda olamiz —
			// har bir xodim/kun uchun alohida so'rov o'rniga
			const comments = await employeeCommentModel.find({
				employee: { $in: userIds },
				startDate: { $lte: endDate },
				$or: [{ endDate: null }, { endDate: { $gte: startDate } }]
			}).lean()
			const commentsByUser = {}
			comments.forEach(c => {
				const uid = c.employee.toString()
				if (!commentsByUser[uid]) commentsByUser[uid] = []
				commentsByUser[uid].push(c)
			})
			const findLeave = (userId, dateString) => {
				const list = commentsByUser[userId.toString()] || []
				return list.find(c => c.startDate <= dateString && (!c.endDate || c.endDate >= dateString))
			}

			const stats = []

			for (const user of users) {
				// ⚙️ Faqat user mavjud bo'lgan loglarni olamiz
				const userLogs = logs.filter(l => l.user && l.user._id.toString() === user._id.toString())

				let dailyDetails = []
				let current = dayjs(startDate)

				while (current.isSameOrBefore(endDate)) {
					const currentDateString = current.format("YYYY-MM-DD")

					const dayLogs = userLogs.filter(l => l.dateString === currentDateString)

					let sessions = []
					dayLogs.forEach(l => {
						if (l.checkInTime && l.checkOutTime) {
							const durationMs = l.checkOutTime - l.checkInTime
							const durationH = (durationMs / (1000 * 60 * 60)).toFixed(2)
							sessions.push({
								checkIn: l.checkInTime,
								checkOut: l.checkOutTime,
								duration: durationH
							})
						} else if (l.checkInTime && !l.checkOutTime) {
							sessions.push({
								checkIn: l.checkInTime,
								checkOut: null,
								duration: null
							})
						}
					})

					const leave = findLeave(user._id, currentDateString)

					dailyDetails.push({
						date: currentDateString,
						sessions,
						leave: leave ? { type: leave.type, comment: leave.comment } : null
					})

					current = current.add(1, "day")
				}

				stats.push({
					userId: user._id,
					user: user.fullName,
					position: user.position || null,
					details: dailyDetails
				})
			}

			return { success: true, stats }
		} catch (err) {
			console.error(err)
			return { success: false, message: "Xatolik yuz berdi" }
		}
	}


}
module.exports = new AttandanceLogService()
