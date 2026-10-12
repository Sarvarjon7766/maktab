const attandanceLogModel = require('../models/attandance.log.model')
const attandanceModel = require('../models/attandance.model')
const userModel = require('../models/user.model')
const settingsModel = require('../models/settings.model')
const sinfModel = require('../models/sinf.model')
const employeeCommentService = require('./employee.comment.service')

const dayjs = require("dayjs")
const utc = require("dayjs/plugin/utc")
const tz = require("dayjs/plugin/timezone")
dayjs.extend(utc)
dayjs.extend(tz)
class AttandanceService {

	async attendanceGetOne(userId, schoolId, from, to) {
		try {
			const now = dayjs().tz("Asia/Tashkent")
			const fromDate = from || now.startOf("month").format("YYYY-MM-DD")
			const toDate   = to   || now.format("YYYY-MM-DD")

			const attendanceRecords = await attandanceModel.find({
				user: userId,
				schoolId,
				dateString: { $gte: fromDate, $lte: toDate }
			}).sort({ dateString: -1 }).lean()

			// Loglarni ham bir yo’la olamiz (n+1 muammodan qochish)
			const logs = await attandanceLogModel.find({
				user: userId,
				schoolId,
				dateString: { $gte: fromDate, $lte: toDate }
			}).sort({ date: 1 }).lean()

			const logsByDate = {}
			for (const log of logs) {
				if (!logsByDate[log.dateString]) logsByDate[log.dateString] = []
				logsByDate[log.dateString].push(log)
			}

			const history = attendanceRecords.map(record => {
				const dayLogs = logsByDate[record.dateString] || []
				const firstCheckIn  = dayLogs.find(l => l.checkin && l.checkInTime)?.checkInTime || null
				const lastCheckOut  = [...dayLogs].reverse().find(l => l.checkout && l.checkOutTime)?.checkOutTime || null

				// Kunlik ish vaqti — HAR BIR kirish/chiqish sessiyasining o'zi
				// yig'iladi (birinchi kirish — oxirgi chiqish oralig'i emas),
				// aks holda kunda bir necha marta kirib-chiqilsa (masalan tushlik
				// tanaffusi), tanaffus vaqti ham "ishlagan" deb hisoblanib qolardi.
				let hoursWorked = 0
				for (const l of dayLogs) {
					if (l.checkInTime && l.checkOutTime) {
						hoursWorked += (new Date(l.checkOutTime) - new Date(l.checkInTime)) / (1000 * 60 * 60)
					}
				}
				hoursWorked = Number(hoursWorked.toFixed(2))

				return {
					_id:          record._id,
					date:         record.date,
					dateString:   record.dateString,
					status:       record.status,
					totalTime:    record.totalTime,
					totalEntries: record.totalEntries,
					arrivalTime:  firstCheckIn,
					departureTime: lastCheckOut,
					hoursWorked:  Number(hoursWorked),
					logs:         dayLogs
				}
			})

			const presentDays = history.filter(r => r.arrivalTime).length
			const totalHours  = history.reduce((s, r) => s + r.hoursWorked, 0)

			return {
				success: true,
				attendanceHistory: history,
				stats: {
					totalDays:    history.length,
					presentDays,
					absentDays:   history.filter(r => !r.arrivalTime).length,
					averageHours: presentDays > 0 ? (totalHours / presentDays).toFixed(1) : "0.0"
				}
			}

		} catch (error) {
			console.error("Attendance history error:", error)
			return { success: false, message: "Server xatosi", error: error.message }
		}
	}
	// schoolId — req.school._id (server_proxy proxy-token yo'li) yoki
	// req.user.school (admin qo'lda UserEditTime orqali kiritganda)
	async checkInAttendance(data, schoolId) {
		try {
			if (!schoolId) {
				return { success: false, message: "Maktab aniqlanmadi" }
			}
			// employee_id bo'lmasa, Mongo `undefined` maydonli so'rovni
			// butunlay olib tashlaydi va findOne({}) kolleksiyadagi TASODIFIY
			// (birinchi) xodimni qaytarib yuboradi — shu sabab bu yerda
			// aniq tekshirilishi SHART.
			if (!data.employee_id) {
				return { success: false, message: "employee_id kerak" }
			}
			// qayer (fizik checkpoint raqami) kamera va qo'lda kiritish
			// (UserEditTime) yo'llarida DOIM beriladi.
			let qayer = null
			if (data.qayer !== undefined && data.qayer !== null && data.qayer !== '') {
				qayer = Number(data.qayer)
				if (Number.isNaN(qayer)) {
					return { success: false, message: "qayer maydoni noto'g'ri" }
				}
			}

			// server_proxy hodisani kamera "Rahmat" deb tanigan zahoti yuboradi,
			// lekin tarmoq/navbat kechikishi tufayli backend so'rovni bir necha
			// soniya (ba'zan undan ko'p) keyin qayta ishlashi mumkin. Shu sabab
			// `new Date()` (backend QAYTA ISHLAGAN payt) o'rniga, mavjud bo'lsa,
			// kameraning O'ZI yuborgan `camera_time`dan foydalanamiz — aks holda
			// masalan 8:59 da tanilgan xodim 9:00 da qayta ishlansa, "kechikkan"
			// deb noto'g'ri belgilanib qolardi. Qurilma soati juda noto'g'ri
			// sozlangan (masalan butunlay boshqa kun) holatlarni filtrlash uchun
			// faqat server vaqtidan ±10 daqiqagacha farq qiladigan qiymatga
			// ishonamiz — undan ortig'ida server vaqtiga qaytamiz.
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

			const user = await userModel.findOne({ hodimID: data.employee_id, schoolId })
			if (!user) return { success: false, message: "Foydalanuvchi topilmadi" }

			// 🔹 Oxirgi logni olish — kirish/chiqish orasida yo'nalishga qarab
			// turlicha minimal kutish vaqti (tasodifiy/tezkor qayta tanishni
			// filtrlash uchun). Qiymatlar super admin panelidan sozlanadi
			// (Settings modeli, har bir maktab uchun alohida), sozlanmagan
			// bo'lsa standart 15/5 ishlatiladi.
			const settings = await settingsModel.findOne({ schoolId })
			const entryToExitCooldown = settings?.entryToExitCooldownSeconds ?? 15
			const exitToEntryCooldown = settings?.exitToEntryCooldownSeconds ?? 5

			const lastLog = await attandanceLogModel.findOne({ user: user._id }).sort({ date: -1 })
			if (lastLog) {
				if (!lastLog.checkout) {
					// Oxirgi harakat KIRISH edi (hali chiqmagan)
					if (!isEntering) {
						const diffSeconds = (eventTime - lastLog.checkInTime) / 1000
						if (diffSeconds < entryToExitCooldown) {
							return { success: false, message: `Chiqish uchun kirishdan keyin kamida ${entryToExitCooldown} soniya kuting` }
						}
					}
				} else {
					// Oxirgi harakat CHIQISH edi
					if (isEntering) {
						const diffSeconds = (eventTime - lastLog.checkOutTime) / 1000
						if (diffSeconds < exitToEntryCooldown) {
							return { success: false, message: `Kirish uchun chiqishdan keyin kamida ${exitToEntryCooldown} soniya kuting` }
						}
					}
				}
			}

			let attendance = await attandanceModel.findOne({
				user: user._id,
				dateString: dateString
			})

			if (isEntering) {
				if (attendance && attendance.status === 'ishda') {
					return { success: false, message: "Foydalanuvchi hali chiqmagan" }
				}
				// Ikkita deyarli bir vaqtdagi kirish hodisasi (masalan takroriy
				// kamera signali) yuqoridagi findOne+create/save orasida poyga
				// holatiga (race condition) tushib, IKKITA "ishda" yozuvi
				// yaratishi mumkin edi. Endi atomik findOneAndUpdate + upsert
				// ishlatiladi: filtr status!=='ishda' bo'lgani uchun, agar
				// boshqa so'rov ORADA ulgurib "ishda"ga o'tkazgan bo'lsa, bu
				// so'rov hujjatni topolmay, unique indeks orqali E11000
				// xatosini beradi va biz buni "hali chiqmagan" deb qaytaramiz.
				try {
					attendance = await attandanceModel.findOneAndUpdate(
						{ user: user._id, dateString, status: { $ne: 'ishda' } },
						{
							$set: { status: 'ishda', date: eventTime, schoolId },
							$inc: { totalEntries: 1 },
							$setOnInsert: { totalTime: '0:00' }
						},
						{ new: true, upsert: true }
					)
				} catch (err) {
					if (err.code === 11000) {
						return { success: false, message: "Foydalanuvchi hali chiqmagan" }
					}
					throw err
				}
				await attandanceLogModel.create({
					schoolId,
					user: user._id,
					date: eventTime,
					dateString,
					checkin: true,
					checkout: false,
					checkInTime: eventTime
				})
				// Xodim kirdi — faol kommentni avtomatik yopish
				await employeeCommentService.autoCloseOnCheckin(user._id)
			} else {
				// Bugungi attendance 'ishda' bo'lmasa — kecha yarmidan o'tib
				// ketgan smena bo'lishi mumkin (kecha kirgan, bugun chiqayapti).
				// Shu holda eng oxirgi ochiq (hali 'tashqarida' bo'lmagan)
				// kunlik yozuvni qidiramiz, faqat bugungisiga cheklanmaymiz.
				let openAttendance = attendance
				if (!openAttendance || openAttendance.status !== 'ishda') {
					openAttendance = await attandanceModel.findOne({
						user: user._id,
						status: 'ishda'
					}).sort({ date: -1 })
				}
				if (!openAttendance) {
					return { success: false, message: "Kirish topilmadi" }
				}

				// Ikkita deyarli bir vaqtdagi chiqish hodisasi (masalan takroriy
				// kamera signali) oldin findOne+save orasida poyga holatiga
				// (race condition) tushib, totalTime'ni ikki marta qo'shishi
				// mumkin edi. Endi eng so'nggi ochiq logni ATOMIK ravishda
				// (checkout:false filtri bilan) "band qilamiz" — agar boshqa
				// so'rov ORADA ulgurib yopgan bo'lsa, bu so'rov hujjatni
				// topolmaydi va aniq xabar bilan to'xtaydi.
				const openLog = await attandanceLogModel.findOneAndUpdate(
					{ user: user._id, checkin: true, checkout: false },
					{
						$set: {
							checkout: true,
							checkOutTime: eventTime
						}
					},
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

			return { success: true, message: isEntering ? "Kirish qayd etildi" : "Chiqish qayd etildi" }
		} catch (error) {
			console.error('Create attendance error:', error)
			return { success: false, message: "Server error", error: error.message }
		}
	}

	async getUser(schoolId) {
		const { signedUrl } = require('../utils/uploadsAuth')
		try {
			const BASE_URL = process.env.CAMERA_PHOTO_URL || `http://localhost:${process.env.PORT || 5000}/uploads/`

			// DB darajasida filtr: faqat leader va viewer rollari
			// .lean() - oddiy JS obyektlar qaytaradi (performance uchun yaxshi)
			let users = await userModel.find({ role: { $in: ["leader", "viewer"] }, schoolId }).lean()

			// photo maydonini to'ldirish
			users = users.map(u => ({
				...u,
				photo: u.photo ? signedUrl(BASE_URL, u.photo) : null
			}))

			if (users.length > 0) {
				return {
					success: true,
					message: "Leader va viewer rollaridagi foydalanuvchilar olindi",
					users
				}
			} else {
				return {
					success: false,
					message: "Leader yoki viewer rollaridagi foydalanuvchilar topilmadi",
					users: []
				}
			}
		} catch (error) {
			console.error("getUser error:", error)
			return {
				success: false,
				message: "Server xatosi",
				error: error.message
			}
		}
	}

	// Admin dashboard uchun umumlashgan statistika: bugungi holat,
	// oxirgi 14 kunlik trend, bo'limlar bo'yicha taqqoslash
	async getDashboardStats(schoolId) {
		try {
			const now = dayjs().tz("Asia/Tashkent")
			const todayDateString = now.format("YYYY-MM-DD")

			const settings = await settingsModel.findOne({ schoolId })
			const workStartTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(settings?.workStartTime)
				? settings.workStartTime
				: "09:00"
			const [workHour, workMinute] = workStartTime.split(":").map(Number)
			const lateThreshold = now.startOf('day').hour(workHour).minute(workMinute).second(0)

			// Pastdagi barcha davomat/log so'rovlari shu ro'yxatdan olingan
			// eligibleUserIds bo'yicha filtrlanadi — shuning uchun schoolId
			// filtri FAQAT shu so'rovga qo'shilsa yetarli, u orqali maktab
			// izolyatsiyasi butun funksiya bo'ylab avtomatik ta'minlanadi
			const eligibleUsers = await userModel
				.find({ role: { $in: ["viewer", "leader"] }, isActive: { $ne: false }, schoolId })
				.select("_id sinf")
				.lean()
			const totalEligible = eligibleUsers.length
			const eligibleUserIds = eligibleUsers.map(u => u._id)

			const todayAttendance = await attandanceModel
				.find({ dateString: todayDateString, user: { $in: eligibleUserIds } })
				.select("user status")
				.lean()
			const statusMap = todayAttendance.reduce((map, a) => {
				map[a.user.toString()] = a.status
				return map
			}, {})

			// Har bir xodimning bugungi BIRINCHI kirish vaqti — "Kechikdi"ni
			// aniqlash uchun (ish boshlanish vaqtidan keyingi birinchi kirish)
			const firstCheckIns = await attandanceLogModel.aggregate([
				{ $match: { dateString: todayDateString, checkin: true, user: { $in: eligibleUserIds } } },
				{ $group: { _id: "$user", firstCheckInTime: { $min: "$checkInTime" } } }
			])
			const firstCheckInMap = firstCheckIns.reduce((map, f) => {
				map[f._id.toString()] = f.firstCheckInTime
				return map
			}, {})

			let keldi = 0, ketdi = 0, kechikdi = 0
			for (const u of eligibleUsers) {
				const idStr = u._id.toString()
				const status = statusMap[idStr]
				if (status !== 'ishda' && status !== 'tashqarida') continue

				keldi++
				if (status === 'tashqarida') ketdi++

				const firstCheckInTime = firstCheckInMap[idStr]
				if (firstCheckInTime && dayjs(firstCheckInTime).tz("Asia/Tashkent").isAfter(lateThreshold)) {
					kechikdi++
				}
			}
			const kelmagan = Math.max(totalEligible - keldi, 0)

			// Oxirgi 14 kunlik trend (kelgan xodimlar soni)
			const trendDays = []
			for (let i = 13; i >= 0; i--) {
				trendDays.push(now.subtract(i, 'day').format("YYYY-MM-DD"))
			}
			const trendAgg = await attandanceModel.aggregate([
				{ $match: { dateString: { $in: trendDays }, user: { $in: eligibleUserIds } } },
				{ $group: { _id: "$dateString", present: { $sum: 1 } } }
			])
			const trendMap = trendAgg.reduce((map, t) => { map[t._id] = t.present; return map }, {})
			const trend = trendDays.map(date => ({
				date,
				present: trendMap[date] || 0,
				absent: Math.max(totalEligible - (trendMap[date] || 0), 0)
			}))

			// Bo'limlar bo'yicha bugungi davomat foizi
			const sinfs = await sinfModel.find({ schoolId }).select("name").lean()
			const deptTotal = {}
			const deptPresent = {}
			for (const u of eligibleUsers) {
				const depId = u.sinf ? u.sinf.toString() : null
				if (!depId) continue
				deptTotal[depId] = (deptTotal[depId] || 0) + 1
				const status = statusMap[u._id.toString()]
				if (status === 'ishda' || status === 'tashqarida') {
					deptPresent[depId] = (deptPresent[depId] || 0) + 1
				}
			}
			const bySinf = sinfs
				.map(d => {
					const id = d._id.toString()
					const total = deptTotal[id] || 0
					const present = deptPresent[id] || 0
					return {
						name: d.name,
						total,
						present,
						rate: total ? Math.round((present / total) * 100) : 0
					}
				})
				.filter(d => d.total > 0)
				.sort((a, b) => b.rate - a.rate)

			return {
				success: true,
				today: { keldi, ketdi, kechikdi, kelmagan, total: totalEligible, workStartTime },
				trend,
				bySinf
			}
		} catch (error) {
			console.error("getDashboardStats error:", error)
			return { success: false, message: "Server xatosi", error: error.message }
		}
	}

	// Kengaytirilgan tahlil: tanlangan davr bo'yicha trend, bo'limlar
	// taqqoslash, kechikuvchilar reytingi, eng intizomli xodimlar, o'rtacha
	// ish soati trendi. getDashboardStats()dan ATAYLAB alohida — bosh sahifa
	// har doim tez (faqat bugungi kun) yuklanishi kerak, bu esa Tahlil
	// sahifasi uchun og'irroq, lekin kam-kam chaqiriladigan hisoblash.
	async getDashboardAnalytics({ range } = {}, schoolId) {
		try {
			const days = [7, 30, 90, 365].includes(Number(range)) ? Number(range) : 30
			const now = dayjs().tz("Asia/Tashkent")

			const settings = await settingsModel.findOne({ schoolId })
			const workStartTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(settings?.workStartTime)
				? settings.workStartTime
				: "09:00"
			const [workHour, workMinute] = workStartTime.split(":").map(Number)

			// Pastdagi barcha so'rovlar eligibleUserIds orqali filtrlanadi —
			// schoolId shu yerga qo'shilishi butun funksiyani maktab bo'yicha izolyatsiya qiladi
			const eligibleUsers = await userModel
				.find({ role: { $in: ["viewer", "leader"] }, isActive: { $ne: false }, schoolId })
				.select("_id fullName photo sinf")
				.populate("sinf", "name")
				.lean()
			const totalEligible = eligibleUsers.length
			const eligibleUserIds = eligibleUsers.map(u => u._id)
			const userMap = eligibleUsers.reduce((map, u) => { map[u._id.toString()] = u; return map }, {})

			const rangeDays = []
			for (let i = days - 1; i >= 0; i--) {
				rangeDays.push(now.subtract(i, 'day').format("YYYY-MM-DD"))
			}

			// Davr trendi (kelgan/kelmagan xodimlar soni har kuni)
			const trendAgg = await attandanceModel.aggregate([
				{ $match: { dateString: { $in: rangeDays }, user: { $in: eligibleUserIds } } },
				{ $group: { _id: "$dateString", present: { $sum: 1 } } }
			])
			const trendMap = trendAgg.reduce((map, t) => { map[t._id] = t.present; return map }, {})
			const trend = rangeDays.map(date => ({
				date,
				present: trendMap[date] || 0,
				absent: Math.max(totalEligible - (trendMap[date] || 0), 0)
			}))

			// Har xodimning davrdagi kelgan kunlari soni — bo'lim foizi va
			// "eng intizomli" reytingi uchun ham kerak bo'ladi
			const presentDaysAgg = await attandanceModel.aggregate([
				{ $match: { dateString: { $in: rangeDays }, user: { $in: eligibleUserIds } } },
				{ $group: { _id: "$user", days: { $sum: 1 } } }
			])
			const presentDaysByUser = presentDaysAgg.reduce((map, r) => { map[r._id.toString()] = r.days; return map }, {})

			// Bo'limlar bo'yicha davr o'rtacha davomat foizi
			const deptTotals = {}
			for (const u of eligibleUsers) {
				const depName = u.sinf?.name || "Bo'limsiz"
				if (!deptTotals[depName]) deptTotals[depName] = { totalPossible: 0, totalPresent: 0, headcount: 0 }
				deptTotals[depName].totalPossible += days
				deptTotals[depName].totalPresent += presentDaysByUser[u._id.toString()] || 0
				deptTotals[depName].headcount += 1
			}
			const bySinf = Object.entries(deptTotals)
				.map(([name, d]) => ({
					name,
					headcount: d.headcount,
					rate: d.totalPossible ? Math.round((d.totalPresent / d.totalPossible) * 100) : 0
				}))
				.sort((a, b) => b.rate - a.rate)

			// Kechikishlar: davrdagi har bir kun uchun xodimning BIRINCHI
			// kirish vaqtini olib, ish boshlanish vaqtidan keyin bo'lsa sanaymiz
			const firstCheckIns = await attandanceLogModel.aggregate([
				{ $match: { dateString: { $in: rangeDays }, checkin: true, user: { $in: eligibleUserIds } } },
				{ $group: { _id: { user: "$user", date: "$dateString" }, firstCheckInTime: { $min: "$checkInTime" } } }
			])
			const lateCountByUser = {}
			for (const rec of firstCheckIns) {
				const idStr = rec._id.user.toString()
				const dayStart = dayjs.tz(rec._id.date, "Asia/Tashkent").hour(workHour).minute(workMinute).second(0)
				if (dayjs(rec.firstCheckInTime).tz("Asia/Tashkent").isAfter(dayStart)) {
					lateCountByUser[idStr] = (lateCountByUser[idStr] || 0) + 1
				}
			}

			const toPublicUser = (userId, extra) => {
				const u = userMap[userId]
				if (!u) return null
				return {
					userId: u._id,
					fullName: u.fullName,
					photo: u.photo,
					sinf: u.sinf?.name || "Bo'limsiz",
					...extra
				}
			}

			const lateLeaderboard = Object.entries(lateCountByUser)
				.map(([userId, lateCount]) => toPublicUser(userId, { lateCount, presentCount: presentDaysByUser[userId] || 0 }))
				.filter(Boolean)
				.sort((a, b) => b.lateCount - a.lateCount)
				.slice(0, 50)

			// Eng intizomli: kamida bir necha kun kelgan va eng kam/hech
			// kechikmagan xodimlar (kam qatnashgan xodim tasodifan 100%
			// "eng yaxshi" bo'lib chiqmasligi uchun minimal ishtirok sharti)
			const minAttendanceForRanking = Math.min(3, days)
			const topPerformers = eligibleUsers
				.map(u => {
					const idStr = u._id.toString()
					const presentCount = presentDaysByUser[idStr] || 0
					const lateCount = lateCountByUser[idStr] || 0
					const onTimeRate = presentCount ? Math.round(((presentCount - lateCount) / presentCount) * 100) : 0
					return { userId: idStr, presentCount, lateCount, onTimeRate }
				})
				.filter(r => r.presentCount >= minAttendanceForRanking)
				.sort((a, b) => b.onTimeRate - a.onTimeRate || b.presentCount - a.presentCount)
				.slice(0, 50)
				.map(r => toPublicUser(r.userId, { onTimeRate: r.onTimeRate, presentCount: r.presentCount }))
				.filter(Boolean)

			// O'rtacha ish soati trendi — Attendance.totalTime ("H:MM") dan,
			// checkInAttendance chiqish (exit) branchida hisoblanadigan qiymat
			const attendanceWithTime = await attandanceModel
				.find({ dateString: { $in: rangeDays }, user: { $in: eligibleUserIds } })
				.select("dateString totalTime")
				.lean()
			const minutesByDay = {}
			const countByDay = {}
			for (const a of attendanceWithTime) {
				const [h, m] = (a.totalTime || "0:00").split(":").map(Number)
				const mins = (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
				if (mins <= 0) continue
				minutesByDay[a.dateString] = (minutesByDay[a.dateString] || 0) + mins
				countByDay[a.dateString] = (countByDay[a.dateString] || 0) + 1
			}
			const avgWorkHoursTrend = rangeDays.map(date => ({
				date,
				avgHours: countByDay[date] ? Math.round((minutesByDay[date] / countByDay[date] / 60) * 10) / 10 : 0
			}))

			return {
				success: true,
				range: days,
				trend,
				bySinf,
				lateLeaderboard,
				topPerformers,
				avgWorkHoursTrend
			}
		} catch (error) {
			console.error("getDashboardAnalytics error:", error)
			return { success: false, message: "Server xatosi", error: error.message }
		}
	}

	// So'nggi kirish/chiqish hodisalari — "jonli kuzatish" lentasi uchun.
	// AttendanceLog o'zgarmas hodisa tarixi bo'lgani uchun (oxirgi-hodisa jadvalidan farqli,
	// u checkpoint bo'yicha faqat OXIRGI hodisani saqlaydi) shu yerdan olinadi.
	async getLiveFeed({ limit } = {}, schoolId) {
		try {
			const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100)
			const logs = await attandanceLogModel
				.find({ schoolId })
				.sort({ createdAt: -1 })
				.limit(safeLimit)
				.populate({
					path: "user",
					select: "fullName photo position sinf",
					populate: { path: "sinf", select: "name" }
				})
				.lean()

			const events = logs
				.filter(l => l.user)
				.map(l => ({
					id: l._id,
					userId: l.user._id,
					fullName: l.user.fullName,
					photo: l.user.photo,
					position: l.user.position,
					sinf: l.user.sinf?.name || "Bo'limsiz",
					type: l.checkout ? "exit" : "entry",
					time: l.checkout ? l.checkOutTime : l.checkInTime
				}))

			return { success: true, events }
		} catch (error) {
			console.error("getLiveFeed error:", error)
			return { success: false, message: "Server xatosi", error: error.message }
		}
	}
}

module.exports = new AttandanceService()

