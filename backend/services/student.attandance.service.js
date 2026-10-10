const studentAttendanceLogModel = require('../models/student.attandance.log.model')
const studentAttendanceModel = require('../models/student.attandance.model')
const studentModel = require('../models/student.model')
const settingsModel = require('../models/settings.model')
const sinfModel = require('../models/sinf.model')

const dayjs = require("dayjs")
const utc = require("dayjs/plugin/utc")
const tz = require("dayjs/plugin/timezone")
dayjs.extend(utc)
dayjs.extend(tz)

// attandance.service.js'dagi checkInAttendance bilan bir xil cooldown/dedup
// mantiq — ATAYLAB nusxa ko'chirilgan (umumiy funksiya emas), chunki xodim
// va o'quvchi davomati mustaqil rivojlanishi kerak (masalan kelajakda faqat
// birida o'zgarish kerak bo'lsa, ikkinchisiga tasodifan ta'sir qilmasligi uchun)
class StudentAttandanceService {
	async checkInAttendance(data, schoolId) {
		try {
			if (!schoolId) {
				return { success: false, message: "Maktab aniqlanmadi" }
			}
			if (!data.employee_id) {
				return { success: false, message: "employee_id kerak" }
			}
			let qayer = null
			if (data.qayer !== undefined && data.qayer !== null && data.qayer !== '') {
				qayer = Number(data.qayer)
				if (Number.isNaN(qayer)) {
					return { success: false, message: "qayer maydoni noto'g'ri" }
				}
			}

			const now = new Date()
			let eventTime = now
			if (data.camera_time) {
				const cameraTime = new Date(data.camera_time)
				const driftMs = Math.abs(cameraTime.getTime() - now.getTime())
				if (!Number.isNaN(cameraTime.getTime()) && driftMs <= 10 * 60 * 1000) {
					eventTime = cameraTime
				}
			}
			const dateString = dayjs(eventTime).tz("Asia/Tashkent").format("YYYY-MM-DD")
			const isEntering = Number(data.where) === 2

			const student = await studentModel.findOne({ studentIdNumber: data.employee_id, schoolId })
			if (!student) return { success: false, message: "O'quvchi topilmadi" }

			const settings = await settingsModel.findOne({ schoolId })
			const entryToExitCooldown = settings?.entryToExitCooldownSeconds ?? 15
			const exitToEntryCooldown = settings?.exitToEntryCooldownSeconds ?? 5

			const lastLog = await studentAttendanceLogModel.findOne({ student: student._id }).sort({ date: -1 })
			if (lastLog) {
				if (!lastLog.checkout) {
					if (!isEntering) {
						const diffSeconds = (eventTime - lastLog.checkInTime) / 1000
						if (diffSeconds < entryToExitCooldown) {
							return { success: false, message: `Chiqish uchun kirishdan keyin kamida ${entryToExitCooldown} soniya kuting` }
						}
					}
				} else {
					if (isEntering) {
						const diffSeconds = (eventTime - lastLog.checkOutTime) / 1000
						if (diffSeconds < exitToEntryCooldown) {
							return { success: false, message: `Kirish uchun chiqishdan keyin kamida ${exitToEntryCooldown} soniya kuting` }
						}
					}
				}
			}

			let attendance = await studentAttendanceModel.findOne({
				student: student._id,
				dateString: dateString
			})

			if (isEntering) {
				if (attendance && attendance.status === 'ishda') {
					return { success: false, message: "O'quvchi hali chiqmagan" }
				}
				try {
					attendance = await studentAttendanceModel.findOneAndUpdate(
						{ student: student._id, dateString, status: { $ne: 'ishda' } },
						{
							$set: { status: 'ishda', date: eventTime, schoolId },
							$inc: { totalEntries: 1 },
							$setOnInsert: { totalTime: '0:00' }
						},
						{ new: true, upsert: true }
					)
				} catch (err) {
					if (err.code === 11000) {
						return { success: false, message: "O'quvchi hali chiqmagan" }
					}
					throw err
				}
				await studentAttendanceLogModel.create({
					schoolId,
					student: student._id,
					date: eventTime,
					dateString,
					checkin: true,
					checkout: false,
					checkInTime: eventTime
				})
			} else {
				let openAttendance = attendance
				if (!openAttendance || openAttendance.status !== 'ishda') {
					openAttendance = await studentAttendanceModel.findOne({
						student: student._id,
						status: 'ishda'
					}).sort({ date: -1 })
				}
				if (!openAttendance) {
					return { success: false, message: "Kirish topilmadi" }
				}

				const openLog = await studentAttendanceLogModel.findOneAndUpdate(
					{ student: student._id, checkin: true, checkout: false },
					{ $set: { checkout: true, checkOutTime: eventTime } },
					{ sort: { date: -1 }, new: true }
				)
				if (!openLog) return { success: false, message: "Kirish logi topilmadi" }

				const workMs = openLog.checkOutTime - openLog.checkInTime
				const prevParts = openAttendance.totalTime.split(":").map(Number)
				const prevMinutes = prevParts[0] * 60 + prevParts[1]
				const totalMinutes = prevMinutes + Math.floor(workMs / 60000)
				const hours = Math.floor(totalMinutes / 60)
				const minutes = totalMinutes % 60
				openAttendance.status = 'tashqarida'
				openAttendance.totalTime = `${hours}:${minutes.toString().padStart(2, '0')}`
				await openAttendance.save()
			}

			// Ota-onalarga Telegram xabari (fonda; xato bo'lsa davomatga ta'sir qilmaydi)
			try { require('./parent.service').notifyStudentEvent({ schoolId, studentId: student._id, kind: isEntering ? 'in' : 'out', time: eventTime }) } catch (e) { console.error('Ota-onaga xabar:', e.message) }

			return { success: true, message: isEntering ? "Kirish qayd etildi" : "Chiqish qayd etildi" }
		} catch (error) {
			console.error('Create student attendance error:', error)
			return { success: false, message: "Server error", error: error.message }
		}
	}

