const { Schema, model, default: mongoose } = require('mongoose')
const ref = (name, extra = {}) => ({ type: mongoose.Schema.Types.ObjectId, ref: name, ...extra })

// Ota-ona (vasiy) Telegram orqali o'quvchiga ulangan. Bir ota-ona bir nechta farzandga, bir o'quvchi bir nechta ota-onaga ulanishi mumkin
const parentLinkSchema = new Schema({
	schoolId: ref('School', { required: true, index: true }),
	student: ref('Student', { required: true }),
	sinf: ref('Sinf', { default: null }),
	chatId: { type: String, required: true },
	telegramUserId: { type: String, default: '' },
	firstName: { type: String, default: '' },
	lastName: { type: String, default: '' },
	username: { type: String, default: '' },
	phone: { type: String, default: '' },
	// qanday ulangan: phone — telefon raqami o'quvchi kartasidagi bilan mos; invite — o'quvchiga maxsus havola; admin — admin qo'lda biriktirgan
	via: { type: String, enum: ['phone', 'invite', 'admin'], default: 'invite' },
	active: { type: Boolean, default: true }, // admin yoki ota-ona o'chirgan bo'lsa false
	paused: { type: Boolean, default: false }, // ota-ona /stop bosgan
	blocked: { type: Boolean, default: false }, // ota-ona botni bloklagan (Telegram 403)
	notifyIn: { type: Boolean, default: true },
	notifyOut: { type: Boolean, default: true },
	lastSentAt: { type: Date, default: null },
	// admin o'chirgan/olib tashlagan ulanish: ota-ona havola yoki telefon orqali o'zi qayta yoqa olmaydi (faqat admin qayta yoqadi)
	disabledByAdmin: { type: Boolean, default: false },
	// ota-ona shu farzand xabarlarini vaqtincha o'chirgan (jim rejim) va tinch soatlar (HH:MM, Asia/Tashkent)
	mutedUntil: { type: Date, default: null },
	quietFrom: { type: String, default: '' },
	quietTo: { type: String, default: '' },
	lang: { type: String, enum: ['uz', 'uz-cyrl', 'ru', 'en', null], default: null }
}, { timestamps: true })
parentLinkSchema.index({ student: 1, chatId: 1 }, { unique: true })
parentLinkSchema.index({ chatId: 1 })

// Ro'yxatga olish havolasi: student=null — butun maktab uchun (telefon raqami bilan tasdiqlanadi), aks holda bitta o'quvchi uchun
const parentInviteSchema = new Schema({
	schoolId: ref('School', { required: true, index: true }),
	token: { type: String, required: true, unique: true },
	student: ref('Student', { default: null }),
	createdBy: ref('User', { default: null }),
	expiresAt: { type: Date, default: null }, // null — muddatsiz
	maxUses: { type: Number, default: 0 }, // 0 — cheksiz
	uses: { type: Number, default: 0 },
	active: { type: Boolean, default: true }
}, { timestamps: true })

// Telefon raqami maktab ro'yxatidan topilmagan ota-ona so'rovi: admin qo'lda biriktiradi yoki rad etadi
const parentRequestSchema = new Schema({
	schoolId: ref('School', { required: true, index: true }),
	chatId: { type: String, required: true },
	telegramUserId: { type: String, default: '' },
	firstName: { type: String, default: '' },
	lastName: { type: String, default: '' },
	username: { type: String, default: '' },
	phone: { type: String, default: '' },
	status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
	student: ref('Student', { default: null }),
	// unmatched — telefon topilmadi; disabled — admin o'chirgan ulanishga qayta ulanishga urinish
	kind: { type: String, enum: ['unmatched', 'disabled'], default: 'unmatched' },
	note: { type: String, default: '' }
}, { timestamps: true })
parentRequestSchema.index({ schoolId: 1, status: 1, createdAt: -1 })

// Yuborilgan (yoki yuborilmagan) xabarlar jurnali; 30 kundan keyin o'chadi
const parentNotificationSchema = new Schema({
	schoolId: ref('School', { required: true, index: true }),
	student: ref('Student', { required: true }),
	guardian: ref('ParentLink', { default: null }),
	chatId: { type: String, default: '' },
	kind: { type: String, enum: ['in', 'out', 'test', 'absent', 'digest', 'held'], required: true },
	eventTime: { type: Date, default: null },
	status: { type: String, enum: ['sent', 'failed', 'skipped', 'blocked'], required: true },
	error: { type: String, default: '' },
	createdAt: { type: Date, default: Date.now }
})
parentNotificationSchema.index({ schoolId: 1, createdAt: -1 })
parentNotificationSchema.index({ schoolId: 1, status: 1, createdAt: -1 })
parentNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 })

// "Kelmadi" xabariga ota-ona javobi (sabab): admin tasdiqlasa StudentExcuse yaratiladi
const parentAbsenceReportSchema = new Schema({
	schoolId: ref('School', { required: true }),
	student: ref('Student', { required: true }),
	sinf: ref('Sinf', { default: null }),
	chatId: { type: String, required: true },
	dateFrom: { type: String, required: true }, // YYYY-MM-DD
	dateTo: { type: String, required: true },
	type: { type: String, enum: ['kasallik', 'oilaviy', 'boshqa'], default: 'boshqa' },
	comment: { type: String, default: '' },
	status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
	decidedBy: ref('User', { default: null })
}, { timestamps: true })
parentAbsenceReportSchema.index({ schoolId: 1, status: 1, createdAt: -1 })

// "Kelmadi" xabari kuniga bir marta (o'quvchi + chat + sana) yuborilishi uchun dedupe yozuvi
const parentAbsentAlertSchema = new Schema({
	schoolId: ref('School', { required: true }),
	student: ref('Student', { required: true }),
	chatId: { type: String, required: true },
	dateString: { type: String, required: true },
	responded: { type: Boolean, default: false },
	createdAt: { type: Date, default: Date.now }
})
parentAbsentAlertSchema.index({ student: 1, chatId: 1, dateString: 1 }, { unique: true })
parentAbsentAlertSchema.index({ createdAt: 1 }, { expireAfterSeconds: 45 * 24 * 3600 })

// Tinch soatlarda kelgan xabarlar: oyna tugagach bitta jamlangan xabar bo'lib yuboriladi
const parentHoldSchema = new Schema({
	schoolId: ref('School', { required: true }),
	student: ref('Student', { default: null }),
	guardian: ref('ParentLink', { default: null }),
	chatId: { type: String, required: true },
	kind: { type: String, default: 'in' },
	text: { type: String, required: true },
	eventTime: { type: Date, default: Date.now },
	releaseAt: { type: Date, required: true, index: true },
	createdAt: { type: Date, default: Date.now }
})
parentHoldSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3 * 24 * 3600 })

module.exports = {
	ParentAbsenceReport: model('ParentAbsenceReport', parentAbsenceReportSchema),
	ParentAbsentAlert: model('ParentAbsentAlert', parentAbsentAlertSchema),
	ParentHold: model('ParentHold', parentHoldSchema),
	ParentLink: model('ParentLink', parentLinkSchema),
	ParentInvite: model('ParentInvite', parentInviteSchema),
	ParentRequest: model('ParentRequest', parentRequestSchema),
	ParentNotification: model('ParentNotification', parentNotificationSchema)
}

