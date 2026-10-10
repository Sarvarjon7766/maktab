const { Schema, model, default: mongoose } = require('mongoose')

// Har bir maktab uchun bitta hujjat. server_proxy (kamera xizmati) shu
// hujjatdagi apiTokenHash orqali aniqlanadi — server_proxy'dan kelgan HAR
// BIR so'rov shu tokenni Authorization header'ida xom holda yuboradi
// (Bearer prefiksisiz), resolveSchoolProxyToken middleware'i uni SHA-256
// bilan xeshlab shu maydon bo'yicha qidiradi.
const schoolSchema = new Schema({
	name: {
		type: String,
		required: true,
		trim: true
	},
	// Qisqa, inson o'qiy oladigan identifikator (log/URL uchun) — foydalanuvchiga ko'rsatilmaydi
	code: {
		type: String,
		required: true,
		unique: true,
		trim: true
	},
	region: {
		type: String,
		default: ''
	},
	district: {
		type: String,
		default: ''
	},
	// Maktab joylashuvi (xarita uchun): maktab admini o'z panelidan belgilaydi
	location: {
		lat: { type: Number, default: null },
		lng: { type: Number, default: null },
		address: { type: String, default: '', trim: true },
		updatedAt: { type: Date, default: null },
		updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
	},
	// Maktab joylashuvi (xarita uchun): maktab admini o'z panelidan belgilaydi
	location: {
		lat: { type: Number, default: null },
		lng: { type: Number, default: null },
		address: { type: String, default: '', trim: true },
		updatedAt: { type: Date, default: null },
		updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
	},
	phone: {
		type: String,
		default: ''
	},
	itCenter: {
		type: String,
		default: ''
	},
	logoPath: {
		type: String,
		default: null
	},
	isActive: {
		type: Boolean,
		default: true
	},
	// SHA-256(xom token) — bcrypt EMAS, chunki resolveSchoolProxyToken bu
	// maydon bo'yicha to'g'ridan-to'g'ri indekslangan qidiruv qiladi
	// (School.findOne({apiTokenHash})), bcrypt bunga mos emas
	apiTokenHash: {
		type: String,
		select: false,
		index: true,
		unique: true,
		sparse: true
	},
	// Xom tokenning birinchi belgilari — UI'da "qaysi token ekanini"
	// eslash uchun (to'liq token faqat yaratilgan/yangilangan paytda
	// BIR MARTA ko'rsatiladi, keyin hech qachon qayta ochilmaydi)
	apiTokenPrefix: {
		type: String,
		default: null
	},
	apiTokenRotatedAt: {
		type: Date,
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

module.exports = model('School', schoolSchema)
