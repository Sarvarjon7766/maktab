const gradeModel = require('../models/grade.model')
const sinfModel = require('../models/sinf.model')

const DEFAULT_GRADES = Array.from({ length: 11 }, (_, i) => i + 1)

class GradeService {
	// Bo'sh bo'lsa 1–11-sinflar avtomatik yaratiladi
	async ensureDefaults() {
		if (await gradeModel.estimatedDocumentCount() > 0) return
		try { await gradeModel.insertMany(DEFAULT_GRADES.map(number => ({ number, name: `${number}-sinf` })), { ordered: false }) } catch { /* boshqa so'rov allaqachon yaratgan */ }
	}

	// Har daraja uchun butun tizimdagi parallel sinflar soni bilan (maktablar bo'yicha)
	async list() {
		await this.ensureDefaults()
		const [grades, counts] = await Promise.all([
			gradeModel.find().sort({ number: 1 }).lean(),
			sinfModel.aggregate([{ $group: { _id: '$grade', sections: { $sum: 1 }, schools: { $addToSet: '$schoolId' } } }])
		])
		const map = new Map(counts.map(c => [c._id, c]))
		return { success: true, grades: grades.map(g => ({ ...g, sections: map.get(g.number)?.sections || 0, schools: map.get(g.number)?.schools.length || 0 })) }
	}

	async create({ number, name }) {
		const n = Number(number)
		if (!Number.isInteger(n) || n < 1 || n > 12) return { success: false, message: "Daraja 1 dan 12 gacha bo'lishi kerak" }
		if (await gradeModel.findOne({ number: n })) return { success: false, message: 'Bunday daraja mavjud' }
		const grade = await gradeModel.create({ number: n, name: String(name || '').trim() || `${n}-sinf` })
		return { success: true, grade }
	}

	async update(id, { name, isActive }) {
		const grade = await gradeModel.findById(id)
		if (!grade) return { success: false, message: 'Daraja topilmadi' }
		if (name !== undefined && String(name).trim()) grade.name = String(name).trim()
		if (typeof isActive === 'boolean') grade.isActive = isActive
		await grade.save()
		return { success: true, grade }
	}

	async remove(id) {
		const grade = await gradeModel.findById(id)
		if (!grade) return { success: false, message: 'Daraja topilmadi' }
		const used = await sinfModel.countDocuments({ grade: grade.number })
		if (used) return { success: false, message: `Bu darajada ${used} ta sinf bor. Avval ularni o'chiring yoki darajani o'chirib qo'ying (faol emas)` }
		await grade.deleteOne()
		return { success: true }
	}
}

module.exports = new GradeService()
