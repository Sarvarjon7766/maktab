const { Schema, model, default: mongoose } = require('mongoose')

// O'quvchi — xodim (User)dan ataylab farqli: login ma'lumotlari
// (username/password/role) yo'q, chunki o'quvchi tizimga o'zi kirmaydi.
// Kamera hodisasini aniqlash uchun studentIdNumber ishlatiladi — User.hodimID
// bilan bir xil naqsh (= o'z _id, checkInAttendance shu bo'yicha izlaydi).
const studentSchema = new Schema({
	schoolId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'School',
		index: true,
		required: true
	},
	fullName: {
		type: String,
		required: true
	},
	sinf: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Sinf',
		required: true
	},
	studentIdNumber: {
		type: String,
		default: null,
		index: true   // kamera hodisasida Student.findOne({studentIdNumber, schoolId}) ishlatiladi
	},
	birthday: {
		type: Date
	},
	gender: {
		type: String,
		enum: ['erkak', 'ayol', null],
		default: null
	},
	parentName: {
		type: String,
		default: null
	},
	parentPhone: {
		type: String,
		default: null
	},
	// parentPhone ning normallashgan kaliti (oxirgi 9 raqam): Telegram botda tez qidirish uchun. Qo'lda yozilmaydi, hook'lar yuritadi
	parentPhoneKey: {
		type: String
	},
	photo: {
		type: String
	},
	photo_camera: {
		type: Boolean,
		default: false
	},
	isActive: {
		type: Boolean,
		default: true
	},
	createdBy: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: false
	}
}, {
	timestamps: true
})

studentSchema.index({ schoolId: 1, studentIdNumber: 1 }, { unique: true, sparse: true })
studentSchema.index({ schoolId: 1, parentPhoneKey: 1 })

// ---- parentPhoneKey yuritish (saqlash / yangilash / ommaviy qo'shishda) ----
const phoneKeyOf = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : '' }
// Yangilash obyektiga parentPhone o'zgarsa parentPhoneKey qo'shadi; o'zgarmasa tegmaydi
function applyKeyToUpdate(u) {
	if (!u || typeof u !== 'object') return u
	const set = u.$set || {}
	const has = (o) => o && Object.prototype.hasOwnProperty.call(o, 'parentPhone')
	if (has(set)) return { ...u, $set: { ...set, parentPhoneKey: phoneKeyOf(set.parentPhone) } }
	if (has(u)) return { ...u, parentPhoneKey: phoneKeyOf(u.parentPhone) }
	if (u.$unset && has(u.$unset)) return { ...u, $set: { ...set, parentPhoneKey: '' } }
	return u
}
studentSchema.pre('validate', function () {
	if (this.isNew || this.isModified('parentPhone')) this.parentPhoneKey = phoneKeyOf(this.parentPhone)
})
for (const op of ['findOneAndUpdate', 'updateOne', 'updateMany']) {
	studentSchema.pre(op, function () {
		const u = this.getUpdate()
		const next = applyKeyToUpdate(u)
		if (next !== u) this.setUpdate(next)
	})
}
studentSchema.pre('insertMany', function (next, docs) {
	for (const d of Array.isArray(docs) ? docs : []) { if (d && typeof d === 'object') d.parentPhoneKey = phoneKeyOf(d.parentPhone) }
	next()
})

module.exports = model('Student', studentSchema)
module.exports.phoneKeyOf = phoneKeyOf
module.exports.applyKeyToUpdate = applyKeyToUpdate

