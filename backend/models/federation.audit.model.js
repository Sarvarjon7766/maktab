const { Schema, model } = require('mongoose')

// TUMAN serverida: federatsiya API'siga qilingan so'rovlar jurnali (kim, nima, qachon). 30 kundan keyin o'zi o'chadi.
const federationAuditSchema = new Schema({
	key: { type: Schema.Types.ObjectId, ref: 'FederationKey', index: true },
	keyName: { type: String, default: '' },
	method: { type: String, default: 'GET' },
	path: { type: String, default: '' },
	status: { type: Number, default: 0 },
	ms: { type: Number, default: 0 },
	ip: { type: String, default: '' },
	at: { type: Date, default: Date.now, expires: 30 * 24 * 3600 }
})

module.exports = model('FederationAudit', federationAuditSchema)
