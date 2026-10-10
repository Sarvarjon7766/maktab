// O'quvchilarning sababli kelmagan kunlari (xodimlar uchun excuse.service.js ning o'quvchi varianti)
const mongoose = require('mongoose')
const StudentExcuse = require('../models/student.excuse.model')
const studentModel = require('../models/student.model')
const sinfModel = require('../models/sinf.model')

const LABELS = { kasallik: 'Kasallik', oilaviy: 'Oilaviy sabab', musobaqa: 'Musobaqa / tadbir', boshqa: 'Boshqa sabab' }
const { isDate } = require('../utils/dateStr')
const validId = (id) => mongoose.isValidObjectId(id)
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
const shift = (d, days) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + days); return x.toISOString().slice(0, 10) }
const shape = (e) => ({ _id: e._id, student: e.student, type: e.type, label: LABELS[e.type] || LABELS.boshqa, comment: e.comment || '', startDate: e.startDate, endDate: e.endDate || null })

class StudentExcuseService {
	get LABELS() { return LABELS }

	// Bir sana uchun: Map(o'quvchiId -> sabab). Maktab bo'yicha (butun maktab sinflari uchun bir so'rov)
	async mapForDate(dateString, schoolId) {
		const rows = await StudentExcuse.find({ schoolId, startDate: { $lte: dateString }, $or: [{ endDate: null }, { endDate: { $gte: dateString } }] }).sort({ createdAt: -1 }).lean()
		const map = new Map()
		for (const e of rows) if (!map.has(String(e.student))) map.set(String(e.student), shape(e))
		return map
	}

	// Sinf ro'yxati (sabab kiritish uchun) va shu kunga amal qiladigan sabablar
	async forSinf(schoolId, sinfId, dateString) {
		if (!validId(sinfId)) return { success: false, message: "Sinf id noto'g'ri" }
		const sinf = await sinfModel.findOne({ _id: sinfId, schoolId }).select('name').lean()
		if (!sinf) return { success: false, message: 'Sinf topilmadi' }
		const date = isDate(dateString) ? dateString : todayStr()
		const [students, excuses] = await Promise.all([
			studentModel.find({ schoolId, sinf: sinfId, isActive: { $ne: false } }).select('fullName').sort({ fullName: 1 }).lean(),
			StudentExcuse.find({ schoolId, sinf: sinfId, startDate: { $lte: date }, $or: [{ endDate: null }, { endDate: { $gte: date } }] }).sort({ createdAt: -1 }).lean()
		])
		const names = new Map(students.map((s) => [String(s._id), s.fullName]))
		return {
			success: true, date, sinf: sinf.name, types: LABELS,
			students: students.map((s) => ({ _id: s._id, fullName: s.fullName })),
			excuses: excuses.map((e) => ({ ...shape(e), fullName: names.get(String(e.student)) || "O'chirilgan o'quvchi" }))
		}
	}

	async create(schoolId, userId, { studentId, type, comment, startDate, endDate }) {
		if (!validId(studentId)) return { success: false, message: "O'quvchi tanlanmagan" }
		const student = await studentModel.findOne({ _id: studentId, schoolId, isActive: { $ne: false } }).select('sinf').lean()
		if (!student) return { success: false, message: "O'quvchi topilmadi" }
		const start = isDate(startDate) ? startDate : todayStr()
		const end = endDate ? (isDate(endDate) ? endDate : null) : null
		if (endDate && !end) return { success: false, message: "Tugash sanasi noto'g'ri" }
		if (end && end < start) return { success: false, message: "Tugash sanasi boshlanishdan oldin bo'lishi mumkin emas" }
		const row = await StudentExcuse.create({ schoolId, student: student._id, sinf: student.sinf, startDate: start, endDate: end, type: LABELS[type] ? type : 'boshqa', comment: String(comment || '').slice(0, 300), createdBy: userId })
		return { success: true, excuse: shape(row) }
	}

	// "Qaytdi": sabab kecha tugagan hisoblanadi (bugundan boshlab o'quvchi yana kutiladi). Bugundan boshlangan bo'lsa o'chadi
	async close(schoolId, id) {
		if (!validId(id)) return { success: false, message: "Id noto'g'ri" }
		const e = await StudentExcuse.findOne({ _id: id, schoolId })
		if (!e) return { success: false, message: 'Sabab topilmadi' }
		const yesterday = shift(todayStr(), -1)
		if (e.startDate > yesterday) await e.deleteOne()
		else { e.endDate = yesterday; await e.save() }
		return { success: true }
	}

	async remove(schoolId, id) {
		if (!validId(id)) return { success: false, message: "Id noto'g'ri" }
		const r = await StudentExcuse.deleteOne({ _id: id, schoolId })
		return r.deletedCount ? { success: true } : { success: false, message: 'Sabab topilmadi' }
	}
}

module.exports = new StudentExcuseService()
