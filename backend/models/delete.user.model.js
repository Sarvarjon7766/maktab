const { model, Schema } = require('mongoose')

const deleteuserSchema = new Schema({
	schoolId: {
		type: Schema.Types.ObjectId,
		ref: 'School',
		index: true,
		required: true
	},
	action: {
		type: String,
		required: true,
		default: 'delete'
	},
	full_name: {
		type: String,
		required: true
	},
	// Xodim yozuvi uchun majburiy; o'quvchi yozuvlarida studentId ishlatiladi
	userId: {
		type: Schema.Types.ObjectId,
		required: function () { return this.kind !== 'student' },
		ref: 'User'
	},
	kind: {
		type: String,
		enum: ['user', 'student'],
		default: 'user'
	},
	studentId: {
		type: Schema.Types.ObjectId,
		ref: 'Student',
		default: null
	},
	hodimID: {
		type: String,
		required: true
	},
	photo: String,
	createdAt: {
		type: Date,
		default: Date.now
	},
	// Hik-Connect'dan o'chirish urinishlari (xato bo'lsa kutib qayta uriniladi)
	attempts: { type: Number, default: 0 },
	lastAttemptAt: { type: Date, default: null },
	lastError: { type: String, default: null }
})

module.exports = model('deleteuser', deleteuserSchema)

