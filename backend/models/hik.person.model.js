const { Schema, model, default: mongoose } = require('mongoose')

// Hik-Connect bulutidagi shaxs (person) bilan bizning xodim/o'quvchi o'rtasidagi bog'lanish.
// Bulut shaxsga o'zining personId'sini beradi; yuz aniqlash hodisalarida (humanId) shu personId yoki personCode keladi,
// shuning uchun hodisadan xodim/o'quvchini topishda shu jadval ishlatiladi.
const hikPersonSchema = new Schema({
	schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
	accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'HikAccount', required: true },
	// bizning identifikator: xodimda hodimID, o'quvchida studentIdNumber
	hodimID: { type: String, required: true },
	kind: { type: String, enum: ['user', 'student'], default: 'user' },
	personId: { type: String, required: true },
	personCode: { type: String, required: true },
	groupId: { type: String, default: '' },
	name: { type: String, default: '' },
	// Yuborilgan rasmning belgisi: rasm o'zgarmagan bo'lsa qayta yuklanmaydi
	photoHash: { type: String, default: null },
	accessLevelId: { type: String, default: null },
	syncedAt: { type: Date, default: Date.now }
}, { timestamps: true })

hikPersonSchema.index({ schoolId: 1, hodimID: 1 }, { unique: true })
hikPersonSchema.index({ accountId: 1, personId: 1 })
hikPersonSchema.index({ accountId: 1, personCode: 1 })

module.exports = model('HikPerson', hikPersonSchema)
