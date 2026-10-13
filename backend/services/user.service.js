// DIQQAT: bu fayl sessiya tarixidan to'liq tiklanmadi: Desktop/faceumumiy dagi eski nusxa asos qilib olingan, ko'p-maktab (schoolId) tuzatishlari qo'lda qo'llangan. Tekshirib chiqing.
const userModel = require('../models/user.model')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const fs = require("fs")
const path = require("path")
const attandanceModel = require('../models/attandance.model')
const attandanceLogModel = require('../models/attandance.log.model')
const cron = require('node-cron')
const dayjs = require("dayjs")
const utc = require("dayjs/plugin/utc")
const timezone = require("dayjs/plugin/timezone")
dayjs.extend(utc)
dayjs.extend(timezone)
const adduserModel = require('../models/add.user.model')
const updateuserModel = require('../models/update.user.model')
const deleteUserModel = require('../models/delete.user.model')
const sinfModel = require('../models/sinf.model')
const ExcelJS = require('exceljs')

// Chalkash belgilar (0/O, 1/l/I) chiqarib tashlangan — parolni qo'lda aytib berishda adashmaslik uchun
const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
function generateRandomPassword(length = 8) {
	let pass = ''
	for (let i = 0; i < length; i++) {
		pass += PASSWORD_CHARS[Math.floor(Math.random() * PASSWORD_CHARS.length)]
	}
	return pass
}

// JSHR (PINFL) faqat shu rollarga ko'rinadi, qolganlarida javobdan olib tashlanadi (tarmoq so'rovida ko'rinib qolmasligi uchun)
const JSHR_ALLOWED_ROLES = ['user', 'admin']
function stripJshr(userObj, requesterRole) {
	if (JSHR_ALLOWED_ROLES.includes(requesterRole)) return userObj
	const { jshr, ...rest } = userObj
	return rest
}

// role tekshirilmasa mass-assignment orqali imtiyoz oshirish mumkin edi — faqat 'user' roli admin-darajadagi rol bera oladi
const ADMIN_TIER_ROLES = ['user', 'admin']
function guardRoleAssignment(data, requesterRole) {
	if ('role' in data && data.role && ADMIN_TIER_ROLES.includes(data.role) && requesterRole !== 'user') {
		delete data.role
	}
}

const MIN_PASSWORD_LENGTH = 6
// Admin yangilashi mumkin bo'lgan maydonlar oq ro'yxati (mass-assignment himoyasi)
const USER_WRITABLE_FIELDS = ['fullName', 'position', 'sinf', 'role', 'username', 'password', 'jshr', 'lavel', 'birthday', 'phone_personal', 'phone_work', 'isEdit', 'photo', 'isActive']
function pickFields(obj, keys) {
	const out = {}
	for (const k of keys) if (k in obj) out[k] = obj[k]
	return out
}
// 'user' har kimni boshqaradi; 'admin' esa admin-darajadagi (user/admin) rollarni boshqara olmaydi
function canManageTarget(targetRole, requesterRole) {
	if (requesterRole === 'user') return true
	return !ADMIN_TIER_ROLES.includes(targetRole)
}
async function sinfBelongsToSchool(sinfId, schoolId) {
	if (!sinfId) return false
	try { return !!(await sinfModel.exists({ _id: sinfId, schoolId })) } catch { return false }
}

