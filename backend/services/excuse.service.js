// Xodimlarning sababli kelmagan kunlari: mehnat ta'tili, xizmat safari, kasallik, boshqa sabab.
// Manba — EmployeeComment (maktab admini xodimga yozgan komment). Komment sanalarni qamrab oladi: startDate dan endDate gacha
// (endDate yo'q bo'lsa muddatsiz). Xodim shu kuni kelmagan bo'lsa, u "sababli kelmagan" hisoblanadi va statistikada sababi bilan ko'rinadi.
const EmployeeComment = require('../models/employee.comment.model')
const userModel = require('../models/user.model')
const attendanceModel = require('../models/attandance.model')

const STAFF_ROLES = ['viewer', 'leader']
const CAME = ['ishda', 'tashqarida']
const LABELS = { tatil: "Mehnat ta'tili", safar: 'Xizmat safari', kasallik: 'Kasallik', boshqa: 'Boshqa sabab' }
const TYPES = Object.keys(LABELS)

const covers = (c, dateString) => c.startDate <= dateString && (!c.endDate || c.endDate >= dateString)
const shape = (c) => ({ _id: c._id, type: c.type, label: LABELS[c.type] || LABELS.boshqa, comment: c.comment, startDate: c.startDate, endDate: c.endDate || null, closed: !!c.closed })

class ExcuseService {
	get LABELS() { return LABELS }
	get TYPES() { return TYPES }
	label(type) { return LABELS[type] || LABELS.boshqa }

	// Bir sana uchun: { xodimId: {type,label,comment,...} } — faqat BIR kun uchun amal qiluvchi kommentlar
	async mapForDate(dateString, schoolIds = null) {
		const filter = { startDate: { $lte: dateString }, $or: [{ endDate: null }, { endDate: { $gte: dateString } }] }
		if (schoolIds) filter.schoolId = { $in: schoolIds }
		const comments = await EmployeeComment.find(filter).sort({ createdAt: -1 }).select('employee schoolId type comment startDate endDate closed').lean()
		const map = new Map()
		for (const c of comments) if (!map.has(String(c.employee))) map.set(String(c.employee), { ...shape(c), schoolId: c.schoolId })
		return map
	}

	// Maktablar kesimida: kelmagan va sababli xodimlar soni (sabab turi bo'yicha). Bugungi (yoki tanlangan) kun
	async countsBySchool(dateString, schoolIds) {
		const map = await this.mapForDate(dateString, schoolIds)
		if (!map.size) return new Map()
		const ids = [...map.keys()]
		const [users, came] = await Promise.all([
			userModel.find({ _id: { $in: ids }, role: { $in: STAFF_ROLES }, isActive: { $ne: false } }).select('_id schoolId').lean(),
			attendanceModel.find({ user: { $in: ids }, dateString, status: { $in: CAME } }).select('user').lean()
		])
		const cameSet = new Set(came.map(a => String(a.user)))
		const out = new Map()
		for (const u of users) {
			if (cameSet.has(String(u._id))) continue
			const e = map.get(String(u._id)); const k = String(u.schoolId)
			if (!out.has(k)) out.set(k, { total: 0, byType: { tatil: 0, safar: 0, kasallik: 0, boshqa: 0 } })
			const x = out.get(k); x.total++; x.byType[e.type in x.byType ? e.type : 'boshqa']++
		}
		return out
	}

	// Bitta xodim uchun davr bo'yicha kommentlar (kunma-kun sabab aniqlash uchun)
	async forEmployee(employeeId, from, to) {
		const list = await EmployeeComment.find({ employee: employeeId, startDate: { $lte: to }, $or: [{ endDate: null }, { endDate: { $gte: from } }] }).sort({ createdAt: -1 }).select('type comment startDate endDate closed').lean()
		return { list, on: (dateString) => { const c = list.find(x => covers(x, dateString)); return c ? shape(c) : null } }
	}
}

module.exports = new ExcuseService()
module.exports.shape = shape
module.exports.covers = covers
