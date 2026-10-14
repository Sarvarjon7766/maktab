const { Schema, model, default: mongoose } = require('mongoose')

// Sinfxona kamerasida yuz orqali xodim (o'qituvchi) ko'ringani: kim, qaysi kamerada, qachon. «Sinfxonada o'qituvchi bormi» shundan aniqlanadi.
// O'quvchilardagi ClassroomPresence bilan bir xil g'oya, faqat xodim uchun.
const staffPresenceSchema = new Schema({
	schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	camera: { type: mongoose.Schema.Types.ObjectId, ref: 'HikCamera', required: true },
	sinfId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sinf', default: null }, // kamera biriktirilgan sinf
	dateString: { type: String, required: true },
	firstSeen: { type: Date, required: true },
	lastSeen: { type: Date, required: true },
	hits: { type: Number, default: 1 },
	bestScore: { type: Number, default: 0 },
	attendanceAt: { type: Date, default: null }, // yuz orqali davomatga yozilgan oxirgi vaqt
	attendanceAction: { type: String, enum: ['in', 'out', null], default: null }
})

staffPresenceSchema.index({ user: 1, camera: 1, dateString: 1 }, { unique: true })
staffPresenceSchema.index({ camera: 1, lastSeen: -1 })
// 120 kundan keyin avtomatik o'chadi
staffPresenceSchema.index({ lastSeen: 1 }, { expireAfterSeconds: 120 * 86400 })

module.exports = model('StaffPresence', staffPresenceSchema)
