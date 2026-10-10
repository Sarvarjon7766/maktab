const { Schema, model, default: mongoose } = require('mongoose')

// attandance.log.model.js (xodim) bilan bir xil shakl, faqat `student`
// bilan — mobil-only maydonlar (checkInLocation/checkInPhoto/...) bu yerga
// ATAYLAB qo'shilmagan, chunki bu yangi model va mobil ilova umuman yo'q
const studentAttendanceLogSchema = new Schema({
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
	checkin: {
		type: Boolean,
		required: false
	},
	checkout: {
		type: Boolean,
		required: false
	},
	checkInTime: {
		type: Date,
		required: false
	},
	checkOutTime: {
		type: Date,
		required: false
	},
	comment: {
		type: String,
		default: null
	},
	createdBy: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: false
	}
}, {
	timestamps: true
})

studentAttendanceLogSchema.index({ student: 1, date: -1 })
// qoplovchi indeks: kech qolish/kelish vaqti hisoblari hujjatni o'qimasdan indeksdan bajariladi
studentAttendanceLogSchema.index({ schoolId: 1, dateString: 1, checkin: 1, student: 1, checkInTime: 1 })
studentAttendanceLogSchema.index({ checkin: 1, checkout: 1 })
// Tahlil so'rovlari uchun: kun/maktab bo'yicha birinchi kirish vaqti (index-only)
studentAttendanceLogSchema.index({ schoolId: 1, dateString: 1, checkin: 1, checkInTime: 1, student: 1 })
studentAttendanceLogSchema.index({ dateString: 1, checkin: 1, checkInTime: 1, schoolId: 1, student: 1 })

module.exports = model('StudentAttendanceLog', studentAttendanceLogSchema)

