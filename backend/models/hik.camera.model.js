const { Schema, model, default: mongoose } = require('mongoose')

// Hik-Connect akkauntidan sinxronlangan KAMERA. Oddiy `camera` modelidan ATAYLAB
// alohida: u LAN'dagi IP/login/parol bilan ishlaydi, bu esa bulutdan keladi.
// `schoolId=null` — hech qaysi maktabga biriktirilmagan. Kamera faqat BITTA
// maktabga biriktirilishi mumkin; biriktirilgach shu maktabning Kameralar
// qismida ko'rinadi, boshqa maktablar uchun band hisoblanadi.
const hikCameraSchema = new Schema({
	accountId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'HikAccount',
		required: true,
		index: true
	},
	schoolId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'School',
		default: null,
		index: true
	},
	// Hik resource id (jonli ko'rish shu id bilan so'raladi)
	cameraId: {
		type: String,
		required: true,
		trim: true
	},
	// Kamera biriktirilgan qurilma (NVR/DVR/kamera) serial raqami
	serial: { type: String, default: '' },
	// Qurilmadagi kanal raqami (NVR'da har kamera alohida kanal). Kadr (capturePic) shu kanaldan olinadi
	channelNo: { type: Number, default: 1 },
	name: { type: String, default: '' },
	areaName: { type: String, default: '' },
	online: { type: Boolean, default: null },
	// Oxirgi marta bulut online deb qaytargan vaqt
	lastSeenAt: { type: Date, default: null },
	// Bulut "online" desa ham qurilma jonli ko'rishda offline chiqqan vaqt: tekshiruv muvaffaqiyatli bo'lguncha offline hisoblanadi
	offlineSince: { type: Date, default: null },
	// Oxirgi muvaffaqiyatli sinxronlash vaqti (kamera ro'yxatda ko'ringan)
	syncedAt: { type: Date, default: null },
	// Sinxronlashda bulut ro'yxatida topilmasa false (o'chirilgan/ajratilgan)
	inCloud: { type: Boolean, default: true },
	// Maktab admini belgilaydi: 'monitor' — oddiy kuzatuv kamerasi, 'in'/'out' — FaceControl
	// (yuz aniqlash) kirish/chiqish kamerasi
	// Turlar: 'monitor' — sinfxona kamerasi (AI: odam sanash, faollik), 'hall' — zal kamerasi (AI: zichlik, tartibsizlik),
	// 'in'/'out' — FaceControl kirish/chiqish (yuz taniydi); ularning joyi `zone`: 'door' — oddiy eshik, 'gate' — maktab darvozasi
	role: { type: String, enum: ['monitor', 'in', 'out', 'hall'], default: 'monitor' },
	zone: { type: String, enum: ['door', 'gate'], default: 'door' },
	// Zal kamerasida shuncha odamdan ko'pi "zich" hisoblanadi (bo'sh bo'lsa standart: VISION_HALL_CROWD yoki 40)
	capacity: { type: Number, default: null },
	// Kamera qaysi sinfga tegishli (ixtiyoriy)
	sinfId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sinf', default: null },
	// Yoqilsa, shu kamerada aniqlangan shaxs avtomatik davomatga yoziladi (standart: o'chiq)
	autoAttendance: { type: Boolean, default: false },
	// Yoqilsa, kameradan olingan kadrda odamlar soni sanaladi (yuz tanilmaydi, faqat son). Standart: o'chiq
	visionEnabled: { type: Boolean, default: false },
	lastEventAt: { type: Date, default: null },
	assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
	assignedAt: { type: Date, default: null }
}, {
	timestamps: true
})

// schoolId indeksga kiritilgan: bitta kamerani sinov uchun bir necha maktabda ko'rsatish mumkin (odatda kamera bitta maktabga biriktiriladi)
hikCameraSchema.index({ accountId: 1, cameraId: 1, schoolId: 1 }, { unique: true })
hikCameraSchema.index({ inCloud: 1, schoolId: 1, role: 1, accountId: 1 })

module.exports = model('HikCamera', hikCameraSchema)
