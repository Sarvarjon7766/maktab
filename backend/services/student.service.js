const studentModel = require('../models/student.model')
const sinfModel = require('../models/sinf.model')
const ExcelJS = require('exceljs')
const adduserModel = require('../models/add.user.model')
const deleteUserModel = require('../models/delete.user.model')
const { pickFields, sinfBelongsToSchool } = require('../utils/safeInput')

// Mass-assignment himoyasi: faqat shu maydonlar so'rovdan olinadi (schoolId, isActive,
// photo_camera, studentIdNumber, createdBy, parentPhoneKey hech qachon)
const STUDENT_WRITABLE_FIELDS = ['fullName', 'sinf', 'birthday', 'gender', 'parentName', 'parentPhone', 'photo']

// O'quvchi rasmini kamera sinxronizatsiya navbatiga (xodimlar bilan bir xil outbox) qo'yadi. Kamera dasturi
// GET /api/employees/pending orqali oladi, identifikator = studentIdNumber.
async function queueForCamera(student, action) {
	if (!student?.photo || !student.studentIdNumber) return false
	await adduserModel.deleteMany({ hodimID: student.studentIdNumber, schoolId: student.schoolId })
	await deleteUserModel.deleteMany({ hodimID: student.studentIdNumber, schoolId: student.schoolId })
	await adduserModel.create({ schoolId: student.schoolId, kind: 'student', studentId: student._id, full_name: student.fullName, action, hodimID: student.studentIdNumber, photo: `/uploads/${student.photo}` })
	return true
}

class StudentService {
	async create(data, creatorId, schoolId) {
		try {
			const rest = pickFields(data, STUDENT_WRITABLE_FIELDS)
			if (!(await sinfBelongsToSchool(rest.sinf, schoolId))) {
				return { success: false, message: "Sinf topilmadi" }
			}
			const student = new studentModel({
				...rest,
				schoolId,
				createdBy: creatorId || null
			})
			student.studentIdNumber = student._id.toString()
			await student.save()
			await queueForCamera(student, 'create').catch(e => console.error('Student camera queue:', e.message))
			return { success: true, message: "O'quvchi qo'shildi", student }
		} catch (error) {
			console.error("Student create xatolik:", error)
			return { success: false, message: "Server xatosi" }
		}
	}

	async getAll(schoolId, sinfId) {
		try {
			const filter = { schoolId, isActive: { $ne: false } }
			if (sinfId) filter.sinf = sinfId
			const [docs, queue] = await Promise.all([
				studentModel.find(filter).populate('sinf', 'name').sort({ fullName: 1 }),
				adduserModel.find({ schoolId, kind: 'student' }, 'hodimID lastError attempts lastAttemptAt deviceResults')
			])
			const q = new Map(queue.map(e => [e.hodimID, e]))
			// Kameraga yuborish holati: navbatda turgan yozuvdan (xato sababi, urinishlar, har bir kamera natijasi)
			const students = docs.map(d => {
				const e = q.get(d.studentIdNumber)
				return { ...d.toObject(), cameraQueued: !!e, cameraError: e?.lastError || null, cameraAttempts: e?.attempts || 0, cameraResults: e?.deviceResults || [] }
			})
			return { success: true, students }
		} catch (error) {
			console.error("Student getAll xatolik:", error)
			return { success: false, message: "Server xatosi" }
		}
	}

	async getById(id, schoolId) {
		try {
			const student = await studentModel.findOne({ _id: id, schoolId }).populate('sinf', 'name').lean()
			if (!student) return { success: false, message: "O'quvchi topilmadi" }
			return { success: true, student }
		} catch (error) {
			console.error("Student getById xatolik:", error)
			return { success: false, message: "Server xatosi" }
		}
	}

	async update(id, data, schoolId) {
		try {
			data = pickFields(data, STUDENT_WRITABLE_FIELDS)
			if ('sinf' in data && !(await sinfBelongsToSchool(data.sinf, schoolId))) {
				return { success: false, message: "Sinf topilmadi" }
			}
			if (data.photo) data = { ...data, photo_camera: false } // yangi rasm: kamerada eskisi qoladi, qayta yuborish kerak
			const student = await studentModel.findOneAndUpdate(
				{ _id: id, schoolId },
				data,
				{ new: true, runValidators: true }
			)
			if (student && data.photo) await queueForCamera(student, 'update').catch(e => console.error('Student camera queue:', e.message))
			if (!student) return { success: false, message: "O'quvchi topilmadi" }
			return { success: true, message: "O'quvchi ma'lumotlari yangilandi", student }
		} catch (error) {
			console.error("Student update xatolik:", error)
			return { success: false, message: "Server xatosi", error: error.message }
		}
	}

