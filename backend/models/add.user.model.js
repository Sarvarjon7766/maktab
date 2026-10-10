const { model, Schema } = require('mongoose')

const adduserSchema = new Schema({
	// server_proxy faqat O'ZINING maktabiga tegishli navbatni tortib olishi uchun
	schoolId: {
		type: Schema.Types.ObjectId,
		ref: 'School',
		index: true,
		required: true
	},
	action: {
		type: String,
		required: true,
		default: 'create'
	},
	full_name:{
		type:String,
		required:true
	},
	// Xodim yozuvi uchun majburiy; o'quvchi yozuvlarida studentId ishlatiladi
	userId: {
		type: Schema.Types.ObjectId,
		required: function () { return this.kind !== 'student' },
		ref: 'User'
	},
	kind: {
		type: String,
		enum: ['user', 'student'],
		default: 'user'
	},
	studentId: {
		type: Schema.Types.ObjectId,
		ref: 'Student',
		default: null
	},
	hodimID: {
		type: String,
		required: true
	},
	photo: String,
	createdAt: {
		type: Date,
		default: Date.now
	},
	// server_proxy kameraga yuklashda xatolikka uchraganda shu yerga yoziladi
	// (masalan: "Rasm yaratish muvaffaqiyatsiz: ...", "Rasm topilmadi" va h.k.)
	lastError: {
		type: String,
		default: null
	},
	lastAttemptAt: {
		type: Date,
		default: null
	},
	attempts: {
		type: Number,
		default: 0
	},
	// Har bir kamera (device IP) uchun ALOHIDA natija — bitta xodim bir
	// nechta kameraga (kirish/chiqish nuqtalari) bir vaqtda yuborilganda,
	// qaysi kamerada muvaffaqiyatli, qaysi birida xatolik bo'lganini
	// bilish uchun. server_proxy har bir urinishda shu ro'yxatni to'liq
	// yuboradi (o'sha davrda urinilgan barcha kameralar bo'yicha).
	deviceResults: [{
		device: String,
		success: Boolean,
		error: String,
		attemptedAt: {
			type: Date,
			default: Date.now
		}
	}]
})

module.exports = model('adduser', adduserSchema)

