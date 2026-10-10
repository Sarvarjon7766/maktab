const { Schema, model } = require('mongoose')

// Platforma miqyosidagi sinf darajasi (1-sinf, 2-sinf ... 11-sinf). Tizim egasi yaratadi;
// maktab adminlari shu darajalar ichida parallel sinflar (A, B, V ...) yaratadi
const gradeSchema = new Schema({
	number: { type: Number, required: true, unique: true, min: 1, max: 12 },
	name: { type: String, required: true, trim: true },
	isActive: { type: Boolean, default: true }
}, { timestamps: true })

module.exports = model('Grade', gradeSchema)