	// Xodimdagi kabi soft-delete — davomat tarixidagi student._id havolasi
	// buzilmasligi uchun
	async remove(id, schoolId) {
		try {
			const student = await studentModel.findOneAndUpdate(
				{ _id: id, schoolId },
				{ isActive: false },
				{ new: true }
			)
			if (!student) return { success: false, message: "O'quvchi topilmadi" }
			if (student.studentIdNumber) {
				// Kameradan ham o'chirish: yuborilmagan rasm navbati bekor, kameraga yuborilgan bo'lsa o'chirish navbatiga qo'yiladi
				await adduserModel.deleteMany({ hodimID: student.studentIdNumber, schoolId })
				if (student.photo_camera) await deleteUserModel.create({ schoolId, kind: 'student', studentId: student._id, full_name: student.fullName, hodimID: student.studentIdNumber }).catch(() => {})
			}
			// O'chirilgan o'quvchining ota-onalariga endi xabar bormasligi uchun Telegram ulanishlari o'chiriladi
			require('../models/parent.model').ParentLink.updateMany({ student: student._id }, { active: false }).catch(() => {})
			return { success: true, message: "O'quvchi o'chirildi" }
		} catch (error) {
			console.error("Student remove xatolik:", error)
			return { success: false, message: "Server xatosi" }
		}
	}

	// Rasmi bor, lekin kameraga yuborilmagan/rad etilgan o'quvchilarni (yoki tanlanganlarini) qayta navbatga qo'yadi
	async resendToCamera(schoolId, { ids = [], all = false } = {}) {
		try {
			const filter = { schoolId, isActive: { $ne: false }, photo: { $nin: [null, ''] } }
			if (!all) filter._id = { $in: ids }
			else filter.photo_camera = { $ne: true }
			const list = await studentModel.find(filter)
			let queued = 0
			for (const st of list) { if (await queueForCamera(st, 'create')) queued++ }
			return { success: true, queued, message: `${queued} ta o'quvchi kameraga yuborish navbatiga qo'yildi` }
		} catch (error) {
			console.error('Student resend xatolik:', error)
			return { success: false, message: 'Server xatosi' }
		}
	}

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
			if (typeof v === 'object' && v.text) return String(v.text).trim()
			if (typeof v === 'object' && v.result !== undefined) return String(v.result).trim()
			return String(v).trim()
		}

		const normalizeHeader = (text) => String(text).toLowerCase().replace(/[\s.'ʼ`’()]/g, '')
		const HEADER_ALIASES = {
			fullName: ['fish', 'fio', 'toliqism', 'ismsharif'],
			sinf: ['sinf', 'sinfi'],
			parentName: ['otaonasi', 'otaonasismi', 'vasiysi'],
			parentPhone: ['otaonatelefoni', 'telefon', 'telefonraqami'],
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

		const missingRequired = ['fullName', 'sinf'].filter(f => !(f in colIndex))
		if (missingRequired.length) {
			return {
				success: false,
				message: `Excel'ning 1-qatorida (sarlavhada) quyidagi ustunlar topilmadi: ${missingRequired.map(f => ({ fullName: 'F.I.Sh', sinf: 'Sinf' }[f])).join(', ')}.`
			}
		}

		const sinfs = await sinfModel.find({ schoolId }).lean()
		const sinfByName = new Map(sinfs.map(d => [d.name.trim().toLowerCase(), d._id]))

		const rows = []
		let successCount = 0
		let failCount = 0

		for (let rowNumber = 2; rowNumber <= sheet.lastRow.number; rowNumber++) {
			const row = sheet.getRow(rowNumber)
			if (!row.hasValues) continue

			const fullName = getCell(row, colIndex.fullName)
			const sinfNameRaw = getCell(row, colIndex.sinf)
			const parentName = colIndex.parentName ? getCell(row, colIndex.parentName) : ''
			const parentPhone = colIndex.parentPhone ? getCell(row, colIndex.parentPhone) : ''

			const rowResult = { row: rowNumber, fullName: fullName || `(${rowNumber}-qator)`, success: false, message: '' }

			if (!fullName || !sinfNameRaw) {
				rowResult.message = "F.I.Sh va Sinf majburiy — o'tkazib yuborildi"
				failCount++
				rows.push(rowResult)
				continue
			}

			const sinfId = sinfByName.get(sinfNameRaw.toLowerCase())
			if (!sinfId) {
				rowResult.message = `"${sinfNameRaw}" nomli sinf topilmadi — o'tkazib yuborildi`
				failCount++
				rows.push(rowResult)
				continue
			}

			try {
				const student = new studentModel({
					fullName,
					sinf: sinfId,
					parentName: parentName || undefined,
					parentPhone: parentPhone || undefined,
					schoolId,
					createdBy: creatorId
				})
				student.studentIdNumber = student._id.toString()
				await student.save()
				rowResult.success = true
				successCount++
			} catch (err) {
				rowResult.message = err.message || "Noma'lum xatolik"
				failCount++
			}

			rows.push(rowResult)
		}

		return {
			success: true,
			message: `${successCount} ta o'quvchi qo'shildi${failCount ? `, ${failCount} ta qatorda muammo` : ''}`,
			successCount,
			failCount,
			rows
		}
	}
}

module.exports = new StudentService()
