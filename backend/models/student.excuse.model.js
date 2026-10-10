const { Schema, model, default: mongoose } = require('mongoose')

// O'quvchining sababli kelmagan kunlari (kasallik, oilaviy sabab, musobaqa...). Sinf rahbari yoki maktab admini kiritadi.
// Sana oralig'i [startDate, endDate]; endDate=null — muddatsiz (qaytguncha). Shu kunlarda o'quvchi sinfda KUTILMAYDI:
// aqlli kuzatuv va davomat tahlili kutilgan sonni hisoblashda uni chiqarib tashlaydi.
const studentExcuseSchema = new Schema({
	schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
	student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
	// Denormalizatsiya: sinf bo'yicha tez qidirish uchun
	sinf: { type: mongoose.Schema.Types.ObjectId, ref: 'Sinf', required: true },
	startDate: { type: String, required: true }, // YYYY-MM-DD
	endDate: { type: String, default: null }, // YYYY-MM-DD | null = muddatsiz
	type: { type: String, enum: ['kasallik', 'oilaviy', 'musobaqa', 'boshqa'], default: 'boshqa' },
	comment: { type: String, default: '', trim: true },
	createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false }
}, { timestamps: true })

studentExcuseSchema.index({ schoolId: 1, startDate: 1, endDate: 1 })
studentExcuseSchema.index({ student: 1, startDate: 1 })

module.exports = model('StudentExcuse', studentExcuseSchema)