class UserService {
	async register(data, id, requesterRole, schoolId) {
		try {
			guardRoleAssignment(data, requesterRole)
			const { username, password } = data
			const existingUser = await userModel.findOne({ username })
			if (existingUser) {
				return {
					success: false,
					message: "Bu foydalanuvchi nomi allaqachon ro'yxatdan o'tgan",
				}
			}
			const saltRounds = 10
			const hashedPassword = await bcrypt.hash(password, saltRounds)

			// hodimID = xodimning Mongo _id'si (kamera employee_no'si ham shu bo'ladi)
			const { hodimID, ...rest } = data
			const user = new userModel({
				...rest,
				schoolId,
				password: hashedPassword,
				photo_camera: false,
				createdBy: id ? id : null
			})
			user.hodimID = user._id.toString()
			await user.save()

			// adduser outbox — server_proxy shu navbatni GET /api/employees/pending orqali so'raydi
			const excludedRoles = ['post', 'admin', 'user']
			if (!excludedRoles.includes(user.role) && user.hodimID && user.photo) {
				await adduserModel.create({
					schoolId,
					full_name: user.fullName,
					action: 'create',
					userId: user._id,
					hodimID: user.hodimID,
					photo: `/uploads/${user.photo}`
				})
			}

			const userObj = user.toObject()
			delete userObj.password
			return {
				success: true,
				message: "Foydalanuvchi muvaffaqiyatli ro'yxatdan o'tkazildi",
				user: userObj
			}
		} catch (error) {
			console.error("Register xatoligi:", error)
			return {
				success: false,
				message: "Serverda xatolik yuz berdi",
				error: error.message
			}
		}
	}
	async registerpost(data, id, requesterRole, schoolId) {
		try {
			guardRoleAssignment(data, requesterRole)
			const { username, password } = data
			const existingUser = await userModel.findOne({ username })
			if (existingUser) {
				return {
					success: false,
					message: "Bu foydalanuvchi nomi allaqachon ro'yxatdan o'tgan",
				}
			}
			const saltRounds = 10
			const hashedPassword = await bcrypt.hash(password, saltRounds)

			const user = await userModel.create({
				...data,
				schoolId,
				password: hashedPassword,
				createdBy: id
			})

			const userObj = user.toObject()
			delete userObj.password
			return {
				success: true,
				message: "Foydalanuvchi muvaffaqiyatli ro'yxatdan o'tkazildi",
				user: userObj
			}
		} catch (error) {
			console.error("Register xatoligi:", error)
			return {
				success: false,
				message: "Serverda xatolik yuz berdi",
				error: error.message
			}
		}
	}

	// Ustunlar joylashuvi emas, 1-qatordagi sarlavha nomi bo'yicha aniqlanadi; rasm bu yerda ishlanmaydi (keyin tahrirlashda kamera-sinxronizatsiya oqimi o'zi ishga tushadi)
	async bulkImportFromExcel(buffer, creatorId, schoolId) {
		const workbook = new ExcelJS.Workbook()
		try {
			await workbook.xlsx.load(buffer)
		} catch (err) {
			return { success: false, message: "Fayl formatini o'qib bo'lmadi — to'g'ri .xlsx fayl ekanligiga ishonch hosil qiling" }
		}

		const sheet = workbook.worksheets[0]
		if (!sheet || !sheet.lastRow) {
			return { success: false, message: "Faylda ma'lumot topilmadi" }
		}

		const getCell = (row, col) => {
			const v = row.getCell(col).value
			if (v === null || v === undefined) return ''
			if (typeof v === 'object' && v.text) return String(v.text).trim() // rich text hujayralari
			if (typeof v === 'object' && v.result !== undefined) return String(v.result).trim() // formula hujayralari
			return String(v).trim()
		}

		const normalizeHeader = (text) => String(text).toLowerCase().replace(/[\s.'ʼ`’()]/g, '')
		const HEADER_ALIASES = {
			fullName: ['fish', 'fio', 'toliqism', 'ismsharif', 'ismfamiliyaotasin'],
			position: ['lavozim', 'lavozimi'],
			username: ['login', 'foydalanuvchinomi', 'username'],
			password: ['parol', 'password'],
			sinf: ['sinf', 'sinfi', 'bolim', 'bolimi', 'department'],
			role: ['rol', 'roli', 'role'],
			phone_personal: ['shaxsiytelefon', 'telefon', 'telefonraqami'],
			phone_work: ['ishtelefoni', 'ishtelefon'],
			jshr: ['jshr', 'pinfl'],
		}

		const headerRow = sheet.getRow(1)
		const colIndex = {}
		headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
			const normalized = normalizeHeader(cell.value)
			for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
				if (aliases.includes(normalized) && !(field in colIndex)) {
					colIndex[field] = colNumber
				}
			}
		})

		const missingRequired = ['fullName', 'position', 'username', 'password'].filter(f => !(f in colIndex))
		if (missingRequired.length) {
			return {
				success: false,
				message: `Excel'ning 1-qatorida (sarlavhada) quyidagi ustunlar topilmadi: ${missingRequired.map(f => ({ fullName: 'F.I.Sh', position: 'Lavozim', username: 'Login', password: 'Parol' }[f])).join(', ')}. Sarlavha nomlari "Shablonni yuklab olish" faylidagidek bo'lishi kerak.`
			}
		}

		const sinfs = await sinfModel.find({ schoolId }).lean()
		const sinfByName = new Map(sinfs.map(d => [d.name.trim().toLowerCase(), d._id]))

