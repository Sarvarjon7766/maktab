const { Schema, model, default: mongoose } = require('mongoose')

// Sinfxona kamerasi kadrida sanalgan odamlar soni (yuz tanilmaydi). Har tahlil — bitta yozuv.
// Kadrning o'zi saqlanmaydi (faqat kameraning oxirgi kadri private/hik-vision da ustiga yoziladi)
const hikVisionMetricSchema = new Schema({
	schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
	camera: { type: mongoose.Schema.Types.ObjectId, ref: 'HikCamera', required: true },
	sinfId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sinf', default: null },
	count: { type: Number, required: true },
	// Oldingi kadrga nisbatan harakat: odamlarning qanchasi joyidan siljigan yoki almashgan (0..1). Oldingi kadr yo'q bo'lsa null
	activity: { type: Number, default: null },
	// Odam holatlari (skelet bo'yicha, taxminiy): tahlil qilingan, o'tirgan, tik turgan, boshi egilgan, qo'l ko'targan, orqasi bilan, yon tomonga
	pose: {
		type: { analyzed: Number, seated: Number, standing: Number, backTurned: Number, sideTurned: Number, headDown: Number, raised: Number },
		default: undefined, _id: false
	},
	// Odam qutilari yassi ro'yxatda [x1,y1,x2,y2,...]: keyingi o'lchovda harakatni hisoblash uchun (server qayta ishga tushsa ham)
	boxes: { type: [Number], default: undefined },
	time: { type: Date, required: true },
	hour: { type: Number, required: true },
	dateString: { type: String, required: true },
	// Tahlil davomiyligi (ms) — samaradorlikni kuzatish uchun
	ms: { type: Number, default: 0 }
})

hikVisionMetricSchema.index({ camera: 1, time: -1 })
// Jonli panel: maktab bo'yicha oxirgi soat o'lchovlari (har 15-20 soniyada so'raladi)
hikVisionMetricSchema.index({ schoolId: 1, time: -1 })
hikVisionMetricSchema.index({ schoolId: 1, dateString: 1, sinfId: 1 })
// 60 kundan keyin avtomatik o'chadi
hikVisionMetricSchema.index({ time: 1 }, { expireAfterSeconds: 60 * 24 * 3600 })

module.exports = model('HikVisionMetric', hikVisionMetricSchema)
