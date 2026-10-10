const { model, Schema } = require('mongoose')

const cameraSchema = new Schema({
	schoolId: {
		type: Schema.Types.ObjectId,
		ref: 'School',
		index: true,
		required: true
	},
	name: {
		type: String,
		required: true,
	},
	user: {
		type: String,
		required: true
	},
	password: {
		type: String,
		required: true,
		select: false   // kamera admin paroli — faqat aniq .select('+password') so'ralganda qaytadi
	},
	cameraIp: {
		type: String,
		required: true
	},
	port: {
		type: Number,
		default: 80
	},
	// Oddiy (FaceID-brendsiz) RTSP kameralar uchun — to'ldirilsa, bu kamera
	// o'zi yuzni aniqlay olmaydi deb hisoblanadi, shu URL orqali video oqimi
	// olinib, serverning o'zida yuz aniqlash/tanish ishlatiladi (FaceID/
	// Hikvision kameralari esa buni qurilmaning o'zida qiladi, faqat
	// hodisani cameraIp/user/password orqali xabar qiladi)
	rtspUrl: {
		type: String,
		default: ''
	},
	// server_proxy'dagi device_meta bilan mos (kirish/chiqish nuqtasi belgilari)
	qayer: { type: String, default: '' },
	where: { type: String, default: '' },
	joy: { type: String, default: '' },
	// server_proxy davriy heartbeat orqali yangilaydi
	online: {
		type: Boolean,
		default: null
	},
	lastSeenAt: {
		type: Date,
		default: null
	},
	lastStatusError: {
		type: String,
		default: null
	}
})

// Bitta IP'ga bir nechta kamera hujjati yaratilib qolmasin — updateStatus()
// cameraIp bo'yicha updateMany qiladi, ikkita hujjat bo'lsa ikkalasi ham
// (aslida bitta qurilmaga tegishli bo'lsa-da) yangilanib, holat noaniq bo'lardi.
// schoolId bilan compound — turli maktablarning lokal tarmog'ida bir xil
// IP (masalan 192.168.1.64) takrorlanishi mumkin
cameraSchema.index({ schoolId: 1, cameraIp: 1 }, { unique: true })

module.exports = model('camera', cameraSchema)
