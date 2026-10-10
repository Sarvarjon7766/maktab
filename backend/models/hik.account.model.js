const { Schema, model } = require('mongoose')

// Hik-Connect for Teams akkaunti (API Key/Secret). Tizim egasi bir nechta akkaunt
// qo'sha oladi; akkauntdagi kameralar maktablarga (bitta kamera — bitta maktab)
// alohida biriktiriladi. Key va secret AES bilan shifrlangan, select:false —
// frontendga hech qachon qaytmaydi.
const hikAccountSchema = new Schema({
	name: { type: String, required: true, trim: true },
	server: { type: String, default: '' },
	appKeyHint: { type: String, default: '' },
	// SHA-256(appKey) — bir xil akkaunt ikki marta qo'shilmasligi uchun
	appKeyHash: { type: String, required: true, unique: true, select: false },
	appKey: { type: String, required: true, select: false },
	secretKey: { type: String, required: true, select: false },
	encryptionCode: { type: String, select: false },
	lastSyncAt: { type: Date, default: null },
	lastSyncError: { type: String, default: null }
}, {
	timestamps: true
})

module.exports = model('HikAccount', hikAccountSchema)
