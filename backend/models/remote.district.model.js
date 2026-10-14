const { Schema, model } = require('mongoose')

// VILOYAT serverida: ulangan tuman serverlari reestri. API kalit AES-256-GCM bilan shifrlangan holda saqlanadi (utils/secretBox).
const remoteDistrictSchema = new Schema({
	name: { type: String, required: true, trim: true, maxlength: 120 }, // tuman nomi (maktablardagi `district` bilan bir xil)
	region: { type: String, default: '', trim: true, maxlength: 120 },
	baseUrl: { type: String, required: true, trim: true }, // https://tuman.example.uz
	apiKeyEnc: { type: String, required: true, select: false },
	apiKeyHint: { type: String, default: '' }, // kalitning oxirgi 4 belgisi (ko'rsatish uchun)
	active: { type: Boolean, default: true },
	lastOkAt: { type: Date, default: null },
	lastError: { type: String, default: '' },
	lastErrorAt: { type: Date, default: null },
	schools: { type: Number, default: 0 },
	districts: { type: [String], default: [] }, // tuman serveri xizmat qiladigan tumanlar nomi (/ping javobidan): hudud bo'yicha monitorlar va ?district= filtri shunga tayanadi
	version: { type: String, default: '' }
}, { timestamps: true })

remoteDistrictSchema.index({ name: 1 }, { unique: true })

module.exports = model('RemoteDistrict', remoteDistrictSchema)
