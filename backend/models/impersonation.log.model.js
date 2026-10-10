const { Schema, model, default: mongoose } = require('mongoose')

// Superadmin biror maktab kontekstiga "nazorat qilish" (view-as) orqali
// kirganda yoziladi — bu maktabning shaxsiy ma'lumotlariga (xodim/o'quvchi)
// tashqi kirish bo'lgani uchun audit iz sifatida saqlanadi
const impersonationLogSchema = new Schema({
	school: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'School',
		required: true,
		index: true
	},
	superadmin: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true
	},
	superadminUsername: {
		type: String,
		required: true
	},
	impersonatedUser: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User'
	}
}, {
	timestamps: true
})

module.exports = model('ImpersonationLog', impersonationLogSchema)