		// username butun platformada yagona — bu tekshiruv ATAYLAB schoolId'siz
		const existingUsers = await userModel.find({}, 'username').lean()
		const takenUsernames = new Set(existingUsers.map(u => u.username).filter(Boolean))

		const rows = []
		let successCount = 0
		let failCount = 0

		// 1-qator sarlavha
		for (let rowNumber = 2; rowNumber <= sheet.lastRow.number; rowNumber++) {
			const row = sheet.getRow(rowNumber)
			if (!row.hasValues) continue

			const fullName = getCell(row, colIndex.fullName)
			const position = getCell(row, colIndex.position)
			const sinfNameRaw = colIndex.sinf ? getCell(row, colIndex.sinf) : ''
			const username = getCell(row, colIndex.username)
			let password = getCell(row, colIndex.password)
			const roleRaw = (colIndex.role ? getCell(row, colIndex.role) : '').toLowerCase()
			const phonePersonal = colIndex.phone_personal ? getCell(row, colIndex.phone_personal) : ''
			const phoneWork = colIndex.phone_work ? getCell(row, colIndex.phone_work) : ''
			const jshrRaw = colIndex.jshr ? getCell(row, colIndex.jshr) : ''

			const rowResult = { row: rowNumber, fullName: fullName || `(${rowNumber}-qator)`, success: false, message: '', generatedPassword: null }
			const notes = []

			if (!fullName || !position || !username) {
				rowResult.message = "F.I.Sh, Lavozim va Foydalanuvchi nomi majburiy — o'tkazib yuborildi"
				failCount++
				rows.push(rowResult)
				continue
			}

			if (takenUsernames.has(username)) {
				rowResult.message = `"${username}" foydalanuvchi nomi allaqachon band — o'tkazib yuborildi`
				failCount++
				rows.push(rowResult)
				continue
			}

			let role = 'viewer'
			if (roleRaw === 'rahbar' || roleRaw === 'leader') {
				role = 'leader'
			} else if (roleRaw && roleRaw !== 'xodim' && roleRaw !== 'viewer') {
				notes.push(`noma'lum rol "${roleRaw}" — "Xodim" sifatida qo'shildi`)
			}

			let sinfId
			if (sinfNameRaw) {
				sinfId = sinfByName.get(sinfNameRaw.toLowerCase())
				if (!sinfId) notes.push(`"${sinfNameRaw}" nomli sinf topilmadi — sinfsiz qo'shildi`)
			}

			const jshr = /^\d{14}$/.test(jshrRaw) ? jshrRaw : undefined
			if (jshrRaw && !jshr) notes.push("JSHR noto'g'ri (14 xonali bo'lishi kerak) — bo'sh qoldirildi")

			if (!password || password.length < 6) {
				if (password) notes.push("kiritilgan parol 6 belgidan kam — avtomatik parol berildi")
				password = generateRandomPassword()
				rowResult.generatedPassword = password
			}

			try {
				const hashedPassword = await bcrypt.hash(password, 10)
				const user = new userModel({
					fullName, position, username,
					password: hashedPassword,
					sinf: sinfId,
					role,
					phone_personal: phonePersonal || undefined,
					phone_work: phoneWork || undefined,
					jshr,
					photo_camera: false,
					createdBy: creatorId,
					schoolId
				})
				user.hodimID = user._id.toString()
				await user.save()

				takenUsernames.add(username)
				rowResult.success = true
				successCount++
			} catch (err) {
				if (err.code !== 11000) console.error("Excel import qator xatosi:", err)
				notes.unshift(err.code === 11000 ? `"${username}" foydalanuvchi nomi allaqachon band` : (err.message || "Noma'lum xatolik"))
				failCount++
			}

			rowResult.message = notes.join('; ')
			rows.push(rowResult)
		}

