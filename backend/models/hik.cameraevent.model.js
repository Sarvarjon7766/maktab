const { Schema, model, default: mongoose } = require('mongoose')

// Sinfxona/xona kameralaridan kelgan tahliliy hodisalar (harakat, odam zichligi,
// odamlar soni g'ayritabiiy, hudud kirish/chiqish). Yuz aniqlash hodisalari alohida (HikFaceEvent)
const hikCameraEventSchema = new Schema({
	schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
	accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'HikAccount', required: true },
	camera: { type: mongoose.Schema.Types.ObjectId, ref: 'HikCamera', required: true, index: true },
	sinfId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sinf', default: null },
	guid: { type: String, required: true },
	eventType: { type: Number, required: true },
	// motion | density | people | enter | exit | multi
	kind: { type: String, required: true },
	time: { type: Date, required: true },
	// Aniqlangan lahzadagi kadr (private/hik-events/<id>.jpg) va uning vaqti
	snapshot: { type: String, default: null },
	snapshotAt: { type: Date, default: null },
	// Sun'iy intellekt avtomatik saqlagan isbot (kind: vision_*): sabab sarlavhasi, tafsiloti, odam soni va qisqa lavha
	title: { type: String, default: '' },
	detail: { type: String, default: '' },
	count: { type: Number, default: null },
	clip: { type: String, default: null },
	// Sun'iy intellekt avtomatik saqlagan isbot (kind: vision_*): sabab sarlavhasi, tafsiloti, odam soni va qisqa lavha
	title: { type: String, default: '' },
	detail: { type: String, default: '' },
	count: { type: Number, default: null },
	clip: { type: String, default: null },
	hour: { type: Number, required: true },
	dateString: { type: String, required: true }
}, { timestamps: true })
hikCameraEventSchema.index({ schoolId: 1, kind: 1, time: -1 })
hikCameraEventSchema.index({ kind: 1, time: -1 })

hikCameraEventSchema.index({ accountId: 1, guid: 1 }, { unique: true })
hikCameraEventSchema.index({ schoolId: 1, dateString: 1, camera: 1 })

module.exports = model('HikCameraEvent', hikCameraEventSchema)
