const { Schema, model, default: mongoose } = require('mongoose')

// Platforma darajasidagi rollar — hech qaysi maktabga bog'lanmaydi (schoolId=null)
const PLATFORM_ROLES = ['superadmin', 'monitor']

const userSchema = new Schema({
	// 'superadmin' (platforma darajasi, maktablarni boshqaradi) uchun
	// har doim null qoladi — boshqa barcha rollar uchun majburiy (pastdagi
	// validator orqali, oddiy required:true emas, chunki null ham
	// superadmin uchun to'g'ri qiymat).
	// DIQQAT: username BU maydonga qarab compound qilinmaydi — login
	// bitta umumiy sahifa orqali, username butun platformada YAGONA
	// bo'lishi shart (shu orqali tizim foydalanuvchining maktabini aniqlaydi)
	schoolId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'School',
		index: true,
		default: null,
		validate: {
			validator: function (v) {
				return PLATFORM_ROLES.includes(this.role) ? v == null : v != null
			},
			message: "schoolId faqat 'superadmin' va 'monitor' rollarida bo'sh bo'lishi mumkin"
		}
	},
	fullName: {
		type: String,
		required: true
	},
	position: {
		type: String,
		required: true,
	},
	photo: {
		type: String,
	},
	photo_camera: {
		type: Boolean,
		default: false
	},
	sinf: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Sinf',
		required: false
	},
	// 'superadmin' — platforma egasi, maktablarni yaratadi/boshqaradi, schoolId=null
	// 'monitor' — platforma darajasida FAQAT O'QISH: barcha maktablarning bugungi
	// davomati/holatini umumiy panelda ko'radi, hech narsani o'zgartira olmaydi
	// 'user' — maktab admini (o'sha maktab doirasida to'liq huquqli)
	// 'admin'/'leader'/'viewer' — maktab ichidagi quyi rollar
	role: {
		type: String,
		enum: ['superadmin', 'monitor', 'admin', 'viewer', 'leader', 'user'],
		default: 'viewer'
	},
	// 'monitor' roli uchun nazorat hududi: shu viloyat/tuman maktablarini ko'radi. Bo'sh bo'lsa (eski monitorlar) — hamma maktab
	monitorScope: {
		region: { type: String, default: '' },
		district: { type: String, default: '' }
	},
	createdBy: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: false
	},
	username: {
		type: String,
		required: false,
		unique: true,
		trim: true,
	},
	password: {
		type: String,
		required: true,
		minlength: 6,
		select: false   // parol xesh so'rovlarda default holda qaytmaydi — kerak bo'lsa .select('+password')
	},
	hodimID: {
		type: String,
		required: false,
		default: null,
		index: true   // har bir kamera kirish/chiqish hodisasida userModel.findOne({hodimID}) ishlatiladi
	},
	// JSHR (PINFL) — ixtiyoriy, faqat 'user' va 'admin' rollariga ko'rinadi
	// (user.service.js'dagi o'qish metodlarida so'rovchi roliga qarab
	// javobdan olib tashlanadi). Kiritilsa, 14 xonali raqam bo'lishi shart.
	jshr: {
		type: String,
		required: false,
		default: null,
		validate: {
			validator: (v) => !v || /^\d{14}$/.test(v),
			message: "JSHR 14 xonali raqamdan iborat bo'lishi kerak"
		}
	},
	lavel: {
		type: Number,
		required: false,
	},
	birthday: {
		type: Date
	},
	phone_personal: {
		type: String
	},
	phone_work: {
		type: String
	},
	isEdit: {
		type: Boolean,
		default: false
	},
	isActive: {
		type: Boolean,
		default: true
	}
}, {
	timestamps: true
})

module.exports = mongoose.model('User', userSchema)

