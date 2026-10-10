const { Schema, model, default: mongoose } = require('mongoose')

// attandance.model.js (xodim) bilan bir xil shakl, faqat `student` bilan —
// ATAYLAB alohida kolleksiya (polimorfik unifikatsiya emas), chunki mavjud
// xodim-davomat kodi (dashboard/tahlil/tabel) chuqur `user: ref User`ga
// bog'langan — buni qayta yozish yuqori xavfli, foyda bermaydi
const studentAttendanceSchema = new Schema({
	schoolId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'School',
		required: true
	},
	student: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Student',
		required: true
	},
	date: {
		type: Date,
		required: true
	},
	dateString: {
		type: String,
		required: true
	},
	status: {
		type: String,
		enum: ['ishda', 'tashqarida', 'kelmagan'],
		default: 'ishda'
	},
	totalTime: {
		type: String,
		default: '0:00'
	},
	totalEntries: {
		type: Number,
		default: 0
	},
	createdBy: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: false
	}
}, {
	timestamps: true
})

studentAttendanceSchema.index({ student: 1, dateString: 1 }, { unique: true })
// qoplovchi indeks: maktab/sana/holat bo'yicha o'quvchi kesimidagi hisoblar hujjatni o'qimasdan indeksdan bajariladi
studentAttendanceSchema.index({ schoolId: 1, dateString: 1, status: 1, student: 1 })

module.exports = model('StudentAttendance', studentAttendanceSchema)