	// attandance.log.service.js'dagi logComment bilan bir xil — o'quvchida
	// "isOwner" tushunchasi yo'q (o'quvchi tizimga o'zi kirmaydi), shuning
	// uchun faqat admin-darajadagi rollar izoh qoldira oladi
	async logComment(id, comment, schoolId) {
		try {
			const log = await studentAttendanceLogModel.findOne({ _id: id, schoolId })
			if (!log) {
				return { success: false, message: "Kirish arxivi topilmadi" }
			}
			log.comment = comment
			await log.save()
			return { success: true, message: "Izoh saqlandi" }
		} catch (error) {
			console.error("Student logComment xatolik:", error)
			return { success: false, message: "Server xatosi" }
		}
	}

	// AdminEntryExit.jsx'dagi kabi — bugungi holat, birinchi/oxirgi
	// kirish-chiqish vaqtlari va oxirgi izoh bilan birga o'quvchilar
	// ro'yxati. user.service.js'ning getAll()'iga bevosita mos naqsh.
	async getEntryExitList(schoolId, sinfId) {
		try {
			const todayDateString = dayjs().tz("Asia/Tashkent").format("YYYY-MM-DD")

			const filter = { schoolId, isActive: { $ne: false } }
			if (Array.isArray(sinfId)) filter.sinf = { $in: sinfId }
			else if (sinfId) filter.sinf = sinfId
			const students = await studentModel.find(filter).populate('sinf', 'name').sort({ fullName: 1 })
			const studentIds = students.map(s => s._id)

			const attendances = await studentAttendanceModel.find({
				dateString: todayDateString,
				student: { $in: studentIds }
			})
			const attendanceMap = attendances.reduce((map, a) => {
				map[a.student.toString()] = a
				return map
			}, {})

			const logs = await studentAttendanceLogModel.aggregate([
				{ $match: { dateString: todayDateString, student: { $in: studentIds } } },
				{ $sort: { date: 1 } },
				{
					$group: {
						_id: "$student",
						firstCheckInTime: { $first: "$checkInTime" },
						lastLogId: { $last: "$_id" },
						lastCheckInTime: { $last: "$checkInTime" },
						lastCheckOutTime: { $last: "$checkOutTime" },
						lastComment: { $last: "$comment" }
					}
				}
			])
			const logMap = logs.reduce((map, log) => {
				map[log._id.toString()] = log
				return map
			}, {})

			const studentsWithData = students.map(student => {
				const idStr = student._id.toString()
				const attendance = attendanceMap[idStr]
				const logData = logMap[idStr] || {}

				let attendanceStatus = "kelmagan"
				if (attendance) {
					attendanceStatus = attendance.status === "tashqarida" ? "tashqarida"
						: attendance.status === "ishda" ? "ishda"
						: attendance.status || attendanceStatus
				}

				return {
					...student.toObject(),
					attendanceStatus,
					lastLogId: logData.lastLogId || null,
					lastCheckInTime: logData.lastCheckInTime || null,
					lastCheckOutTime: logData.lastCheckOutTime || null,
					lastComment: logData.lastComment || null,
					firstCheckInTime: logData.firstCheckInTime || null
				}
			})

			return { success: true, students: studentsWithData }
		} catch (error) {
			console.error("getEntryExitList xatolik:", error)
			return { success: false, message: "Server xatosi" }
		}
	}