		return {
			success: true,
			message: `${successCount} ta xodim qo'shildi${failCount ? `, ${failCount} ta qatorda muammo` : ''}`,
			successCount,
			failCount,
			rows
		}
	}

	async update(id, data, requesterRole, schoolId) {
		try {
			// findById emas — schoolId filtri bilan, boshqa maktabning xodimi
			// id orqali taxmin qilib tahrirlanmasligi uchun
			const oldUser = await userModel.findOne({ _id: id, schoolId })
			if (!oldUser) {
				return { success: false, message: "Xodim topilmadi" }
			}

			if (!canManageTarget(oldUser.role, requesterRole)) {
				return { success: false, message: "Ruxsat yo'q" }
			}

			const saltRounds = 10
			// Faqat oq ro'yxatdagi maydonlar (mass-assignment himoyasi). `data` dagi
			// photo faqat controller tomonidan req.file'dan qo'yiladi.
			let updateData = pickFields(data, USER_WRITABLE_FIELDS)
			guardRoleAssignment(updateData, requesterRole)

			// username faqat bo'sh bo'lmagan satr bo'lsa o'zgaradi
			if ('username' in updateData) {
				const uname = typeof updateData.username === 'string' ? updateData.username.trim() : ''
				if (uname) updateData.username = uname
				else delete updateData.username
			}

			// sinf shu maktabga tegishli bo'lishi shart ('' — sinfni olib tashlash)
			if ('sinf' in updateData) {
				if (updateData.sinf === '' || updateData.sinf === null) {
					updateData.sinf = null
				} else if (!(await sinfBelongsToSchool(updateData.sinf, schoolId))) {
					return { success: false, message: "Sinf topilmadi" }
				}
			}

			// parolni hash qilish (bo'sh parol — o'zgartirilmaydi)
			if ('password' in updateData) {
				const pw = typeof updateData.password === 'string' ? updateData.password : ''
				if (!pw) {
					delete updateData.password
				} else if (pw.length < MIN_PASSWORD_LENGTH) {
					return { success: false, message: "Parol kamida 6 belgidan iborat bo'lsin" }
				} else {
					updateData.password = await bcrypt.hash(pw, saltRounds)
				}
			}

			// Eski rasm controller'da (deleteOldImage oldindan aniqlagan yo'l bo'yicha)
			// yangilash MUVAFFAQIYATLI bo'lgandan keyin o'chiriladi — bu yerda
			// o'chirilmaydi (validatsiya xatosida rasm yo'qolmasligi uchun)

			// Yangi rasm yuklansa eski kamera-sinxronizatsiya statusi ma'nosiz — qayta "sinxronlanmagan" deb belgilanadi
			if (data.photo) {
				updateData.photo_camera = false
			}

			// "Kameraga ham yubor" checkbox — DB maydoni emas, faqat navbatni boshqarish signali, saqlanmaydi
			const syncToCamera = data.syncToCamera === 'true' || data.syncToCamera === true
			delete updateData.syncToCamera

			const user = await userModel.findOneAndUpdate(
				{ _id: id, schoolId },
				updateData,
				{ new: true, runValidators: true }
			)

			// Faqat "Kameraga ham yubor" belgilansa joriy rasm kamera-sinxronizatsiya navbatiga qo'yiladi, aks holda kameraga tegilmaydi
			const excludedRoles = ['post', 'admin', 'user']
			if (syncToCamera && !excludedRoles.includes(user.role) && user.hodimID && user.photo) {
				await adduserModel.deleteMany({ hodimID: user.hodimID, schoolId })
				await adduserModel.create({
					schoolId,
					full_name: user.fullName,
					action: 'update',
					userId: user._id,
					hodimID: user.hodimID,
					photo: `/uploads/${user.photo}`
				})
			}

			return {
				success: true,
				message: "Xodimning ma'lumotlari yangilandi",
				user: { _id: user._id, fullName: user.fullName }
			}

		} catch (error) {
			console.log("Update xatolik:", error)
			return {
				success: false,
				message: "Serverda xatolik yuz berdi",
				error: error.message
			}
		}
	}
	async updatepost(id, data, requesterRole, schoolId) {
		try {
			const updateData = { ...data }
			guardRoleAssignment(updateData, requesterRole)
			// Ilgari bu yerda parol hash qilinmasdan unutilgan edi — parol ochiq matnda saqlanib, login hech qachon mos kelmasdi
			if (updateData.password) {
				updateData.password = await bcrypt.hash(updateData.password, 10)
			}
			const user = await userModel.findOneAndUpdate({ _id: id, schoolId }, updateData, { new: true, runValidators: true })
			if (user) {
				return { success: true, message: "Xodimning ma'lumotlari yangilandi" }
			} else {
				return { success: false, message: "Xodimning ma'lumotlarini yangilashda xatolik" }
			}

		} catch (error) {
			return {
				success: false,
				message: "Serverda xatolik yuz berdi",
				error: error.message
			}
		}
	}

	async auth({ username, password }) {
		try {
			const user = await userModel.findOne({
				username: username,
				isActive: true
			}).select('+password')
			if (!user) {
				return { success: false, message: "Login yoki parol noto'g'ri" }
			}
			const isPasswordMatch = await bcrypt.compare(password, user.password)
			if (!isPasswordMatch) {
				return { success: false, message: "Login yoki parol noto'g'ri" }
			}
			const token = jwt.sign(
				{ userId: user._id, username: user.username, role: user.role, school: user.schoolId || null },
				process.env.JWT_SECRET,
				{ expiresIn: '12h' }
			)

			return {
				success: true,
				message: "Muvaffaqiyatli tizimga kirildi",
				token,
				role: user.role,
				school: user.schoolId || null,
				user: {
					_id: user._id,
					username: user.username
				}
			}
		} catch (error) {
			console.error("Auth xatolik:", error)
			return { success: false, message: "Server xatosi" }
		}
	}
	async getUser(data) {
		try {
			const user = await userModel.findById(data.userId).populate("sinf")
			if (user) {
				return { success: true, message: "Foydalanuvchi ma'lumotlari", user: stripJshr(user.toObject(), data.role) }
			} else {
				return { success: false, message: "Foydalanuvchi ma'lumoti topilmadi", user: {} }
			}
		} catch (error) {
			console.error("Foydalanuvchi ma'lumotlari xatolik:", error)
			return { success: false, message: "Server xatosi" }
		}
	}
	async changePassword(userId, currentPassword, newPassword) {
		try {
			if (!currentPassword || !newPassword) {
				return { success: false, message: "Joriy va yangi parolni kiriting" }
			}
			if (newPassword.length < 6) {
				return { success: false, message: "Yangi parol kamida 6 belgidan iborat bo'lishi kerak" }
			}
			const user = await userModel.findById(userId).select('+password')
			if (!user) {
				return { success: false, message: "Foydalanuvchi topilmadi" }
			}
			const isMatch = await bcrypt.compare(currentPassword, user.password)
			if (!isMatch) {
				return { success: false, message: "Joriy parol noto'g'ri" }
			}
			const saltRounds = 10
			user.password = await bcrypt.hash(newPassword, saltRounds)
			await user.save()
			return { success: true, message: "Parol muvaffaqiyatli yangilandi" }
		} catch (error) {
			console.error("Parolni yangilashda xatolik:", error)
			return { success: false, message: "Server xatosi" }
		}
	}
	async getAll(requesterRole, schoolId, date) {
		try {
			// date berilsa (Kirish-Chiqish sahifasidan o'tgan kunni ko'rish uchun) o'sha kun, aks holda bugun
			const todayDateString = dayjs().tz("Asia/Tashkent").format("YYYY-MM-DD")
			const dateString = (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : todayDateString
			const isToday = dateString === todayDateString

			const users = await userModel
				.find({
					role: { $in: ["viewer", "leader"] },
					isActive: { $ne: false },
					schoolId
				})
				.populate("sinf")

			const userIds = users.map(u => u._id)

			const attendances = await attandanceModel.find({
				dateString,
				user: { $in: userIds }
			})

			const logs = await attandanceLogModel.aggregate([
				{
					$match: {
						dateString,
						user: { $in: userIds }
					}
				},
				{ $sort: { date: 1 } },
				{
					$group: {
						_id: "$user",
						firstCheckInTime: { $first: "$checkInTime" },
						firstLogId: { $first: "$_id" },
						firstComment: { $first: "$comment" },

						lastLogId: { $last: "$_id" },
						lastCheckInTime: { $last: "$checkInTime" },
						lastCheckOutTime: { $last: "$checkOutTime" },
						lastComment: { $last: "$comment" }
					}
				}
			])

			const logMap = logs.reduce((map, log) => {
				map[log._id.toString()] = {
					lastLogId: log.lastLogId,
					lastCheckInTime: log.lastCheckInTime,
					lastCheckOutTime: log.lastCheckOutTime,
					lastComment: log.lastComment,
					firstCheckInTime: log.firstCheckInTime
				}
				return map
			}, {})

			const attendanceMap = attendances.reduce((map, a) => {
				map[a.user.toString()] = a
				return map
			}, {})

			// Sinxronlanmagan/xatolik bergan xodimlar map'i — admin panelida qizil kamera belgisi hover'ida sababi shundan ko'rsatiladi
			const pendingSyncs = isToday
				? await adduserModel.find({ schoolId }, "hodimID lastError attempts lastAttemptAt deviceResults")
				: []
			const pendingSyncMap = pendingSyncs.reduce((map, p) => {
				map[p.hodimID] = p
				return map
			}, {})

			const usersWithData = users.map(user => {
				const userIdStr = user._id.toString()
				const attendance = attendanceMap[userIdStr]
				const logData = logMap[userIdStr] || {}
				const pendingSync = pendingSyncMap[user.hodimID]

				let attendanceStatus = "kelmagan"
				if (attendance) {
					if (attendance.status === "tashqarida") attendanceStatus = "tashqarida"
					else if (attendance.status === "ishda") attendanceStatus = "ishda"
					else attendanceStatus = attendance.status || attendanceStatus
				}

				return stripJshr({
					...user.toObject(),
					attendanceStatus,
					lastLogId: logData.lastLogId || null,
					lastCheckInTime: logData.lastCheckInTime || null,
					lastCheckOutTime: logData.lastCheckOutTime || null,
					lastComment: logData.lastComment || null,
					firstCheckInTime: logData.firstCheckInTime || null,
					cameraError: pendingSync?.lastError || null,
					cameraAttempts: pendingSync?.attempts || 0,
					cameraLastAttemptAt: pendingSync?.lastAttemptAt || null,
					// Bir nechta kamera bo'lsa har birining alohida holati, masalan [{device, success, error}, ...]
					cameraResults: pendingSync?.deviceResults || []
				}, requesterRole)
			})

			return { success: true, users: usersWithData }
		} catch (error) {
			console.error("getAll xatolik:", error)
			return { success: false, message: "Server xatosi" }
		}
	}
	async closeLog() {
		try {
			const logs = await attandanceLogModel.find({ checkin: true, checkout: false })

			if (!logs.length) {
				return { success: true, message: "Hammasi allaqachon yopilgan" }
			}

			const now = new Date()
			let updatedCount = 0

			// Avval bu yerda faqat checkout/status belgilanardi, totalTime esa "0:00" qolib ketardi va attendanceGetOne'ning hisobiga mos kelmasdi — endi har log alohida yopilib totalTime'ga qo'shiladi
			for (const log of logs) {
				log.checkout = true
				log.checkOutTime = now
				log.autoClosed = true
				await log.save()

				const attendance = await attandanceModel.findOne({
					user: log.user,
					dateString: log.dateString,
					status: 'ishda'
				})
				if (attendance) {
					const workMs = log.checkOutTime - log.checkInTime
					const prevParts = attendance.totalTime.split(":").map(Number)
					const prevMinutes = (prevParts[0] || 0) * 60 + (prevParts[1] || 0)
					const totalMinutes = prevMinutes + Math.max(0, Math.floor(workMs / 60000))
					const hours = Math.floor(totalMinutes / 60)
					const minutes = totalMinutes % 60
					attendance.status = 'tashqarida'
					attendance.totalTime = `${hours}:${minutes.toString().padStart(2, '0')}`
					await attendance.save()
					updatedCount++
				}
			}

			// Ochiq logi yo'q, lekin baribir "ishda" holatida qolgan (izchillik buzilgan) yozuvlarni ham yopish
			const orphaned = await attandanceModel.updateMany(
				{ status: "ishda" },
				{ $set: { status: "tashqarida" } }
			)

			return {
				success: true,
				message: `${logs.length} ta log yopildi, ${updatedCount + orphaned.modifiedCount} ta attendance yangilandi`
			}
		} catch (error) {
			console.error("Xatolik:", error)
			return { success: false, message: "Xatolik yuz berdi", error: error.message }
		}
	}

	async getAllpost(requesterRole, schoolId) {
		try {
			const todayDateString = dayjs().tz("Asia/Tashkent").format("YYYY-MM-DD")
			const users = await userModel.find({ role: 'post', schoolId }).populate('sinf')

			const userIds = users.map(u => u._id)

			const attendances = await attandanceModel.find({
				user: { $in: userIds },
				dateString: todayDateString
			})

			const attendanceMap = new Map()
			attendances.forEach(a => {
				attendanceMap.set(a.user.toString(), a)
			})

			const usersWithAttendance = users.map(user => {
				const attendance = attendanceMap.get(user._id.toString())
				let attendanceStatus = "kelmagan"

				if (attendance) {
					if (attendance.status === "tashqarida") attendanceStatus = "tashqarida"
					else if (attendance.status === "ishda") attendanceStatus = "ishda"
					else attendanceStatus = attendance.status || attendanceStatus
				}

				return stripJshr({
					...user.toObject(),
					attendanceStatus
				}, requesterRole)
			})

			return { success: true, users: usersWithAttendance }
		} catch (error) {
			console.error("getAll xatolik:", error)
			return { success: false, message: "Server xatosi" }
		}
	}
	async getAlladmin(requesterRole, schoolId) {
		try {
			const todayDateString = dayjs().tz("Asia/Tashkent").format("YYYY-MM-DD")
			const users = await userModel.find({ role: 'admin', schoolId }).populate('sinf')

			const userIds = users.map(u => u._id)

			const attendances = await attandanceModel.find({
				user: { $in: userIds },
				dateString: todayDateString
			})

			const attendanceMap = new Map()
			attendances.forEach(a => {
				attendanceMap.set(a.user.toString(), a)
			})

			const usersWithAttendance = users.map(user => {
				const attendance = attendanceMap.get(user._id.toString())
				let attendanceStatus = "kelmagan"

				if (attendance) {
					if (attendance.status === "tashqarida") attendanceStatus = "tashqarida"
					else if (attendance.status === "ishda") attendanceStatus = "ishda"
					else attendanceStatus = attendance.status || attendanceStatus
				}

				return stripJshr({
					...user.toObject(),
					attendanceStatus
				}, requesterRole)
			})

			return { success: true, users: usersWithAttendance }
		} catch (error) {
			console.error("getAll xatolik:", error)
			return { success: false, message: "Server xatosi" }
		}
	}
	async getById(id, requesterRole, schoolId) {
		try {
			const todayDateString = dayjs().tz("Asia/Tashkent").format("YYYY-MM-DD")

			// findById emas — boshqa maktabning xodimi id orqali taxmin qilib
			// ko'rilmasligi uchun (IDOR)
			const user = await userModel.findOne({ _id: id, schoolId }).populate('sinf').lean()
			if (!user) {
				return { success: false, message: "Foydalanuvchi topilmadi." }
			}

			// Bugungi davomatni olish
			const attendance = await attandanceModel.findOne({
				user: id,
				dateString: todayDateString
			}).lean()

			const attendanceStatus = attendance ? attendance.status : "kelmadi"

			return {
				success: true,
				user: stripJshr({
					...user,
					attendanceStatus
				}, requesterRole)
			}
		} catch (error) {
			console.error("getById xatolik:", error)
			return { success: false, message: "Server xatosi", error: error.message }
		}
	}
	async getLavel(schoolId) {
		try {
			const users = await userModel.find({ schoolId })
			if (!users.length) return { success: true, lavel: 1 }
			const lavel = users.reduce((max, user) => user.lavel > max ? user.lavel : max, 0)
			return { success: true, lavel: lavel + 1 }
		} catch (error) {
			console.error("Lavelni olish xatolik:", error)
			return { success: false, message: "Server xatosi", error: error.message }
		}
	}
	async ReOrder({ users }, schoolId) {
		try {
			if (!Array.isArray(users) || users.length === 0) {
				return { success: false, message: "Foydalanuvchilar ro'yxati bo'sh" }
			}
			const bulkOps = users.map((user) => ({
				updateOne: {
					filter: { _id: user._id, schoolId },
					update: { $set: { lavel: user.lavel } },
				},
			}))
			await userModel.bulkWrite(bulkOps)

			return { success: true, message: "Tartib muvaffaqiyatli yangilandi" }
		} catch (error) {
			console.error("ReOrder xatolik:", error)
			return { success: false, message: "Server xatosi" }
		}
	}
	async userDelete(id, schoolId) {
		try {
			const uniqueUsername = `deleted_${id}_${Date.now()}`

			const user = await userModel.findOneAndUpdate(
				{ _id: id, schoolId },
				{
					isActive: false,
					username: uniqueUsername
				},
				{ new: true }
			)

			if (!user) {
				return {
					success: false,
					message: "Foydalanuvchi topilmadi"
				}
			}

			if (user.hodimID) {
				await deleteUserModel.deleteMany({ hodimID: user.hodimID, schoolId })
				await adduserModel.deleteMany({ hodimID: user.hodimID, schoolId })

				// Faqat kameraga haqiqatan yuborilgan (photo_camera=true) xodim uchun "kameradan o'chirish" navbatiga qo'yiladi
				const excludedRoles = ['post', 'admin', 'user']
				if (!excludedRoles.includes(user.role) && user.photo_camera) {
					await deleteUserModel.create({
						schoolId,
						full_name: user.fullName,
						action: 'delete',
						userId: user._id,
						hodimID: user.hodimID,
						photo: user.photo ? `/uploads/${user.photo}` : null
					})
				}
			}

			return {
				success: true,
				message: "Foydalanuvchi muvaffaqiyatli o'chirildi",
				user: { _id: user._id, fullName: user.fullName }
			}

		} catch (error) {
			console.error("userDelete xatolik:", error)
			return {
				success: false,
				message: "Server xatosi",
				error: error.message
			}
		}
	}

	// Admin hisobini o'chirish (userDelete bilan bir xil: foydalanuvchi nofaol qilinadi)
	async adminDelete(id, schoolId) {
		return this.userDelete(id, schoolId)
	}

	async postDelete(id, schoolId) {
		try {
			await userModel.findOneAndDelete({ _id: id, schoolId })
			return {
				success: true,
				message: "Foydalanuvchi muvaffaqiyatli o'chirildi"
			}
		} catch (error) {
			console.error("userDelete xatolik:", error)
			return {
				success: false,
				message: "Server xatosi",
				error: error.message
			}
		}
	}
	async addUserAll(schoolId) {
		try {
			const addusers = await adduserModel.find({ schoolId })
			if (addusers) {
				return { success: true, message: "Qo'shilgan userlar olindi", users: addusers }
			} else {
				return { success: false, message: "Qo'shilgan userlar yo'q", users: [] }
			}
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server error" }
		}
	}
	async updateUserAll(schoolId) {
		try {
			const addusers = await updateuserModel.find({ schoolId })
			if (addusers) {
				return { success: true, message: "Yangilangan userlar olindi", users: addusers }
			} else {
				return { success: false, message: "Yangilangan userlar yo'q", users: [] }
			}
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server error" }
		}
	}
	async deleteUserAll(schoolId) {
		try {
			const addusers = await deleteUserModel.find({ schoolId })
			if (addusers) {
				return { success: true, message: "O'chirilgan userlar olindi", users: addusers }
			} else {
				return { success: false, message: "O'chirilgan userlar yo'q", users: [] }
			}
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server error" }
		}
	}

	async addUsersDelete(data, schoolId) {
		try {
			const deleted = await adduserModel.deleteMany({
				hodimID: { $in: data }, schoolId
			})
			if (deleted.deletedCount > 0) {
				return {
					success: true,
					message: `${deleted.deletedCount} ta user ma'lumotlari o'chirildi`
				}
			}
			return {
				success: false,
				message: "O'chiriladigan user topilmadi"
			}
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server error" }
		}
	}
	async updateUsersDelete(data, schoolId) {
		try {
			const deleted = await updateuserModel.deleteMany({
				hodimID: { $in: data }, schoolId
			})
			if (deleted.deletedCount > 0) {
				return {
					success: true,
					message: `${deleted.deletedCount} ta user ma'lumotlari o'chirildi`
				}
			}
			return {
				success: false,
				message: "O'chiriladigan user topilmadi"
			}
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server error" }
		}
	}
	async deleteUsersDelete(data, schoolId) {
		try {
			if (!Array.isArray(data) || data.length === 0) {
				return {
					success: false,
					message: "hodimID lar yuborilmadi"
				}
			}

			const deleted = await deleteUserModel.deleteMany({
				hodimID: { $in: data }, schoolId
			})

			const updated = await userModel.updateMany(
				{ hodimID: { $in: data }, schoolId },
				{
					$set: {
						hodimID: null,
						photo_camera: false
					}
				}
			)

			if (deleted.deletedCount > 0 || updated.modifiedCount > 0) {
				return {
					success: true,
					message: `🧹 Tozalash yakunlandi:- Delete loglardan o‘chirildi: ${deleted.deletedCount} ta - Userlardan hodimID tozalandi: ${updated.modifiedCount} ta
        `.trim()
				}
			}

			return {
				success: false,
				message: "Mos keladigan user yoki log topilmadi"
			}

		} catch (error) {
			console.error("deleteUsersDelete xatolik:", error)
			return {
				success: false,
				message: "Server xatosi"
			}
		}
	}




	async photoCamera(hodimID, photo_camera, schoolId) {
		try {
			const user = await userModel.findOne({ hodimID, schoolId })
			if (!user) {
				return { success: false, message: "Hodim topilmadi" }
			}
			user.photo_camera = photo_camera
			await user.save()
			return { success: true, message: "Xodimning rasm statusi o'zgartirildi" }
		} catch (error) {
			console.log(error)
			return { success: false, message: "Server error" }
		}
	}





}
module.exports = new UserService()



