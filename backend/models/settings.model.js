const { Schema, model } = require('mongoose')

const settingsSchema = new Schema({
	// Har bir maktab uchun bitta Settings hujjati (avval butun tizim uchun
	// yagona singleton edi)
	schoolId: {
		type: Schema.Types.ObjectId,
		ref: 'School',
		required: true,
		unique: true
	},
	entryToExitCooldownSeconds: {
		type: Number,
		default: 15,
		min: 0
	},
	exitToEntryCooldownSeconds: {
		type: Number,
		default: 5,
		min: 0
	},
	// "HH:mm" formatida — dashboard'da "Kechikdi" statistikasi shu vaqtdan
	// keyingi birinchi kirishlarni kech qolgan deb hisoblaydi
	workStartTime: {
		type: String,
		default: "09:00"
	},
	// Ota-onalarga Telegram orqali kirdi/chiqdi xabarlari (parent.service.js)
	parentNotify: {
		enabled: { type: Boolean, default: true },
		notifyIn: { type: Boolean, default: true },
		notifyOut: { type: Boolean, default: true },
		// shuncha daqiqa ichida bir xil turdagi takroriy skan uchun qayta xabar yuborilmaydi
		minGapMinutes: { type: Number, default: 3, min: 0, max: 60 }
	}
}, {
	timestamps: true
})

module.exports = model('Settings', settingsSchema)

