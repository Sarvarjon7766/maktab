const sinfModel = require('../models/sinf.model')
const gradeModel = require('../models/grade.model')
const GradeService = require('./grade.service')

const mongoose = require('mongoose')

const LETTER = /^[\p{L}\d]{1,3}$/u

// Daraja platformada mavjud va faol bo'lishi, harf esa 1–3 belgi bo'lishi kerak; nom "5-A" ko'rinishida yig'iladi
async function resolveName(grade, letter) {
	await GradeService.ensureDefaults()
	const g = Number(grade)
	const l = String(letter || '').trim().toUpperCase()
	if (!Number.isInteger(g)) return { error: 'Sinf darajasini tanlang' }
	if (!LETTER.test(l)) return { error: "Sinf harfi 1–3 ta harf yoki raqam bo'lishi kerak (masalan A, B)" }
	const level = await gradeModel.findOne({ number: g })
	if (!level) return { error: "Bunday sinf darajasi tizimda yo'q" }
	return { grade: g, letter: l, name: `${g}-${l}`, level }
}

// Sinf rahbari shu maktab xodimi bo'lishi shart (bo'sh qiymat — rahbarsiz)
async function headInSchool(head, schoolId) {
	if (!head) return true
	if (!mongoose.isValidObjectId(head)) return false
	return !!(await require('../models/user.model').exists({ _id: head, schoolId }))
}

class SinfService {
	async create(data, schoolId) {
		try {
			const r = await resolveName(data.grade, data.letter)
			if (r.error) return { success: false, message: r.error }
			if (!r.level.isActive) return { success: false, message: `${r.level.name} darajasi yopilgan. Tizim egasiga murojaat qiling` }
			if (await sinfModel.findOne({ name: r.name, schoolId })) return { success: false, message: `${r.name} sinfi allaqachon qo'shilgan` }
			if (!(await headInSchool(data.head, schoolId))) return { success: false, message: "Sinf rahbari topilmadi" }
			await sinfModel.create({ schoolId, grade: r.grade, letter: r.letter, name: r.name, description: String(data.description || '').trim(), head: data.head || null })
			return { success: true, message: "Sinf muvafaqiyatli qo'shildi" }
		} catch (error) {
			console.error('Sinf service xatosi:', error)
			return { success: false, message: 'server error' }
		}
	}
	async getAll(schoolId) {
		try {
			const sinfs = await sinfModel.find({ schoolId }).populate('head', 'fullName position').sort({ grade: 1, letter: 1, name: 1 })
			return { success: true, sinfs: sinfs || [] }
		} catch (error) {
			console.error('Sinf service xatosi:', error)
			return { success: false, message: 'server error' }
		}
	}
	async update(id, data, schoolId) {
		try {
			// findById emas — boshqa maktabning sinfi id orqali taxmin qilib tahrirlanmasligi uchun
			const sinf = await sinfModel.findOne({ _id: id, schoolId })
			if (!sinf) return { success: false, message: 'Sinf topilmadi' }
			if (data.grade !== undefined || data.letter !== undefined) {
				const r = await resolveName(data.grade ?? sinf.grade, data.letter ?? sinf.letter)
				if (r.error) return { success: false, message: r.error }
				if (r.name !== sinf.name) {
					if (await sinfModel.findOne({ name: r.name, schoolId, _id: { $ne: sinf._id } })) return { success: false, message: `${r.name} sinfi allaqachon mavjud` }
					sinf.grade = r.grade; sinf.letter = r.letter; sinf.name = r.name
				}
			}
			if (data.description !== undefined) sinf.description = String(data.description || '').trim()
			if (data.head !== undefined) {
				if (!(await headInSchool(data.head, schoolId))) return { success: false, message: "Sinf rahbari topilmadi" }
				sinf.head = data.head || null
			}
			await sinf.save()
			return { success: true }
		} catch (error) {
			console.error('Sinf yangilashda xatolik:', error)
			console.error('Sinf service xatosi:', error)
			return { success: false, message: 'server error' }
		}
	}
}
module.exports = new SinfService()
