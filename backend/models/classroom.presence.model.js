const { Schema, model, default: mongoose } = require('mongoose')

// Sinfxona kamerasida yuz orqali "ko'rindi" dalili: kim, qaysi kamerada, qachon va qancha kadrda. Bu DAVOMAT EMAS, dalil:
// tanilmagan o'quvchi "kelmagan" degani emas (orqadagi yuzlar kichik). Kelmaganlikni faqat o'qituvchi/terminal belgilaydi.
const presenceSchema = new Schema({
	schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
	sinfId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sinf', default: null }, // o'quvchining sinfi
	student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
	camera: { type: mongoose.Schema.Types.ObjectId, ref: 'HikCamera', required: true },
	roomSinf: { type: mongoose.Schema.Types.ObjectId, ref: 'Sinf', default: null }, // xona o'sha payt qaysi sinf deb aniqlangan
	roomSource: { type: String, default: '' }, // 'assigned' (kameraga biriktirilgan) | 'inferred' (kadrdan aniqlangan)
	dateString: { type: String, required: true },
	firstSeen: { type: Date, required: true },
	lastSeen: { type: Date, required: true },
	hits: { type: Number, default: 1 },
	bestScore: { type: Number, default: 0 },
	bestSize: { type: Number, default: 0 },
	status: { type: String, enum: ['tentative', 'confirmed'], default: 'tentative' },
	// Admin/o'qituvchi tekshiruvi: 'ok' — to'g'ri tanilgan, 'wrong' — xato. Aniqlikni o'lchash va chegarani sozlash uchun
	attendanceAt: { type: Date, default: null }, // yuz orqali davomatga oxirgi marta yozilgan vaqt
	attendanceAction: { type: String, enum: ['in', 'out', null], default: null }, // oxirgi yozilgan harakat: kirdi / chiqdi
	verdict: { type: String, enum: ['ok', 'wrong', null], default: null },
})

presenceSchema.index({ student: 1, camera: 1, dateString: 1 }, { unique: true })
presenceSchema.index({ schoolId: 1, dateString: 1, sinfId: 1 })
// 120 kundan keyin avtomatik o'chadi (saqlash muddati)
presenceSchema.index({ lastSeen: 1 }, { expireAfterSeconds: 120 * 86400 })

module.exports = model('ClassroomPresence', presenceSchema)