	// AdminAttandance.jsx'ning "O'quvchi" rejimi uchun — attandance.log.service.js'dagi
	// LogStatistiks'ning bir xil chiqish shakli (stats[{studentId,fullName,sinf,details}]),
	// tabelExport.js'dagi umumiy jadval quruvchi funksiyaga bevosita mos kelishi uchun
	async LogStatistiks({ startDate, endDate, sinfId }, schoolId) {
		try {
			if (!startDate || !endDate) {
				return { success: false, message: "Boshlanish va tugash sanalari kerak" }
			}
			const filter = { schoolId, isActive: { $ne: false } }
			if (sinfId) filter.sinf = sinfId

			const students = await studentModel.find(filter).populate('sinf', 'name')
			const studentIds = students.map(s => s._id)

			const logs = await studentAttendanceLogModel.find({
				dateString: { $gte: startDate, $lte: endDate },
				student: { $in: studentIds }
			})

			const dayjsLib = require('dayjs')
			const isSameOrBefore = require('dayjs/plugin/isSameOrBefore')
			dayjsLib.extend(isSameOrBefore)

			const stats = []
			for (const student of students) {
				const studentLogs = logs.filter(l => l.student.toString() === student._id.toString())
				let dailyDetails = []
				let current = dayjsLib(startDate)
				while (current.isSameOrBefore(endDate)) {
					const currentDateString = current.format("YYYY-MM-DD")
					const dayLogs = studentLogs.filter(l => l.dateString === currentDateString)
					let sessions = []
					dayLogs.forEach(l => {
						if (l.checkInTime && l.checkOutTime) {
							const durationMs = l.checkOutTime - l.checkInTime
							const durationH = (durationMs / (1000 * 60 * 60)).toFixed(2)
							sessions.push({ checkIn: l.checkInTime, checkOut: l.checkOutTime, duration: durationH })
						} else if (l.checkInTime && !l.checkOutTime) {
							sessions.push({ checkIn: l.checkInTime, checkOut: null, duration: null })
						}
					})
					dailyDetails.push({ date: currentDateString, sessions, leave: null })
					current = current.add(1, "day")
				}
				stats.push({
					userId: student._id,
					user: student.fullName,
					position: student.sinf?.name || null,
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

module.exports = new StudentAttandanceService()

