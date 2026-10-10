const { Schema, model } = require('mongoose')

// TUMAN serverida: viloyat serveriga beriladigan federatsiya (faqat o'qish) API kaliti.
// Kalit ochiq matnda SAQLANMAYDI: faqat sha256 hash. To'liq kalit yaratilganda bir marta ko'rsatiladi: fk_<prefix>.<secret>
const federationKeySchema = new Schema({
	name: { type: String, required: true, trim: true, maxlength: 80 },
	prefix: { type: String, required: true, unique: true, index: true },
	keyHash: { type: String, required: true, select: false },
	active: { type: Boolean, default: true },
	expiresAt: { type: Date, default: null },
	// Bo'sh bo'lsa istalgan IP; to'ldirilsa faqat shu IP'lardan (viloyat serveri manzillari)
	allowedIps: { type: [String], default: [] },
	// Daqiqada nechta so'rov (suiiste'molga qarshi)
	ratePerMin: { type: Number, default: 1200 },
	lastUsedAt: { type: Date, default: null },
	lastUsedIp: { type: String, default: '' },
	createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true })

module.exports = model('FederationKey', federationKeySchema)
