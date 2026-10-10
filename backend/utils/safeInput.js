const path = require('path')
const mongoose = require('mongoose')

// Kiruvchi so'rov tanasidan faqat ruxsat etilgan maydonlarni oladi (mass-assignment
// himoyasi). '$' bilan boshlanuvchi yoki '.' ni o'z ichiga olgan kalitlar hech qachon
// o'tmaydi; obyekt/massiv qiymatlar (NoSQL operator in'ektsiyasi) tashlab yuboriladi.
function pickFields(data, allowed) {
	const out = {}
	if (!data || typeof data !== 'object') return out
	for (const key of allowed) {
		if (key.startsWith('$') || key.includes('.')) continue
		if (!Object.prototype.hasOwnProperty.call(data, key)) continue
		const v = data[key]
		if (v !== null && typeof v === 'object' && !(v instanceof Date)) continue
		out[key] = v
	}
	return out
}

const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads')

// Yuklangan fayl nomini uploads papkasi ICHIDAGI to'liq yo'lga aylantiradi,
// aks holda null (path traversal / mutlaq yo'l himoyasi)
function resolveUploadPath(name) {
	if (!name || typeof name !== 'string') return null
	const base = path.basename(name)
	if (!base || base === '.' || base === '..') return null
	const full = path.resolve(UPLOADS_DIR, base)
	if (path.dirname(full) !== UPLOADS_DIR) return null
	return full
}

// sinf shu maktabga tegishlimi (bo'sh qiymat — "sinfsiz" uchun ruxsat)
async function sinfBelongsToSchool(sinfId, schoolId) {
	const sinfModel = require('../models/sinf.model')
	if (!mongoose.isValidObjectId(sinfId)) return false
	return !!(await sinfModel.exists({ _id: sinfId, schoolId }))
}

module.exports = { pickFields, UPLOADS_DIR, resolveUploadPath, sinfBelongsToSchool }
