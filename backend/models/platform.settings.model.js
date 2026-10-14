const { Schema, model } = require('mongoose')

// Butun platforma uchun BITTA singleton hujjat (schoolId yo'q — hech qaysi
// maktabga bog'lanmagan). Avval bu ma'lumotlar .env'da qattiq yozilgan edi
// (PLATFORM_NAME/SUPPORT_PHONE) — endi superadmin tahrirlay oladi, birinchi
// o'qishda .env qiymatlaridan avtomatik yaratiladi (platform.settings.service.js)
const platformSettingsSchema = new Schema({
	platformName: {
		type: String,
		default: 'FaceID'
	},
	supportPhone: {
		type: String,
		default: ''
	},
	// Ota-onalar Telegram boti: token shifrlangan (utils/secretBox) holda saqlanadi, faqat tizim egasi (superadmin) kiritadi
	telegramBotToken: { type: String, default: '', select: false },
	telegramBotUsername: { type: String, default: '' },
	// AI sozlamalari (services/ai.settings.service.js tekshirib yozadi; model bo'lmasa strict rejim saqlamaydi)
	ai: { type: Schema.Types.Mixed, default: undefined },
	// Aqlli kuzatuv isbotlari va kamera hodisalarini saqlash muddati (kun); muddat o'tgach rasm/lavhalar avtomatik o'chadi (services/retention.service.js)
	retention: {
		alertDays: { type: Number, default: 14 },   // muhim hodisalar
		sampleDays: { type: Number, default: 5 },   // avtomatik namuna kadrlari
		eventDays: { type: Number, default: 30 },   // qolgan kamera hodisalari
		metricDays: { type: Number, default: 30 }   // odam soni o'lchovlari
	}
}, {
	timestamps: true
})

module.exports = model('PlatformSettings', platformSettingsSchema)
