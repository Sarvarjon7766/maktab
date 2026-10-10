const { Schema, model, default: mongoose } = require('mongoose')

// Hik-Connect'dan kelgan yuz aniqlash (Face Recognition, 10018) hodisasi. Kamera
// qurilmaning O'Z yuz kutubxonasi bilan solishtiradi; bulut bizga aniqlangan
// shaxsning humanId/humanName va o'xshashlik darajasini beradi.
const hikEventSchema = new Schema({
	schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
	accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'HikAccount', required: true },
	camera: { type: mongoose.Schema.Types.ObjectId, ref: 'HikCamera', required: true, index: true },
	// Hik alarm guid — bir xil hodisa qayta kelsa ikki marta yozilmasligi uchun
	guid: { type: String, required: true },
	direction: { type: String, enum: ['in', 'out'], required: true },
	humanId: { type: String, default: '' },
	humanName: { type: String, default: '' },
	similarity: { type: Number, default: null },
	threshold: { type: Number, default: null },
	faceLibName: { type: String, default: '' },
	// humanId bo'yicha bazadan topilgan shaxs
	personType: { type: String, enum: ['student', 'staff', null], default: null },
	student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
	personName: { type: String, default: '' },
	sinf: { type: mongoose.Schema.Types.ObjectId, ref: 'Sinf', default: null },
	// Davomatga yozildimi (kamerada autoAttendance yoqilgan bo'lsa)
	recorded: { type: Boolean, default: false },
	note: { type: String, default: '' },
	time: { type: Date, required: true },
	dateString: { type: String, required: true }
}, { timestamps: true })

hikEventSchema.index({ accountId: 1, guid: 1 }, { unique: true })
hikEventSchema.index({ schoolId: 1, dateString: 1, time: -1 })

module.exports = model('HikFaceEvent', hikEventSchema)
